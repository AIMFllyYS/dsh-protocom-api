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
function numberField(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function stringField(value) {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
/**
 * Normalize one usage-report object. Quota deployments carry
 * `quota{limit,used,remaining}`; subscription deployments carry `balance`,
 * `planName`, and a `subscription` block. Unrecognized fields are ignored, and
 * both shapes may coexist.
 * @param body - a non-null, non-array object.
 */
export function normalizeUsage(body) {
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
/**
 * Re-validate one balance value that crossed a trust boundary. The browser
 * casts the JSON body to {@link GroupBalance}; a malformed or hostile reply
 * must not reach `toFixed`/`slice` and crash the strip. Only recognized,
 * well-typed fields survive, and a value that is not an object is refused
 * rather than half-accepted.
 */
export function parseBalanceView(body) {
    if (body === null || typeof body !== 'object' || Array.isArray(body))
        return undefined;
    return normalizeUsage(body);
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
