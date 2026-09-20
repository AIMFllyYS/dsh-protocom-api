import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LlmModelDiscoveryRequest } from '@deepseek-ai/dsh-llm'
import { discoverModels, endpointOrigin, fetchUpstreamModels, parseModelsListing } from '../src/discovery.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('model listing parsing', () => {
  it('reads the standard OpenAI data array', () => {
    const models = parseModelsListing({
      object: 'list',
      data: [
        { id: 'deepseek/deepseek-v4.1-flash', object: 'model', created: 1, owned_by: 'openai', type: 'model', display_name: 'deepseek/deepseek-v4.1-flash' },
        { id: 'gpt-5.6-sol', object: 'model', display_name: 'GPT-5.6 Sol' },
      ],
    })
    expect(models).toEqual([
      { id: 'deepseek/deepseek-v4.1-flash', displayName: 'deepseek/deepseek-v4.1-flash' },
      { id: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol' },
    ])
  })

  it('reads Anthropic-style entries with display_name and capacities', () => {
    const models = parseModelsListing({
      data: [
        { id: 'claude-ish', display_name: 'Claude-ish', context_length: 200_000, max_output_tokens: 8_192 },
      ],
    })
    expect(models).toEqual([
      { id: 'claude-ish', displayName: 'Claude-ish', contextWindow: 200_000, maxTokens: 8_192 },
    ])
  })

  it('reads grok-style reasoning capability metadata', () => {
    const models = parseModelsListing({
      data: [
        { id: 'grok-4.x', supportsReasoningEffort: true, reasoningEfforts: ['low', 'high'] },
        { id: 'grok-mini', supports_reasoning_effort: true, reasoning_efforts: ['minimal', 'high'] },
      ],
    })
    expect(models).toEqual([
      { id: 'grok-4.x', supportsReasoningEffort: true, reasoningEfforts: ['low', 'high'] },
      { id: 'grok-mini', supportsReasoningEffort: true, reasoningEfforts: ['minimal', 'high'] },
    ])
  })

  it('accepts a top-level models array and skips unusable rows', () => {
    const models = parseModelsListing({
      models: [
        { id: 'ok' },
        { name: 'no id here' },
        42,
        null,
      ],
    })
    expect(models).toEqual([{ id: 'ok' }])
  })

  it('refuses a reply with no recognizable listing', () => {
    expect(() => parseModelsListing({ hello: 'world' })).toThrowError(/neither a "data" nor a "models" array/)
  })

  it('bounds an oversized display label instead of carrying it into the catalog', () => {
    const models = parseModelsListing({ data: [{ id: 'm', display_name: 'x'.repeat(5_000) }] })
    expect(models[0]?.displayName).toHaveLength(256)
  })
})

describe('endpointOrigin', () => {
  it('normalizes equivalent spellings and refuses decorated values', () => {
    expect(endpointOrigin('https://Relay.Protocom.org/v1')).toBe('https://relay.protocom.org')
    expect(endpointOrigin('https://relay.protocom.org:443')).toBe('https://relay.protocom.org')
    expect(endpointOrigin('https://relay.protocom.org@evil.test')).toBeUndefined()
    expect(endpointOrigin('relay.protocom.org')).toBeUndefined()
    expect(endpointOrigin('ftp://relay.test')).toBeUndefined()
  })
})

const hooks = (configured: string, stored = 'stored-secret') => ({
  baseURL: () => configured,
  resolveApiKey: vi.fn(async () => stored),
})

describe('discovery credential/endpoint binding (P0-3)', () => {
  it('never sends a stored key to a caller-supplied foreign baseURL', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const discoveryHooks = hooks('https://relay.protocom.org')
    await expect(discoverModels(
      { provider: 'protocom-codex', baseURL: 'https://evil.test' } as LlmModelDiscoveryRequest,
      undefined,
      discoveryHooks,
    )).rejects.toThrowError(/differs from the configured baseURL/)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(discoveryHooks.resolveApiKey).not.toHaveBeenCalled()
  })

  it('still accepts a one-shot apiKey for a foreign endpoint', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'm' }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const discoveryHooks = hooks('https://relay.protocom.org')
    const models = await discoverModels(
      { provider: 'protocom-codex', baseURL: 'https://evil.test', apiKey: 'one-shot' } as LlmModelDiscoveryRequest,
      undefined,
      discoveryHooks,
    )
    expect(models).toEqual([{ id: 'm' }])
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://evil.test/v1/models')
    expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer one-shot')
    expect(discoveryHooks.resolveApiKey).not.toHaveBeenCalled()
  })

  it('sends the stored key to the configured origin, including an equivalent spelling', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const discoveryHooks = hooks('https://relay.protocom.org')
    await discoverModels(
      { provider: 'protocom-codex', baseURL: 'https://Relay.Protocom.org/v1' } as LlmModelDiscoveryRequest,
      undefined,
      discoveryHooks,
    )
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer stored-secret')
  })

  it('treats an empty apiKey as not supplied rather than sending an empty bearer', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await discoverModels(
      { provider: 'protocom-codex', apiKey: '' } as LlmModelDiscoveryRequest,
      undefined,
      hooks('https://relay.protocom.org'),
    )
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer stored-secret')
  })
})

describe('discovery response bounds (P1-3)', () => {
  it('caps an oversized chunked listing while streaming and cancels the body', async () => {
    let cancelled = false
    const chunk = new Uint8Array(1024 * 1024).fill(120)
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(chunk) },
      cancel() { cancelled = true },
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })))
    await expect(fetchUpstreamModels('https://relay.test')).rejects.toThrowError(/more than/)
    expect(cancelled).toBe(true)
  })

  it('reports a non-JSON and a non-2xx reply', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>not json</html>', { status: 200 })))
    await expect(fetchUpstreamModels('https://relay.test')).rejects.toThrowError(/did not answer with JSON/)

    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 401 })))
    await expect(fetchUpstreamModels('https://relay.test')).rejects.toThrowError(/answered 401/)
  })

  it('rejects a declared length past the cap without reading the body', async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true } })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, {
      status: 200,
      headers: { 'content-length': String(8 * 1024 * 1024) },
    })))
    await expect(fetchUpstreamModels('https://relay.test')).rejects.toThrowError(/more than/)
    expect(cancelled).toBe(true)
  })
})

describe('probe endpoint transport bound (F-4)', () => {
  it('refuses a plain-http probe endpoint even when a one-shot key is supplied', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(discoverModels(
      { provider: 'protocom-codex', baseURL: 'http://192.168.1.10:8080', apiKey: 'sk-live' } as LlmModelDiscoveryRequest,
      undefined,
      hooks('https://relay.protocom.org'),
    )).rejects.toThrowError(/not usable/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('still allows a loopback http probe endpoint', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await discoverModels(
      { provider: 'protocom-codex', baseURL: 'http://127.0.0.1:8080', apiKey: 'sk-live' } as LlmModelDiscoveryRequest,
      undefined,
      hooks('https://relay.protocom.org'),
    )
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
