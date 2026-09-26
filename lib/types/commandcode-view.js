/**
 * The Command Code account surface: credit balances and rolling windows, plus
 * usage totals, normalized from the `/alpha/*` replies.
 *
 * Import-free on purpose, exactly like `balance-view.ts` and `usage-view.ts`:
 * the Host handler normalizes the upstream reply with it and the browser strip
 * re-validates the same shape, so the two can never disagree about what the
 * numbers mean.
 *
 * Every field was verified live on 2026-09-23 with a real key. The observed
 * replies:
 *
 *   GET /alpha/billing/credits
 *   {"credits":{"monthlyCredits":19.837,"purchasedCredits":0,"freeCredits":0,
 *               "belowThreshold":false,"creditThreshold":0},
 *    "windowLimits":{"limited":true,"exceeded":null,
 *      "fiveHour":{"used":2.608,"cap":14,"exceeded":false,"resetAt":1790427300847},
 *      "weekly":{"used":32.09,"cap":35,"exceeded":false,"resetAt":1790452415913}},
 *    "sandboxAccess":false,"sandboxMinutes":null}
 *
 *   GET /alpha/usage/summary
 *   {"totalCount":5197,"totalCost":50.16,"averageCost":0.00965,"successRate":100,
 *    "completedCount":5197,"failedCount":0,"totalTokensIn":578644478,
 *    "totalTokensOut":5416957,"totalTokens":584061435,"periodBasis":"billing-period"}
 *
 * Two facts worth stating because they are easy to get wrong:
 *
 * - The credits are DOLLARS, not request counts. The caps are round money
 *   limits (14 / 35) and a window's `used` tracks what the requests inside it
 *   cost, so the strip renders currency rather than a percentage alone.
 * - `monthlyCredits` is a REMAINING BALANCE, not a total. The pool size is not
 *   reported anywhere, so this module never invents a denominator for it.
 *
 * @module dsh-protocom-api/commandcode-view
 */
