/**
 * Balance queries against the Protocom official API's usage endpoint, with a
 * 60-second per-group cache and a fenced Fetch surface the settings page polls.
 * Quota-limited and subscription/wallet deployments answer with different
 * shapes; both normalize into {@link GroupBalance}. The billing-rate endpoint
 * is absent on simple deployments, so its failure is never fatal.
 *
 * The HTTP surface is a Host `connection.fetch` route, not a self-registered
 * `webServer` exact route. Reachability is entirely the active carrier's
 * policy: the Web carrier applies the Host/Origin fence plus browser
 * authentication before dispatching here, while the desktop and webworker
 * carriers serve `/api/*` directly over their IPC channel, which is their own
 * trust boundary. This handler therefore implements no authorization of its own
 * and never inspects the peer address.
 *
 * @module dsh-protocom-api/balance
 */
import { attributionHeaders, LlmError } from '@deepseek-ai/dsh-llm';
import { normalizeUsage, parseRateMultiplier } from "./balance-view.js";
export { parseBalanceView, parseRateMultiplier } from "./balance-view.js";
const RATE_MULTIPLIER_PATH = '/v1/sub2api/billing';
/**
 * How long one group's failure keeps the next caller from hitting the upstream
 * again. Successes are cached for {@link BalanceService.TTL_MS}; failures are
 * not, so without this a deployment whose upstream is down would issue a fresh
 * request per poll (and the fan-out multiplied that). The window is short
 * enough that a repaired key recovers promptly, and
 * {@link BalanceService.invalidate} clears it outright.
 */
export const BALANCE_FAILURE_BACKOFF_MS = 5_000;
/**
 * Normalize one `/v1/usage` reply, refusing a body that is not an object.
 * @throws LlmError code `BALANCE_FAILED` for a non-object reply.
 */
export function parseUsage(body) {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        throw new LlmError('the usage endpoint did not answer with an object', 'BALANCE_FAILED');
    }
    return normalizeUsage(body);
}
function cacheKey(key, includeRates) {
    return `${key}|${includeRates ? 'rates' : 'plain'}`;
}
/** Per-group balance queries with a 60-second cache and a bounded failure backoff. */
export class BalanceService {
    hooks;
    /** Cache lifetime for one group's balance. */
    static TTL_MS = 60_000;
    cache = new Map();
    failedAt = new Map();
    constructor(hooks) {
        this.hooks = hooks;
    }
    /** Forget every cached balance (a configuration change may alter any group). */
    invalidate() {
        this.cache.clear();
        this.failedAt.clear();
    }
    /**
     * One group's balance, served from cache while fresh.
     * @param key - the group to query.
     * @param includeRates - whether to also read the optional billing-rate endpoint.
     */
    balance(key, includeRates = false) {
        const options = this.hooks.options();
        const group = options.groups.get(key);
        if (group === undefined || !group.enabled) {
            return Promise.reject(new LlmError(`protocom-api: group "${key}" is not enabled`, 'BALANCE_FAILED'));
        }
        const entryKey = cacheKey(key, includeRates);
        const hit = this.cache.get(entryKey);
        if (hit !== undefined && Date.now() - hit.at < BalanceService.TTL_MS)
            return hit.value;
        const failedAt = this.failedAt.get(key);
        if (failedAt !== undefined && Date.now() - failedAt < BALANCE_FAILURE_BACKOFF_MS) {
            // Negative cache: a failing group must not fan out to the upstream on
            // every poll. It clears on its own and on any configuration change.
            return Promise.reject(new LlmError(`protocom-api: group "${key}" balance is backing off after a failure`, 'BALANCE_FAILED'));
        }
        const value = this.fetchBalance(options.baseURL, group, includeRates);
        value.then(() => { this.failedAt.delete(key); }, () => {
            this.failedAt.set(key, Date.now());
            // A failed fetch must not be cached: the next caller retries instead of
            // replaying one outage until the TTL expires.
            if (this.cache.get(entryKey)?.value === value)
                this.cache.delete(entryKey);
        });
        this.cache.set(entryKey, { at: Date.now(), value });
        return value;
    }
    async fetchBalance(baseURL, group, includeRates) {
        const apiKey = await this.hooks.resolveApiKey(group);
        const headers = {
            'accept': 'application/json',
            'authorization': `Bearer ${apiKey}`,
            ...attributionHeaders(),
        };
        const usageUrl = `${baseURL}/v1/usage`;
        let response;
        try {
            response = await fetch(usageUrl, { method: 'GET', headers });
        }
        catch (error) {
            throw new LlmError(`could not reach ${usageUrl}`, 'BALANCE_FAILED', { cause: error });
        }
        if (!response.ok) {
            throw new LlmError(`${usageUrl} answered ${response.status}${response.status === 401 || response.status === 403 ? '; check the API key' : ''}`, 'BALANCE_FAILED', { status: response.status });
        }
        const balance = parseUsage(await response.json());
        // Simple deployments do not mount the rate endpoint: any failure there
        // (404, network, malformed body) leaves the balance answer intact. The
        // fan-out path skips it entirely, halving upstream calls per poll.
        if (!includeRates)
            return balance;
        try {
            const rates = await fetch(`${baseURL}${RATE_MULTIPLIER_PATH}`, { method: 'GET', headers });
            if (rates.ok)
                return { ...balance, ...parseRateMultiplier(await rates.json()) };
        }
        catch {
            // Best-effort enrichment only.
        }
        return balance;
    }
}
/**
 * Response headers every balance answer carries. Account state is live and
 * sensitive, so it is never cacheable and never sniffable as another type.
 */
