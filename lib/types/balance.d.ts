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
import type { GroupBalance } from './balance-view.ts';
import type { GroupKey, ResolvedGroup, ResolvedProtocomOptions } from './config.ts';
export { parseBalanceView, parseRateMultiplier } from './balance-view.ts';
export type { GroupBalance } from './balance-view.ts';
/**
 * How long one group's failure keeps the next caller from hitting the upstream
 * again. Successes are cached for {@link BalanceService.TTL_MS}; failures are
 * not, so without this a deployment whose upstream is down would issue a fresh
 * request per poll (and the fan-out multiplied that). The window is short
 * enough that a repaired key recovers promptly, and
 * {@link BalanceService.invalidate} clears it outright.
 */
export declare const BALANCE_FAILURE_BACKOFF_MS = 5000;
/**
 * Normalize one `/v1/usage` reply, refusing a body that is not an object.
 * @throws LlmError code `BALANCE_FAILED` for a non-object reply.
 */
export declare function parseUsage(body: unknown): GroupBalance;
/** Inputs the balance service reads from the owning plugin. */
export interface BalanceHooks {
    /** Current validated connection facts, re-read per query. */
    options: () => ResolvedProtocomOptions;
    /** Resolve one group's bearer token. */
    resolveApiKey: (group: ResolvedGroup) => Promise<string>;
    /** Local sink for failure detail deliberately kept out of HTTP responses. */
    log?: (message: string) => void;
}
/** Per-group balance queries with a 60-second cache and a bounded failure backoff. */
export declare class BalanceService {
    private readonly hooks;
    /** Cache lifetime for one group's balance. */
    static readonly TTL_MS = 60000;
    private readonly cache;
    private readonly failedAt;
    constructor(hooks: BalanceHooks);
    /** Forget every cached balance (a configuration change may alter any group). */
    invalidate(): void;
    /**
     * One group's balance, served from cache while fresh.
     * @param key - the group to query.
     * @param includeRates - whether to also read the optional billing-rate endpoint.
     */
    balance(key: GroupKey, includeRates?: boolean): Promise<GroupBalance>;
    private fetchBalance;
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
export declare function balanceFetchHandler(service: BalanceService, hooks: BalanceHooks): (request: Request) => Promise<Response>;
