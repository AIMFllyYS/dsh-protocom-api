/**
 * The Command Code account normalizer. The fixtures are the EXACT bodies the
 * live endpoints returned on 2026-09-23, so these assertions pin the shapes the
 * strip renders against reality rather than against a guess.
 */
import { describe, expect, it } from 'vitest'
import {
  parseCommandCodeAccount,
  parseCommandCodeCredits,
  parseCommandCodeUsage,
  parseCommandCodeWindow,
} from '../src/commandcode-view.ts'

/** The live /alpha/billing/credits body, verbatim. */
const CREDITS = {
  credits: { belowThreshold: false, creditThreshold: 0, monthlyCredits: 19.8371169506, purchasedCredits: 0, freeCredits: 0 },
  windowLimits: {
    limited: true,
    exceeded: null,
    fiveHour: { used: 2.6085937488, cap: 14, exceeded: false, resetAt: 1790427300847 },
    weekly: { used: 32.0923563887, cap: 35, exceeded: false, resetAt: 1790452415913 },
  },
  sandboxAccess: false,
  sandboxMinutes: null,
}

/** The live /alpha/usage/summary body, verbatim. */
const USAGE = {
  totalCount: 5197,
  totalCost: 50.1628830494,
  averageCost: 0.009652276900019243,
  successRate: 100,
  completedCount: 5197,
  failedCount: 0,
  totalTokensIn: 578644478,
  totalTokensOut: 5416957,
  totalTokens: 584061435,
  totalCredits: 50.1628830494,
  totalFreeCredits: 0,
  totalMonthlyCredits: 50.1628830494,
  totalPurchasedCredits: 0,
  periodBasis: 'billing-period',
}

describe('rolling windows', () => {
  it('reports dollars used, remaining, and percent', () => {
    const window = parseCommandCodeWindow(CREDITS.windowLimits.fiveHour)
    expect(window).toMatchObject({ used: 2.6085937488, cap: 14, exceeded: false })
    expect(window?.remaining).toBeCloseTo(11.39, 2)
    expect(window?.percent).toBe(19)
    expect(window?.resetAt).toBe(1790427300847)
  })

  it('never reports a negative remainder', () => {
    expect(parseCommandCodeWindow({ used: 40, cap: 35 })?.remaining).toBe(0)
  })

  it('clamps the percentage into 0-100', () => {
    expect(parseCommandCodeWindow({ used: 70, cap: 35 })?.percent).toBe(100)
    expect(parseCommandCodeWindow({ used: -5, cap: 35 })?.percent).toBe(0)
  })

  it('reports 0 percent for a zero cap rather than dividing by it', () => {
    expect(parseCommandCodeWindow({ used: 0, cap: 0 })?.percent).toBe(0)
  })

  it('rejects a window missing either half', () => {
    expect(parseCommandCodeWindow({ used: 1 })).toBeUndefined()
    expect(parseCommandCodeWindow({ cap: 1 })).toBeUndefined()
    expect(parseCommandCodeWindow(undefined)).toBeUndefined()
    expect(parseCommandCodeWindow('nope')).toBeUndefined()
  })
})

describe('credits', () => {
  it('reads the live reply', () => {
    const credits = parseCommandCodeCredits(CREDITS)
    // monthlyCredits is a REMAINING BALANCE; the endpoint reports no pool size,
    // so no denominator is invented for it.
    expect(credits?.monthlyCredits).toBeCloseTo(19.837, 3)
    expect(credits?.purchasedCredits).toBe(0)
    expect(credits?.freeCredits).toBe(0)
    expect(credits?.fiveHour?.cap).toBe(14)
    expect(credits?.weekly?.cap).toBe(35)
    expect(credits?.weekly?.percent).toBe(92)
  })

  it('returns undefined for a body with neither half', () => {
    expect(parseCommandCodeCredits({})).toBeUndefined()
    expect(parseCommandCodeCredits(undefined)).toBeUndefined()
  })

  it('keeps the windows when the credits object is absent', () => {
    const credits = parseCommandCodeCredits({ windowLimits: { weekly: { used: 1, cap: 2 } } })
    expect(credits?.weekly?.cap).toBe(2)
    expect(credits?.monthlyCredits).toBeUndefined()
  })
})

describe('usage', () => {
  it('reads the live reply', () => {
    const usage = parseCommandCodeUsage(USAGE)
    expect(usage?.requests).toBe(5197)
    expect(usage?.cost).toBeCloseTo(50.1629, 3)
    expect(usage?.successRatePercent).toBe(100)
    expect(usage?.tokensIn).toBe(578644478)
    expect(usage?.tokensOut).toBe(5416957)
    expect(usage?.periodBasis).toBe('billing-period')
  })

  it('scales a fraction-shaped success rate to a percentage', () => {
    // The live value is 100 (a percentage), but a 0-1 fraction is accepted so
    // both spellings render the same number.
    expect(parseCommandCodeUsage({ successRate: 0.5 })?.successRatePercent).toBe(50)
    expect(parseCommandCodeUsage({ successRate: 1 })?.successRatePercent).toBe(100)
    expect(parseCommandCodeUsage({ successRate: 0 })?.successRatePercent).toBe(0)
    expect(parseCommandCodeUsage({ successRate: 99.5 })?.successRatePercent).toBe(99.5)
  })

  it('drops a success rate outside every reading', () => {
    expect(parseCommandCodeUsage({ successRate: -1 })?.successRatePercent).toBeUndefined()
    expect(parseCommandCodeUsage({ successRate: 500 })?.successRatePercent).toBeUndefined()
  })

  it('returns undefined for an unusable body', () => {
    expect(parseCommandCodeUsage(undefined)).toBeUndefined()
    expect(parseCommandCodeUsage({ unknown: 1 })).toBeUndefined()
  })
})

describe('the whole account surface', () => {
  it('normalizes both halves from the live bodies', () => {
    const account = parseCommandCodeAccount(CREDITS, USAGE)
    expect(account?.credits?.fiveHour?.cap).toBe(14)
    expect(account?.usage?.requests).toBe(5197)
  })

  it('keeps one half when the other read failed', () => {
    // Each endpoint degrades independently: one failing must not blank the rest.
    expect(parseCommandCodeAccount(CREDITS, undefined)?.usage).toBeUndefined()
    expect(parseCommandCodeAccount(CREDITS, undefined)?.credits?.monthlyCredits).toBeCloseTo(19.837, 3)
    expect(parseCommandCodeAccount(undefined, USAGE)?.credits).toBeUndefined()
    expect(parseCommandCodeAccount(undefined, USAGE)?.usage?.requests).toBe(5197)
  })

  it('returns undefined when neither half is usable', () => {
    expect(parseCommandCodeAccount(undefined, undefined)).toBeUndefined()
    expect(parseCommandCodeAccount({}, {})).toBeUndefined()
  })
})
