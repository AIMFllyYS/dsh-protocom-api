/**
 * Balance queries against the Protocom official API's usage endpoint, with a
 * 60-second per-group cache and the loopback-only HTTP surface the web
 * settings page polls. Quota-limited and subscription/wallet deployments
 * answer with different shapes; both normalize into {@link GroupBalance}.
 * The billing-rate endpoint is absent on simple deployments, so its failure
 * is never fatal.
 *
 * @module dsh-protocom-api/balance
 */
import { attributionHeaders, LlmError } from '@deepseek-ai/dsh-llm';
const RATE_MULTIPLIER_PATH = '/v1/sub2api/billing';
function numberField(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function stringField(value) {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
/**
 * Normalize one `/v1/usage` reply. Quota deployments carry `quota{limit,used,
 * remaining}`; subscription deployments carry `balance`, `planName`, and a
 * `subscription` block. Unrecognized fields are ignored, and both shapes may
 * coexist.
 */
export function parseUsage(body) {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        throw new LlmError('the usage endpoint did not answer with an object', 'BALANCE_FAILED');
    }
    const report = body;
    const today = report.usage?.today;
    const balance = {};
    const mode = stringField(report.mode);
    if (mode !== undefined)
        balance.mode = mode;
    const status = stringField(report.status);
    if (status !== undefined)
        balance.status = status;
    const unit = stringField(report.unit);
    if (unit !== undefined)
        balance.unit = unit;
    const limit = numberField(report.quota?.limit);
    if (limit !== undefined)
        balance.limit = limit;
    const used = numberField(report.quota?.used);
    if (used !== undefined)
        balance.used = used;
    const remaining = numberField(report.quota?.remaining ?? report.remaining);
    if (remaining !== undefined)
        balance.remaining = remaining;
    const balanceField = numberField(report.balance);
    if (balanceField !== undefined)
        balance.balance = balanceField;
    const planName = stringField(report.planName);
    if (planName !== undefined)
        balance.planName = planName;
    const dailyUsageUsd = numberField(report.subscription?.daily_usage_usd);
    if (dailyUsageUsd !== undefined)
        balance.dailyUsageUsd = dailyUsageUsd;
    const dailyLimitUsd = numberField(report.subscription?.daily_limit_usd);
    if (dailyLimitUsd !== undefined)
        balance.dailyLimitUsd = dailyLimitUsd;
    const expiresAt = stringField(report.subscription?.expires_at);
    if (expiresAt !== undefined)
        balance.expiresAt = expiresAt;
    const todayRequests = numberField(today?.requests);
    if (todayRequests !== undefined)
        balance.todayRequests = todayRequests;
    const todayCost = numberField(today?.cost);
    if (todayCost !== undefined)
        balance.todayCost = todayCost;
    const rpm = numberField(report.usage?.rpm);
    if (rpm !== undefined)
        balance.rpm = rpm;
    const tpm = numberField(report.usage?.tpm);
    if (tpm !== undefined)
        balance.tpm = tpm;
    return balance;
}
/** Normalize one billing-rate reply; absent fields stay absent. */
export function parseRateMultiplier(body) {
    const parsed = {};
    if (body === null || typeof body !== 'object' || Array.isArray(body))
        return parsed;
    const report = body;
    const rateMultiplier = numberField(report.resolved_rate_multiplier);
    if (rateMultiplier !== undefined)
        parsed.rateMultiplier = rateMultiplier;
    const groupRateMultiplier = numberField(report.group_rate_multiplier);
    if (groupRateMultiplier !== undefined)
        parsed.groupRateMultiplier = groupRateMultiplier;
    return parsed;
}
/** Per-group balance queries with a 60-second cache. */
export class BalanceService {
    hooks;
    /** Cache lifetime for one group's balance. */
    static TTL_MS = 60_000;
    cache = new Map();
    constructor(hooks) {
        this.hooks = hooks;
    }
    /** Forget every cached balance (a configuration change may alter any group). */
    invalidate() {
        this.cache.clear();
    }
    /** One group's balance, served from cache while fresh. */
    balance(key) {
        const options = this.hooks.options();
        const group = options.groups.get(key);
        if (group === undefined || !group.enabled) {
            return Promise.reject(new LlmError(`protocom-api: group "${key}" is not enabled`, 'BALANCE_FAILED'));
        }
        const hit = this.cache.get(key);
        if (hit !== undefined && Date.now() - hit.at < BalanceService.TTL_MS)
            return hit.value;
        const value = this.fetchBalance(options.baseURL, group);
        value.catch(() => {
            // A failed fetch must not be cached: the next caller retries instead of
            // replaying one outage until the TTL expires.
            if (this.cache.get(key)?.value === value)
                this.cache.delete(key);
        });
        this.cache.set(key, { at: Date.now(), value });
        return value;
    }
    async fetchBalance(baseURL, group) {
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
        // (404, network, malformed body) leaves the balance answer intact.
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
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
function send(res, status, body) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
}
/**
 * Build the `GET /api/protocom-api/balance` handler. The loopback fence is
 * the only authorization: the answer discloses account state, so nothing
 * off-box may read it. `?group=<key>` selects one enabled group; omission
 * answers every enabled group with `showBalance` on. Per-group failures land
 * beside the healthy groups as `{error}` rows.
 */
export function balanceRouteHandler(service, hooks) {
    return async (req, res) => {
        if (req.method !== 'GET') {
            send(res, 405, { error: 'method not allowed' });
            return;
        }
        if (!LOOPBACK_ADDRESSES.has(req.socket.remoteAddress ?? '')) {
            send(res, 403, { error: 'the balance endpoint answers loopback clients only' });
            return;
        }
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        const groupParam = url.searchParams.get('group');
        const options = hooks.options();
        if (groupParam !== null) {
            const group = options.groups.get(groupParam);
            if (group === undefined || !group.enabled || !group.showBalance) {
                send(res, 404, { error: `no enabled balance-reporting group "${groupParam}"` });
                return;
            }
            try {
                send(res, 200, await service.balance(group.key));
            }
            catch (error) {
                send(res, 502, { error: error instanceof Error ? error.message : String(error) });
            }
            return;
        }
        const groups = {};
        await Promise.all([...options.groups.values()]
            .filter(group => group.enabled && group.showBalance)
            .map(async (group) => {
            try {
                groups[group.key] = await service.balance(group.key);
            }
            catch (error) {
                groups[group.key] = { error: error instanceof Error ? error.message : String(error) };
            }
        }));
        send(res, 200, { groups });
    };
}
