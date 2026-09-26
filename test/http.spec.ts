import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_RETRY_AFTER_CEILING_MS, postSse } from '../src/protocol/http.ts'

const connection = { baseURL: 'https://relay.test', apiKey: 'k' }

interface FailureCarrier { failure: { providerRetryAfterMs?: number } }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Retry-After clamping (P1-5)', () => {
  it('clamps a huge delta-seconds value inside the retry policy default', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { message: 'slow down' } }),
      { status: 429, headers: { 'retry-after': '86400' } },
    )))
    const error = await postSse(connection, 'chat/completions', {}).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ code: 'RATE_LIMIT' })
    expect((error as FailureCarrier).failure.providerRetryAfterMs).toBe(DEFAULT_RETRY_AFTER_CEILING_MS)
  })

  it('clamps a far-future HTTP-date value too', async () => {
    const farFuture = new Date(Date.now() + 30 * 24 * 3600 * 1000).toUTCString()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503, headers: { 'retry-after': farFuture } })))
    const error = await postSse(connection, 'chat/completions', {}).catch((caught: unknown) => caught)
    expect((error as FailureCarrier).failure.providerRetryAfterMs).toBe(DEFAULT_RETRY_AFTER_CEILING_MS)
  })

  it('honours the caller ceiling instead of the shipped default', async () => {
    // The caller passes the retry policy's own maxDelayMs, so a raised ceiling
    // respects a longer provider instruction rather than discarding it.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { message: 'slow down' } }),
      { status: 429, headers: { 'retry-after': '600' } },
    )))
    const error = await postSse({ ...connection, retryAfterCeilingMs: 3_600_000 }, 'chat/completions', {})
      .catch((caught: unknown) => caught)
    expect((error as FailureCarrier).failure.providerRetryAfterMs).toBe(600_000)
  })

  it('never forwards more than the caller ceiling', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { message: 'slow down' } }),
      { status: 429, headers: { 'retry-after': '86400' } },
    )))
    const error = await postSse({ ...connection, retryAfterCeilingMs: 60_000 }, 'chat/completions', {})
      .catch((caught: unknown) => caught)
    // The executor cancels a retry whose provider delay exceeds maxDelayMs, so
    // the clamp must make that comparison impossible to lose.
    expect((error as FailureCarrier).failure.providerRetryAfterMs).toBe(60_000)
  })

  it('forwards a small value unchanged', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 429, headers: { 'retry-after': '2' } })))
    const error = await postSse(connection, 'chat/completions', {}).catch((caught: unknown) => caught)
    expect((error as FailureCarrier).failure.providerRetryAfterMs).toBe(2_000)
  })

  it('ignores a non-numeric, non-date value', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 429, headers: { 'retry-after': 'soon' } })))
    const error = await postSse(connection, 'chat/completions', {}).catch((caught: unknown) => caught)
    expect((error as FailureCarrier).failure.providerRetryAfterMs).toBeUndefined()
  })
})
