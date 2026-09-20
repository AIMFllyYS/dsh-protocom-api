/**
 * The one balance shape, plus its normalizers. This module has no imports on
 * purpose: the Host handler normalizes upstream replies with it, and the
 * browser strip re-validates the same shape with it. Sharing the code is what
 * keeps the browser from duplicating (and drifting from) the wire contract —
 * and the zero-import rule is what keeps the server's transport dependencies
 * out of the client bundle.
 *
 * @module dsh-protocom-api/balance-view
 */
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
 * Normalize one usage-report object. Quota deployments carry
 * `quota{limit,used,remaining}`; subscription deployments carry `balance`,
 * `planName`, and a `subscription` block. Unrecognized fields are ignored, and
 * both shapes may coexist.
 * @param body - a non-null, non-array object.
 */
export declare function normalizeUsage(body: object): GroupBalance;
/**
 * Re-validate one balance value that crossed a trust boundary. The browser
 * casts the JSON body to {@link GroupBalance}; a malformed or hostile reply
 * must not reach `toFixed`/`slice` and crash the strip. Only recognized,
 * well-typed fields survive, and a value that is not an object is refused
 * rather than half-accepted.
 */
export declare function parseBalanceView(body: unknown): GroupBalance | undefined;
/** Normalize one billing-rate reply; absent fields stay absent. */
export declare function parseRateMultiplier(body: unknown): Pick<GroupBalance, 'rateMultiplier' | 'groupRateMultiplier'>;
