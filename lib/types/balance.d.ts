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
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { GroupKey, ResolvedGroup, ResolvedProtocomOptions } from './config.ts';
/** One group's normalized account state. */
export interface GroupBalance {
    mode?: string;
    status?: string;
    unit?: string;
    /** Quota-limited deployments: the cap, the spend, and what remains. */
    limit?: number;
    used?: number;
    remaining?: number;
    /** Subscription/wallet deployments: the remaining balance and plan name. */
    balance?: number;
    planName?: string;
    /** Subscription daily allowance fields, when disclosed. */
    dailyUsageUsd?: number;
    dailyLimitUsd?: number;
    expiresAt?: string;
    /** Today's counters, when disclosed. */
    todayRequests?: number;
    todayCost?: number;
    /** Current rate-window consumption, when disclosed. */
    rpm?: number;
    tpm?: number;
    /** Billing rate multipliers, when the deployment reports them. */
    rateMultiplier?: number;
    groupRateMultiplier?: number;
}
/**
 * Normalize one `/v1/usage` reply. Quota deployments carry `quota{limit,used,
 * remaining}`; subscription deployments carry `balance`, `planName`, and a
 * `subscription` block. Unrecognized fields are ignored, and both shapes may
 * coexist.
 */
export declare function parseUsage(body: unknown): GroupBalance;
/** Normalize one billing-rate reply; absent fields stay absent. */
export declare function parseRateMultiplier(body: unknown): Pick<GroupBalance, 'rateMultiplier' | 'groupRateMultiplier'>;
/** Inputs the balance service reads from the owning plugin. */
export interface BalanceHooks {
    /** Current validated connection facts, re-read per query. */
    options: () => ResolvedProtocomOptions;
    /** Resolve one group's bearer token. */
    resolveApiKey: (group: ResolvedGroup) => Promise<string>;
}
/** Per-group balance queries with a 60-second cache. */
export declare class BalanceService {
    private readonly hooks;
    /** Cache lifetime for one group's balance. */
    static readonly TTL_MS = 60000;
    private readonly cache;
    constructor(hooks: BalanceHooks);
    /** Forget every cached balance (a configuration change may alter any group). */
    invalidate(): void;
    /** One group's balance, served from cache while fresh. */
    balance(key: GroupKey): Promise<GroupBalance>;
    private fetchBalance;
}
/**
 * Build the `GET /api/protocom-api/balance` handler. The loopback fence is
 * the only authorization: the answer discloses account state, so nothing
 * off-box may read it. `?group=<key>` selects one enabled group; omission
 * answers every enabled group with `showBalance` on. Per-group failures land
 * beside the healthy groups as `{error}` rows.
 */
export declare function balanceRouteHandler(service: BalanceService, hooks: BalanceHooks): (req: IncomingMessage, res: ServerResponse) => Promise<void>;
