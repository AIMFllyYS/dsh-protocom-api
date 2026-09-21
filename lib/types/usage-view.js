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
function numberField(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function stringField(value) {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
function normalizeWindow(value) {
    if (value === null || typeof value !== 'object')
        return undefined;
    const window = {};
    const percent = numberField(value.percent);
    if (percent !== undefined)
        window.percent = percent;
    const status = stringField(value.status);
    if (status !== undefined)
        window.status = status;
    const resetsAt = stringField(value.resetsAt);
    if (resetsAt !== undefined)
        window.resetsAt = resetsAt;
    return window;
}
/**
 * Re-validate one usage reply that crossed a trust boundary. The browser
 * casts the JSON body to {@link GoUsageView}; a malformed or hostile reply
 * must not reach a `toFixed`/`Date.parse` and crash the strip. Unrecognized
 * fields are ignored and a non-object body is refused rather than
 * half-accepted.
 */
export function parseGoUsage(body) {
    if (body === null || typeof body !== 'object' || Array.isArray(body))
        return undefined;
    const usage = body.usage;
    if (usage === null || typeof usage !== 'object')
        return undefined;
    const view = {};
    const rolling = normalizeWindow(usage.rolling);
    if (rolling !== undefined)
        view.rolling = rolling;
    const weekly = normalizeWindow(usage.weekly);
    if (weekly !== undefined)
        view.weekly = weekly;
    const monthly = normalizeWindow(usage.monthly);
    if (monthly !== undefined)
        view.monthly = monthly;
    return view;
}
