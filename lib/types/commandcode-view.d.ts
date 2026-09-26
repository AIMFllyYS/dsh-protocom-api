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
/** One rolling window's state, as the account endpoint reports it. */
export interface CommandCodeWindow {
    /** Dollars consumed in this window. */
    used: number;
    /** Dollar ceiling for this window. */
    cap: number;
    /** Dollars still available, never negative. */
    remaining: number;
    /** Percentage of the cap consumed, 0-100, rounded. */
    percent: number;
    /** Whether the account endpoint says this window is over its limit. */
    exceeded: boolean;
    /** Epoch milliseconds this window resets, when reported. */
    resetAt?: number;
}
/** The account's credit state. */
export interface CommandCodeCredits {
    /**
     * Remaining monthly credits in dollars. A BALANCE: the endpoint reports no
     * pool size, so no percentage is derived from it.
     */
    monthlyCredits?: number;
    /** Remaining purchased credits in dollars, when the account has any. */
    purchasedCredits?: number;
    /** Remaining free credits in dollars, when the account has any. */
    freeCredits?: number;
    /** The five-hour burst window. */
    fiveHour?: CommandCodeWindow;
    /** The weekly window. */
    weekly?: CommandCodeWindow;
}
/** Usage totals for the current billing period. */
export interface CommandCodeUsage {
    /** Requests made in the period. */
    requests?: number;
    /** Requests that completed. */
    completed?: number;
    /** Requests that failed. */
    failed?: number;
    /** Dollars spent in the period. */
    cost?: number;
    /** Mean dollars per request. */
    averageCost?: number;
    /**
     * Success rate as a PERCENTAGE 0-100. The live reply reports 100 here, so it
     * is a percentage and not a fraction; a fraction-shaped value is normalized to
     * a percentage so both spellings render the same.
     */
    successRatePercent?: number;
    /** Input tokens in the period. */
    tokensIn?: number;
    /** Output tokens in the period. */
    tokensOut?: number;
    /** Total tokens, when the endpoint states one. */
    tokens?: number;
    /** What the period covers, e.g. `billing-period`. */
    periodBasis?: string;
}
/** The whole account surface. Each half is optional and degrades separately. */
export interface CommandCodeAccount {
    credits?: CommandCodeCredits;
    usage?: CommandCodeUsage;
}
/**
 * Normalize one rolling window.
 * @param raw - the window object from the reply.
 * @returns the window, or undefined when it carries nothing usable.
 */
export declare function parseCommandCodeWindow(raw: unknown): CommandCodeWindow | undefined;
/**
 * Normalize the credits reply.
 * @param body - the parsed `/alpha/billing/credits` body.
 * @returns the credit state, or undefined when the body is unusable.
 */
export declare function parseCommandCodeCredits(body: unknown): CommandCodeCredits | undefined;
/**
 * Normalize the usage reply.
 *
 * `successRate` is published as a percentage, but a fraction is accepted and
 * scaled: a value at or below 1 that is not exactly 0 or 1 is read as a
 * fraction, which is the only reading under which the number means anything.
 * @param body - the parsed `/alpha/usage/summary` body.
 * @returns the usage totals, or undefined when the body is unusable.
 */
export declare function parseCommandCodeUsage(body: unknown): CommandCodeUsage | undefined;
/**
 * Normalize the whole account surface from the two replies, either of which may
 * be missing. A read failure on one half never clears the other.
 * @param creditsBody - the parsed credits body, when the read succeeded.
 * @param usageBody - the parsed usage body, when the read succeeded.
 * @returns the account state, or undefined when neither half is usable.
 */
export declare function parseCommandCodeAccount(creditsBody: unknown, usageBody: unknown): CommandCodeAccount | undefined;