/** A finite number, or undefined. */
function num(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
/** Read one object member as a record, or undefined. */
function rec(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : undefined;
}
/**
 * Normalize one rolling window.
 * @param raw - the window object from the reply.
 * @returns the window, or undefined when it carries nothing usable.
 */
export function parseCommandCodeWindow(raw) {
    const source = rec(raw);
    if (source === undefined)
        return undefined;
    const used = num(source['used']);
    const cap = num(source['cap']);
    if (used === undefined || cap === undefined)
        return undefined;
    const resetAt = num(source['resetAt']);
    return {
        used,
        cap,
        remaining: Math.max(cap - used, 0),
        percent: cap > 0 ? Math.min(Math.max(Math.round((used / cap) * 100), 0), 100) : 0,
        exceeded: source['exceeded'] === true,
        ...resetAt === undefined ? {} : { resetAt },
    };
}
/**
 * Normalize the credits reply.
 * @param body - the parsed `/alpha/billing/credits` body.
 * @returns the credit state, or undefined when the body is unusable.
 */
export function parseCommandCodeCredits(body) {
    const credits = rec(rec(body)?.['credits']);
    const limits = rec(rec(body)?.['windowLimits']);
    if (credits === undefined && limits === undefined)
        return undefined;
    const monthlyCredits = num(credits?.['monthlyCredits']);
    const purchasedCredits = num(credits?.['purchasedCredits']);
    const freeCredits = num(credits?.['freeCredits']);
    const fiveHour = parseCommandCodeWindow(limits?.['fiveHour']);
    const weekly = parseCommandCodeWindow(limits?.['weekly']);
    const result = {
        ...monthlyCredits === undefined ? {} : { monthlyCredits },
        ...purchasedCredits === undefined ? {} : { purchasedCredits },
        ...freeCredits === undefined ? {} : { freeCredits },
        ...fiveHour === undefined ? {} : { fiveHour },
        ...weekly === undefined ? {} : { weekly },
    };
    return Object.keys(result).length === 0 ? undefined : result;
}
/**
 * Normalize the usage reply.
 *
 * `successRate` is published as a percentage, but a fraction is accepted and
 * scaled: a value at or below 1 that is not exactly 0 or 1 is read as a
 * fraction, which is the only reading under which the number means anything.
 * @param body - the parsed `/alpha/usage/summary` body.
 * @returns the usage totals, or undefined when the body is unusable.
 */
export function parseCommandCodeUsage(body) {
    const source = rec(body);
    if (source === undefined)
        return undefined;
    const rawRate = num(source['successRate']);
    const successRatePercent = rawRate === undefined
        ? undefined
        : rawRate > 1 && rawRate <= 100
            ? rawRate
            : rawRate >= 0 && rawRate <= 1
                ? rawRate * 100
                : undefined;
    const requests = num(source['totalCount']);
    const completed = num(source['completedCount']);
    const failed = num(source['failedCount']);
    const cost = num(source['totalCost']);
    const averageCost = num(source['averageCost']);
    const tokensIn = num(source['totalTokensIn']);
    const tokensOut = num(source['totalTokensOut']);
    const tokens = num(source['totalTokens']);
    const periodBasis = typeof source['periodBasis'] === 'string' && source['periodBasis'].length > 0
        ? source['periodBasis']
        : undefined;
    const result = {
        ...requests === undefined ? {} : { requests },
        ...completed === undefined ? {} : { completed },
        ...failed === undefined ? {} : { failed },
        ...cost === undefined ? {} : { cost },
        ...averageCost === undefined ? {} : { averageCost },
        ...successRatePercent === undefined ? {} : { successRatePercent },
        ...tokensIn === undefined ? {} : { tokensIn },
        ...tokensOut === undefined ? {} : { tokensOut },
        ...tokens === undefined ? {} : { tokens },
        ...periodBasis === undefined ? {} : { periodBasis },
    };
    return Object.keys(result).length === 0 ? undefined : result;
}
/**
 * Re-validate the account route's reply on the browser side.
 *
 * The wire body is a trust boundary — it comes back through the Host, but the
 * strip must not reach into a malformed shape and crash — so the client parses
 * the same normalized view the Host produced rather than asserting it. Both
 * halves are optional and their reachability is carried explicitly.
 * @param body - the parsed route reply.
 * @returns the view, or undefined when the body carries nothing renderable.
 */
export function parseCommandCodeAccountView(body) {
    const source = rec(body);
    if (source === undefined)
        return undefined;
    const half = (value) => {
        const entry = rec(value);
        if (entry === undefined)
            return undefined;
        const error = typeof entry['error'] === 'string' && entry['error'].length > 0 ? entry['error'] : undefined;
        return {
            reachable: entry['reachable'] === true,
            ...error === undefined ? {} : { error },
        };
    };
    const credits = half(source['credits']);
    const usage = half(source['usage']);
    if (credits === undefined || usage === undefined)
        return undefined;
    const account = rec(source['account']);
    const normalized = account === undefined
        ? undefined
        : parseCommandCodeAccount(account['credits'] === undefined ? undefined : { credits: account['credits'], windowLimits: account['windowLimits'] }, account['usage']);
    return {
        ...normalized === undefined ? {} : { account: normalized },
        credits,
        usage,
        ...source['credentialRejected'] === true ? { credentialRejected: true } : {},
    };
}
/**
 * Normalize the whole account surface from the two replies, either of which may
 * be missing. A read failure on one half never clears the other.
 * @param creditsBody - the parsed credits body, when the read succeeded.
 * @param usageBody - the parsed usage body, when the read succeeded.
 * @returns the account state, or undefined when neither half is usable.
 */
export function parseCommandCodeAccount(creditsBody, usageBody) {
    const credits = creditsBody === undefined ? undefined : parseCommandCodeCredits(creditsBody);
    const usage = usageBody === undefined ? undefined : parseCommandCodeUsage(usageBody);
    if (credits === undefined && usage === undefined)
        return undefined;
    return {
        ...credits === undefined ? {} : { credits },
        ...usage === undefined ? {} : { usage },
    };
}
