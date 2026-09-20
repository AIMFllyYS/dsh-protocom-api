import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_PROVIDER_RETRY_AFTER_MS, postSse } from '../src/protocol/http.ts'

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
    expect((error as FailureCarrier).failure.providerRetryAfterMs).toBe(MAX_PROVIDER_RETRY_AFTER_MS)
  })

  it('clamps a far-future HTTP-date value too', async () => {
    const farFuture = new Date(Date.now() + 30 * 24 * 3600 * 1000).toUTCString()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503, headers: { 'retry-after': farFuture } })))
    const error = await postSse(connection, 'chat/completions', {}).catch((caught: unknown) => caught)
    expect((error as FailureCarrier).failure.providerRetryAfterMs).toBe(MAX_PROVIDER_RETRY_AFTER_MS)
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
