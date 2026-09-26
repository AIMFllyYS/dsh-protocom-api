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
  used: number
  /** Dollar ceiling for this window. */
  cap: number
  /** Dollars still available, never negative. */
  remaining: number
  /** Percentage of the cap consumed, 0-100, rounded. */
  percent: number
  /** Whether the account endpoint says this window is over its limit. */
  exceeded: boolean
  /** Epoch milliseconds this window resets, when reported. */
  resetAt?: number
}

/** The account's credit state. */
export interface CommandCodeCredits {
  /**
   * Remaining monthly credits in dollars. A BALANCE: the endpoint reports no
   * pool size, so no percentage is derived from it.
   */
  monthlyCredits?: number
  /** Remaining purchased credits in dollars, when the account has any. */
  purchasedCredits?: number
  /** Remaining free credits in dollars, when the account has any. */
  freeCredits?: number
  /** The five-hour burst window. */
  fiveHour?: CommandCodeWindow
  /** The weekly window. */
  weekly?: CommandCodeWindow
}

/** Usage totals for the current billing period. */
export interface CommandCodeUsage {
  /** Requests made in the period. */
  requests?: number
  /** Requests that completed. */
  completed?: number
  /** Requests that failed. */
  failed?: number
  /** Dollars spent in the period. */
  cost?: number
  /** Mean dollars per request. */
  averageCost?: number
  /**
   * Success rate as a PERCENTAGE 0-100. The live reply reports 100 here, so it
   * is a percentage and not a fraction; a fraction-shaped value is normalized to
   * a percentage so both spellings render the same.
   */
  successRatePercent?: number
  /** Input tokens in the period. */
  tokensIn?: number
  /** Output tokens in the period. */
  tokensOut?: number
  /** Total tokens, when the endpoint states one. */
  tokens?: number
  /** What the period covers, e.g. `billing-period`. */
  periodBasis?: string
}

/** The whole account surface. Each half is optional and degrades separately. */
export interface CommandCodeAccount {
  credits?: CommandCodeCredits
  usage?: CommandCodeUsage
}

/** A finite number, or undefined. */
function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** Read one object member as a record, or undefined. */
function rec(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/**
 * Normalize one rolling window.
 * @param raw - the window object from the reply.
 * @returns the window, or undefined when it carries nothing usable.
 */
export function parseCommandCodeWindow(raw: unknown): CommandCodeWindow | undefined {
  const source = rec(raw)
  if (source === undefined) return undefined
  const used = num(source['used'])
  const cap = num(source['cap'])
  if (used === undefined || cap === undefined) return undefined
  const resetAt = num(source['resetAt'])
  return {
    used,
    cap,
    remaining: Math.max(cap - used, 0),
    percent: cap > 0 ? Math.min(Math.max(Math.round((used / cap) * 100), 0), 100) : 0,
    exceeded: source['exceeded'] === true,
    ...resetAt === undefined ? {} : { resetAt },
  }
}

/**
 * Normalize the credits reply.
 * @param body - the parsed `/alpha/billing/credits` body.
 * @returns the credit state, or undefined when the body is unusable.
 */
export function parseCommandCodeCredits(body: unknown): CommandCodeCredits | undefined {
  const credits = rec(rec(body)?.['credits'])
  const limits = rec(rec(body)?.['windowLimits'])
  if (credits === undefined && limits === undefined) return undefined
  const monthlyCredits = num(credits?.['monthlyCredits'])
  const purchasedCredits = num(credits?.['purchasedCredits'])
  const freeCredits = num(credits?.['freeCredits'])
  const fiveHour = parseCommandCodeWindow(limits?.['fiveHour'])
  const weekly = parseCommandCodeWindow(limits?.['weekly'])
  const result: CommandCodeCredits = {
    ...monthlyCredits === undefined ? {} : { monthlyCredits },
    ...purchasedCredits === undefined ? {} : { purchasedCredits },
    ...freeCredits === undefined ? {} : { freeCredits },
    ...fiveHour === undefined ? {} : { fiveHour },
    ...weekly === undefined ? {} : { weekly },
  }
  return Object.keys(result).length === 0 ? undefined : result
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
export function parseCommandCodeUsage(body: unknown): CommandCodeUsage | undefined {
  const source = rec(body)
  if (source === undefined) return undefined
  const rawRate = num(source['successRate'])
  const successRatePercent = rawRate === undefined
    ? undefined
    : rawRate > 1 && rawRate <= 100
      ? rawRate
      : rawRate >= 0 && rawRate <= 1
        ? rawRate * 100
        : undefined
  const requests = num(source['totalCount'])
  const completed = num(source['completedCount'])
  const failed = num(source['failedCount'])
  const cost = num(source['totalCost'])
  const averageCost = num(source['averageCost'])
  const tokensIn = num(source['totalTokensIn'])
  const tokensOut = num(source['totalTokensOut'])
  const tokens = num(source['totalTokens'])
  const periodBasis = typeof source['periodBasis'] === 'string' && source['periodBasis'].length > 0
    ? source['periodBasis']
    : undefined
  const result: CommandCodeUsage = {
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
  }
  return Object.keys(result).length === 0 ? undefined : result
}

/**
 * Normalize the whole account surface from the two replies, either of which may
 * be missing. A read failure on one half never clears the other.
 * @param creditsBody - the parsed credits body, when the read succeeded.
 * @param usageBody - the parsed usage body, when the read succeeded.
 * @returns the account state, or undefined when neither half is usable.
 */
export function parseCommandCodeAccount(
  creditsBody: unknown,
  usageBody: unknown,
): CommandCodeAccount | undefined {
  const credits = creditsBody === undefined ? undefined : parseCommandCodeCredits(creditsBody)
  const usage = usageBody === undefined ? undefined : parseCommandCodeUsage(usageBody)
  if (credits === undefined && usage === undefined) return undefined
  return {
    ...credits === undefined ? {} : { credits },
    ...usage === undefined ? {} : { usage },
  }
}