const JSON_HEADERS = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
};
function json(status, body) {
    return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS } });
}
function describeError(error) {
    return error instanceof Error ? error.message : String(error);
}
/**
 * Build the `GET /api/protocom-api/balance` Fetch handler for the Host's shared
 * `/api` channel. Authorization belongs to the carrier, which applies its trust
 * policy before dispatch (the `connection.fetch.register` contract), so this
 * handler never inspects the peer address or the Host header. `?group=<key>`
 * selects one enabled group and opts into the billing-rate enrichment; omission
 * answers every enabled, balance-reporting group. Per-group failures land beside
 * the healthy groups as a fixed `{error}` row: the message names neither the
 * credential reference nor any caller-supplied input, and the detail goes to the
 * local log instead.
 */
export function balanceFetchHandler(service, hooks) {
    return async (request) => {
        if (request.method !== 'GET') {
            return new Response(null, { status: 405, headers: { ...JSON_HEADERS, allow: 'GET' } });
        }
        const url = new URL(request.url);
        const groupParam = url.searchParams.get('group');
        const options = hooks.options();
        if (groupParam !== null) {
            const group = options.groups.get(groupParam);
            if (group === undefined || !group.enabled || !group.showBalance) {
                return json(404, { error: 'no enabled balance-reporting group' });
            }
            try {
                return json(200, await service.balance(group.key, true));
            }
            catch (error) {
                hooks.log?.(`protocom-api: balance query for group "${group.key}" failed: ${describeError(error)}`);
                return json(502, { error: 'the balance query failed' });
            }
        }
        const groups = {};
        // The enabled set is the fixed four-group roster, so this fan-out is bounded
        // by construction; the failure backoff above bounds its repetition.
        await Promise.all([...options.groups.values()]
            .filter(group => group.enabled && group.showBalance)
            .map(async (group) => {
            try {
                groups[group.key] = await service.balance(group.key);
            }
            catch (error) {
                hooks.log?.(`protocom-api: balance query for group "${group.key}" failed: ${describeError(error)}`);
                groups[group.key] = { error: 'the balance query failed' };
            }
        }));
        return json(200, { groups });
    };
}
