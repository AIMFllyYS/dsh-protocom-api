/**
 * The retry-budget settings: their defaults, their bounds, and the property the
 * whole feature exists for — that a committed change reaches the very next
 * request without a restart, because the harness captures a route's retry policy
 * when that route is registered and this plugin re-registers on every change.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RETRY_MAX_ATTEMPTS,
  DEFAULT_RETRY_MAX_DELAY_MS,
  MAX_RETRY_ATTEMPTS,
  RETRY_INITIAL_DELAY_MS,
  RETRY_JITTER_RATIO,
  resolveAdapterOptions,
} from '../src/config.ts'
import { ProtocomAdapter } from '../src/adapter.ts'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'

/** An adapter over one hand-built configuration, with no credential needed. */
function adapterFor(config: Record<string, unknown>): ProtocomAdapter {
  const options = resolveAdapterOptions({
    baseURL: 'https://relay.protocom.org',
    groups: { aggregate: { enabled: true, apiKey: 'PROTOCOM_AGGREGATE_API_KEY' } },
    ...config,
  } as never)
  return new ProtocomAdapter({
    options: () => options,
    resolveApiKey: async () => 'sk-test',
  })
}

describe('retry budget settings (R1)', () => {
  it('defaults to an overnight budget at one-hour backoff steps', () => {
    const resolved = resolveAdapterOptions({})
    expect(resolved.retryMaxAttempts).toBe(DEFAULT_RETRY_MAX_ATTEMPTS)
    expect(resolved.retryMaxDelayMs).toBe(DEFAULT_RETRY_MAX_DELAY_MS)
    // The default must actually outlast a night: the delays double from the
    // first rung to the ceiling, so their sum is the worst-case span.
    const ladder = Array.from({ length: DEFAULT_RETRY_MAX_ATTEMPTS }, (_, index) =>
      Math.min(RETRY_INITIAL_DELAY_MS * 2 ** index, DEFAULT_RETRY_MAX_DELAY_MS))
    const totalMs = ladder.reduce((sum, delay) => sum + delay, 0)
    expect(totalMs).toBeGreaterThan(6 * 3_600_000)
  })

  it('accepts a configured attempt count and ceiling', () => {
    const resolved = resolveAdapterOptions({ retryMaxAttempts: 7, retryMaxDelayMs: 120_000 })
    expect(resolved.retryMaxAttempts).toBe(7)
    expect(resolved.retryMaxDelayMs).toBe(120_000)
  })

  it('accepts a zero budget, which disables retrying', () => {
    expect(resolveAdapterOptions({ retryMaxAttempts: 0 }).retryMaxAttempts).toBe(0)
  })

  it('refuses an attempt count outside the accepted range', () => {
    expect(() => resolveAdapterOptions({ retryMaxAttempts: -1 })).toThrowError(/retryMaxAttempts/)
    expect(() => resolveAdapterOptions({ retryMaxAttempts: 1.5 })).toThrowError(/retryMaxAttempts/)
    expect(() => resolveAdapterOptions({ retryMaxAttempts: MAX_RETRY_ATTEMPTS + 1 })).toThrowError(/retryMaxAttempts/)
    expect(() => resolveAdapterOptions({ retryMaxAttempts: Number.NaN })).toThrowError(/retryMaxAttempts/)
  })

  it('refuses a ceiling below the first rung or above the timer bound', () => {
    // The harness policy requires initialDelayMs <= maxDelayMs, so a smaller
    // ceiling would fail inside the executor; this names the setting instead.
    expect(() => resolveAdapterOptions({ retryMaxDelayMs: RETRY_INITIAL_DELAY_MS - 1 }))
      .toThrowError(/retryMaxDelayMs/)
    expect(() => resolveAdapterOptions({ retryMaxDelayMs: Number.POSITIVE_INFINITY }))
      .toThrowError(/retryMaxDelayMs/)
    expect(() => resolveAdapterOptions({ retryMaxDelayMs: MAX_TIMER_DELAY_MS + 1 }))
      .toThrowError(/retryMaxDelayMs/)
  })

  it('accepts the exact timer bound the harness allows', () => {
    expect(resolveAdapterOptions({ retryMaxDelayMs: MAX_TIMER_DELAY_MS }).retryMaxDelayMs)
      .toBe(MAX_TIMER_DELAY_MS)
  })
})

describe('adapter policy mirrors the settings (R1)', () => {
  it('reports the resolved budget on every route of the family', () => {
    const adapter = adapterFor({ retryMaxAttempts: 12, retryMaxDelayMs: 900_000 })
    for (const provider of ['protocom-aggregate', 'protocom-codex', 'protocom-stepfun', 'protocom-grok']) {
      expect(adapter.providerRetryPolicy(provider)).toMatchObject({
        mode: 'normal',
        maxRetries: 12,
        initialDelayMs: RETRY_INITIAL_DELAY_MS,
        maxDelayMs: 900_000,
        jitterRatio: RETRY_JITTER_RATIO,
      })
    }
  })

  it('reads the live configuration, so a committed change applies without a restart', () => {
    // This is the property the harness's register-time capture depends on: the
    // plugin re-registers on every settings change, and the adapter must answer
    // from the CURRENT facts rather than a value frozen at construction.
    let current = resolveAdapterOptions({ retryMaxAttempts: 3, retryMaxDelayMs: 60_000 })
    const adapter = new ProtocomAdapter({
      options: () => current,
      resolveApiKey: async () => 'sk-test',
    })
    expect(adapter.providerRetryPolicy('protocom-aggregate')).toMatchObject({ maxRetries: 3 })
    current = resolveAdapterOptions({ retryMaxAttempts: 50, retryMaxDelayMs: 3_600_000 })
    expect(adapter.providerRetryPolicy('protocom-aggregate')).toMatchObject({
      maxRetries: 50,
      maxDelayMs: 3_600_000,
    })
  })

  it('keeps Retry-After inside the policy so a retry is never silently cancelled', () => {
    const adapter = adapterFor({ retryMaxDelayMs: 600_000 })
    const policy = adapter.providerRetryPolicy('protocom-aggregate')
    // The executor cancels a retry when the forwarded provider delay exceeds
    // maxDelayMs; the adapter passes this same number as the transport ceiling.
    expect(policy?.maxDelayMs).toBe(600_000)
  })

  it('never retries a permanent refusal code', () => {
    const policy = adapterFor({}).providerRetryPolicy('protocom-aggregate')
    const codes = policy?.mode === 'normal' ? policy.retryableCodes : []
    // A wrong key or a malformed request must surface at once, not after hours.
    expect(codes).not.toContain('AUTH')
    expect(codes).not.toContain('INVALID_REQUEST')
    expect(codes).not.toContain('ABORTED')
    expect(codes).toEqual(expect.arrayContaining(['TRANSPORT', 'TIMEOUT', 'SERVER', 'RATE_LIMIT']))
  })
})
