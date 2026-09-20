import { Context } from '@deepseek-ai/cordis'
import { HostConnectionService } from '@deepseek-ai/dsh-client-connection'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BalanceService, balanceFetchHandler } from '../src/balance.ts'
import type { BalanceHooks } from '../src/balance.ts'
import { resolveAdapterOptions } from '../src/config.ts'
import type { Config } from '../src/config.ts'

const USAGE = { mode: 'quota_limited', quota: { limit: 100, used: 1, remaining: 99 } }
const RATES = { resolved_rate_multiplier: 0.8 }

function configWith(aggregate: Record<string, unknown>): Config {
  return { baseURL: 'https://relay.test', allowCustomBaseURL: true, groups: { aggregate } }
}

function harness(config: Config, log = vi.fn()): {
  handler: (request: Request) => Promise<Response>
  hooks: BalanceHooks
} {
  const options = resolveAdapterOptions(config)
  const hooks: BalanceHooks = {
    options: () => options,
    resolveApiKey: async () => 'test-key',
    log,
  }
  return { handler: balanceFetchHandler(new BalanceService(hooks), hooks), hooks }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('balance Fetch handler (P0-1, P2-1)', () => {
  it('answers every enabled balance-reporting group with no-store and nosniff', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(USAGE))
    vi.stubGlobal('fetch', fetchMock)
    const { handler } = harness(configWith({ enabled: true, showBalance: true }))
    const response = await handler(new Request('http://127.0.0.1:3080/api/protocom-api/balance'))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await response.json()).toEqual({ groups: { aggregate: { mode: 'quota_limited', limit: 100, used: 1, remaining: 99 } } })
    // No group parameter means no billing-rate fan-out: one upstream call per group.
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('rejects a non-GET method without touching the upstream', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { handler } = harness(configWith({ enabled: true, showBalance: true }))
    const response = await handler(new Request('http://127.0.0.1:3080/api/protocom-api/balance', { method: 'POST' }))
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('hides a disabled or non-reporting group identically, without touching the upstream', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    for (const group of [{ enabled: true, showBalance: false }, { enabled: false, showBalance: true }]) {
      const { handler } = harness(configWith(group))
      const response = await handler(new Request('http://127.0.0.1:3080/api/protocom-api/balance?group=aggregate'))
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ error: 'no enabled balance-reporting group' })
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('opts into the billing-rate enrichment only for an explicit group', async () => {
    const fetchMock = vi.fn(async (url: string) => (
      String(url).includes('billing') ? jsonResponse(RATES) : jsonResponse(USAGE)
    ))
    vi.stubGlobal('fetch', fetchMock)
    const { handler } = harness(configWith({ enabled: true, showBalance: true }))
    const response = await handler(new Request('http://127.0.0.1:3080/api/protocom-api/balance?group=aggregate'))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ rateMultiplier: 0.8 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps the upstream detail out of the response and in the log', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'nope' }, 401)))
    const log = vi.fn()
    const { handler } = harness(configWith({ enabled: true, showBalance: true, apiKey: 'PROTOCOM_AGGREGATE_API_KEY' }), log)
    const response = await handler(new Request('http://127.0.0.1:3080/api/protocom-api/balance?group=aggregate'))
    expect(response.status).toBe(502)
    const body = await response.text()
    expect(body).toBe(JSON.stringify({ error: 'the balance query failed' }))
    expect(body).not.toContain('PROTOCOM')
    expect(body).not.toContain('relay.test')
    expect(log).toHaveBeenCalledOnce()
    expect(String(log.mock.calls[0]?.[0])).toContain('relay.test')
  })

  it('backs a failing group off instead of re-querying the upstream on every call', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'nope' }, 500))
    vi.stubGlobal('fetch', fetchMock)
    const { handler } = harness(configWith({ enabled: true, showBalance: true }))
    const request = new Request('http://127.0.0.1:3080/api/protocom-api/balance?group=aggregate')
    expect((await handler(request)).status).toBe(502)
    expect((await handler(request)).status).toBe(502)
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})

// --- The carrier fence the route now delegates to (P0-1) ----------------------

type TrustHeaders = Record<string, string>

/** Reproduce the Web carrier: fence first, then the shared /api Fetch handler. */
async function dispatch(
  connection: HostConnectionService,
  request: Request,
  trust: TrustHeaders,
): Promise<Response> {
  const rejection = connection.requestRejection({ headers: trust } as never)
  if (rejection !== undefined) {
    return new Response(rejection === 401 ? 'unauthorized' : 'forbidden', { status: rejection })
  }
  return connection.createSharedFetchHandler('/api').fetch(request)
}

async function mounted(isAuthenticated: boolean): Promise<{
  connection: HostConnectionService
  dispose: () => Promise<void>
}> {
  const ctx = new Context()
  const fiber = ctx.plugin((pluginCtx) => {
    new HostConnectionService(pluginCtx, [], { isAuthenticated: () => isAuthenticated } as never)
  })
  await fiber.await()
  return {
    connection: ctx.get('connection') as HostConnectionService,
    dispose: () => fiber.dispose(),
  }
}

async function register(connection: HostConnectionService, config: Config): Promise<() => Promise<void>> {
  const { handler } = harness(config)
  return connection.fetch.register({
    path: '/api/protocom-api/balance',
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: handler,
  })
}

describe('balance route is fenced by the Host carrier (P0-1, H3)', () => {
  const url = 'http://127.0.0.1:3080/api/protocom-api/balance?group=aggregate'
  const enabled = configWith({ enabled: true, showBalance: true })

  it('refuses a rebound Host before the route runs', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(USAGE))
    vi.stubGlobal('fetch', fetchMock)
    const { connection, dispose } = await mounted(true)
    await register(connection, enabled)
    const response = await dispatch(connection, new Request(url), {
      host: 'evil.test',
      origin: 'https://evil.test',
      'sec-fetch-site': 'cross-site',
    })
    expect(response.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
    await dispose()
  })

  it('refuses an unauthenticated caller on a loopback Host', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(USAGE))
    vi.stubGlobal('fetch', fetchMock)
    const { connection, dispose } = await mounted(false)
    await register(connection, enabled)
    const response = await dispatch(connection, new Request(url), { host: '127.0.0.1:3080' })
    expect(response.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
    await dispose()
  })

  it('serves an authenticated loopback caller', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(USAGE)))
    const { connection, dispose } = await mounted(true)
    await register(connection, enabled)
    const response = await dispatch(connection, new Request(url), { host: '127.0.0.1:3080' })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ limit: 100 })
    await dispose()
  })

  it('routes a non-GET method to the shared channel fallback, not to the handler', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { connection, dispose } = await mounted(true)
    await register(connection, enabled)
    const response = await dispatch(connection, new Request(url, { method: 'POST' }), { host: '127.0.0.1:3080' })
    // The exact route owns GET only, so the shared channel answers 404 and the
    // handler (and the upstream) are never reached.
    expect(response.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
    await dispose()
  })
})
