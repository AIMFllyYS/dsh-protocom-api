/**
 * The OpenCode Go `/v1/usage` reply shape, plus its normalizer. This module
 * has no imports on purpose — the Host handler normalizes the upstream reply
 * with it and the browser strip re-validates the same shape with it, the same
 * contract `balance-view.ts` keeps for the Protocom family.
 *
 * Verified against the live endpoint (2026-09): the reply carries no currency
 * fields at all; subscription consumption is reported as three independent
 * windows — `rolling` (the five-hour burst allowance, priced at 20% of the
 * monthly dollar cap), `weekly` (50%), and `monthly` (100%) — each with a
 * fill `percent`, an ISO `resetsAt`, and a `status` that is `"ok"` or
 * `"rate-limited"`.
 *
 * @module dsh-protocom-api/usage-view
 */
/** One quota window's state. */
export interface GoQuotaWindow {
    /** Fill percentage of this window's allowance (0-100, may exceed 100). */
    percent?: number;
    /** Whether this window currently accepts requests (`"ok"` or `"rate-limited"`). */
    status?: string;
    /** ISO instant this window's allowance resets. */
    resetsAt?: string;
}
/** The whole subscription's quota state, all three windows optional. */
export interface GoUsageView {
    rolling?: GoQuotaWindow;
    weekly?: GoQuotaWindow;
    monthly?: GoQuotaWindow;
}
/**
 * Re-validate one usage reply that crossed a trust boundary. The browser
 * casts the JSON body to {@link GoUsageView}; a malformed or hostile reply
 * must not reach a `toFixed`/`Date.parse` and crash the strip. Unrecognized
 * fields are ignored and a non-object body is refused rather than
 * half-accepted.
 */
export declare function parseGoUsage(body: unknown): GoUsageView | undefined;
