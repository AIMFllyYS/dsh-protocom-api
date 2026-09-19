import { describe, expect, it } from 'vitest'
import { parseRateMultiplier, parseUsage } from '../src/balance.ts'

describe('usage parsing', () => {
  it('parses a quota-limited reply', () => {
    const balance = parseUsage({
      isValid: true,
      mode: 'quota_limited',
      quota: { limit: 1000, used: 24.21, remaining: 975.78, unit: 'USD' },
      remaining: 975.78,
      status: 'active',
      unit: 'USD',
      usage: {
        today: { requests: 400, input_tokens: 913357, output_tokens: 397757, cost: 2.2055 },
        total: {},
        rpm: 0,
        tpm: 0,
      },
      daily_usage: [],
      model_stats: [],
    })
    expect(balance).toEqual({
      mode: 'quota_limited',
      status: 'active',
      unit: 'USD',
      limit: 1000,
      used: 24.21,
      remaining: 975.78,
      todayRequests: 400,
      todayCost: 2.2055,
      rpm: 0,
      tpm: 0,
    })
  })

  it('parses an unrestricted subscription reply', () => {
    const balance = parseUsage({
      isValid: true,
      mode: 'unrestricted',
      status: 'active',
      balance: 42.5,
      planName: 'Pro',
      subscription: {
        daily_usage_usd: 1.25,
        daily_limit_usd: 20,
        expires_at: '2027-01-01T00:00:00Z',
      },
    })
    expect(balance).toEqual({
      mode: 'unrestricted',
      status: 'active',
      balance: 42.5,
      planName: 'Pro',
      dailyUsageUsd: 1.25,
      dailyLimitUsd: 20,
      expiresAt: '2027-01-01T00:00:00Z',
    })
  })

  it('refuses a non-object reply', () => {
    expect(() => parseUsage('nope')).toThrowError()
    expect(() => parseUsage([1, 2])).toThrowError()
  })

  it('parses billing-rate multipliers and tolerates foreign shapes', () => {
    expect(parseRateMultiplier({ group_rate_multiplier: 1, resolved_rate_multiplier: 0.8 }))
      .toEqual({ rateMultiplier: 0.8, groupRateMultiplier: 1 })
    expect(parseRateMultiplier({})).toEqual({})
    expect(parseRateMultiplier(null)).toEqual({})
  })
})
