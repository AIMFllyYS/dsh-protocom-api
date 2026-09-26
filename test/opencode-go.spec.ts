import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { ProtocomAdapter } from '../src/adapter.ts'
import { Config, GoSection, resolveAdapterOptions } from '../src/config.ts'
import { GO_DEFAULT_BASE_URL, OPENCODE_GO } from '../src/family.ts'
import { GO_REFUSED_MODEL_IDS, GO_REGISTRY, groupCatalog, matchRegistry } from '../src/model-registry.ts'
import { serializeChatRequest, ThinkTagExtractor, translateChatCompletions } from '../src/protocol/chat-completions.ts'
import { parseSse, parseSseUntilEof } from '../src/sse.ts'
import { goUsageFetchHandler, GoUsageService, parseGoUsage } from '../src/go-usage.ts'
import type { GoUsageHooks } from '../src/go-usage.ts'
import type { ResolvedProtocomOptions } from '../src/config.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

const GO_CONFIG = {
  groups: { go: { enabled: true, apiKey: 'OPENCODE_GO_API_KEY' } },
}

describe('OpenCode Go options resolution', () => {
  it('ships the official endpoint and the single go route', () => {
    const resolved = resolveAdapterOptions({}, OPENCODE_GO)
    expect(resolved.family).toBe(OPENCODE_GO)
    expect(resolved.baseURL).toBe(GO_DEFAULT_BASE_URL)
    const go = resolved.groups.get('go')
    expect(go?.provider).toBe('opencode-go-sub')
    expect(go?.displayName).toBe('OpenCode Go')
    expect(go?.protocol).toBe('chat-completions')
    expect(go?.enabled).toBe(false)
  })

  it('accepts an OPENCODE_* credential reference and refuses a foreign one', () => {
    const resolved = resolveAdapterOptions(GO_CONFIG, OPENCODE_GO)
    expect(resolved.groups.get('go')?.apiKeyRef).toBe('OPENCODE_GO_API_KEY')
    expect(() => resolveAdapterOptions(
      { groups: { go: { enabled: true, apiKey: 'PROTOCOM_API_KEY' } } },
      OPENCODE_GO,
    )).toThrowError(/opencode-go: group "go" apiKey "PROTOCOM_API_KEY" must match/)
  })

  it('pins a custom baseURL behind the same confirmation flag', () => {
    // Without the flag the write is refused outright — a silent redirect is
    // how a subscription key would leak to a look-alike host.
    expect(() => resolveAdapterOptions(
      { baseURL: 'https://opencode.ai.evil.test' },
      OPENCODE_GO,
    )).toThrowError(/allowCustomBaseURL/)
    expect(resolveAdapterOptions(
      { baseURL: 'https://staging.opencode.ai', allowCustomBaseURL: true },
      OPENCODE_GO,
    ).baseURL).toBe('https://staging.opencode.ai')
  })
})

describe('OpenCode Go config schema', () => {
  it('treats an empty contextLengths array as unset (schemastery normalizes missing to [])', () => {
    // A described section document can carry contextLengths: [] for a group
    // the user never edited; that must not collapse every model to its raw
    // context window — the shipped ladder still applies.
    const resolved = resolveAdapterOptions(
      { groups: { go: { enabled: true, contextLengths: [] } } },
      OPENCODE_GO,
    )
    expect(resolved.groups.get('go')?.contextLengths).toEqual([204_800, 262_144, 409_600, 1_048_576])
  })

  it('parses a nested opencode section alongside the protocom one', () => {
    const parsed = Config({
      groups: { codex: { enabled: true } },
      opencode: { groups: { go: { enabled: true, apiKey: 'OPENCODE_GO_API_KEY' } } },
    })
    expect(parsed.opencode?.groups['go']?.enabled).toBe(true)
    expect(parsed.opencode?.groups['go']?.apiKey).toBe('OPENCODE_GO_API_KEY')
    // The Go section's own shipped defaults land on its own document.
    expect(parsed.opencode?.baseURL).toBe(GO_DEFAULT_BASE_URL)
  })

  it('defaults a missing opencode section to the shipped document', () => {
    const parsed = GoSection({})
    expect(parsed.baseURL).toBe(GO_DEFAULT_BASE_URL)
    expect(parsed.recommendedModels?.length).toBeGreaterThan(0)
  })
})

describe('OpenCode Go registry', () => {
  it('serves every catalog row under the go group', () => {
    const catalog = groupCatalog('go', undefined, { family: OPENCODE_GO })
    expect(catalog.length).toBeGreaterThan(0)
    // Verified against the live endpoint: these two ids are refused outright
    // (503 on both protocols / "Model is unavailable"), so the menu never lists them.
    for (const id of GO_REFUSED_MODEL_IDS) {
      expect(catalog.some(model => model.upstreamId === id)).toBe(false)
    }
  })

  it('carries the per-model protocol override the live route verified', () => {
    // chat-completions 503s on these five; only /responses accepts them.
    for (const id of ['grok-4.6', 'grok-4.7', 'muse-spark-1.2-contributor', 'muse-spark-1.3-contributor', 'gpt-5.6-luna']) {
      expect(matchRegistry(id, GO_REGISTRY)?.protocol).toBe('responses')
    }
    expect(matchRegistry('glm-5.3', GO_REGISTRY)?.protocol).toBeUndefined()
    expect(matchRegistry('minimax-m3', GO_REGISTRY)?.inlineReasoning).toBe(true)
  })

  it('declares each route\'s verified effort vocabulary, including its disable word', () => {
    // kimi-k2.7-code rejects 'none' and disables with 'off'.
    const code = matchRegistry('kimi-k2.7-code', GO_REGISTRY)?.reasoning?.efforts
    expect(code).toContain('off')
    expect(code).not.toContain('none')
    // qwen3.6-plus spells its low rung 'minimum' and has no 'max'.
    const plus = matchRegistry('qwen3.6-plus', GO_REGISTRY)?.reasoning?.efforts
    expect(plus).toEqual(expect.arrayContaining(['minimum', 'xhigh']))
    expect(plus).not.toContain('max')
    // A never-reasoner that still accepts the effort field declares no menu.
    expect(matchRegistry('hy3', GO_REGISTRY)?.reasoning).toBeUndefined()
  })
})

describe('effort-only thinking serialization', () => {
  const options = (effort?: string): GenerateOptions => ({
    provider: 'opencode-go-sub',
    model: 'glm-5.3',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    ...effort === undefined ? {} : { reasoningEffort: effort },
  } as unknown as GenerateOptions)

  it('writes reasoning_effort verbatim and never a thinking block', () => {
    const body = serializeChatRequest(options('high'), 'glm-5.3', undefined, false, 'keep', 'effort-only')
    expect(body).toMatchObject({ reasoning_effort: 'high' })
    expect('thinking' in body).toBe(false)
  })

  it('keeps the disable word as an effort value (GLM rejects thinking.disabled)', () => {
    const body = serializeChatRequest(options('none'), 'glm-5.3', undefined, false, 'keep', 'effort-only')
    expect(body).toMatchObject({ reasoning_effort: 'none' })
  })

  it('leaves the field off when the menu stored no choice', () => {
    const body = serializeChatRequest(options(), 'glm-5.3', undefined, false, 'keep', 'effort-only')
    expect('reasoning_effort' in body).toBe(false)
    expect('thinking' in body).toBe(false)
  })
})

describe('ThinkTagExtractor (minimax-m3 inline <think>)', () => {
  it('lifts a complete tag out of surrounding text', () => {
    const extractor = new ThinkTagExtractor()
    expect([...extractor.feed('a<think>b</think>c'), ...extractor.flush()]).toEqual([
      { kind: 'text', text: 'a' },
      { kind: 'reasoning', text: 'b' },
      { kind: 'text', text: 'c' },
    ])
  })

  it('holds a tag prefix split across chunks until it resolves', () => {
    const extractor = new ThinkTagExtractor()
    const segments = [
      ...extractor.feed('x<thi'),
      ...extractor.feed('nk>y</th'),
      ...extractor.feed('ink>z'),
      ...extractor.flush(),
    ]
    expect(segments).toEqual([
      { kind: 'text', text: 'x' },
      { kind: 'reasoning', text: 'y' },
      { kind: 'text', text: 'z' },
    ])
  })

  it('passes an orphan closer through as text', () => {
    const extractor = new ThinkTagExtractor()
    expect([...extractor.feed('a</think>b'), ...extractor.flush()]).toEqual([
      { kind: 'text', text: 'a</think>b' },
    ])
  })
})

describe('chat-completions translation of Go reasoning channels', () => {
  const sse = (delta: unknown): string =>
    `data: ${JSON.stringify({ choices: [{ index: 0, delta }] })}\n\ndata: [DONE]\n\n`

  async function collect(text: string, options: { inlineReasoning?: boolean; untilEof?: boolean } = {}) {
    const bytes = new TextEncoder().encode(text)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(bytes); controller.close() },
    })
    const payloads = options.untilEof === true ? parseSseUntilEof(stream) : parseSse(stream)
    const chunks: { type: string; text?: string }[] = []
    for await (const chunk of translateChatCompletions(
      payloads,
      options.inlineReasoning === true ? { inlineReasoning: true } : {},
    )) chunks.push(chunk as { type: string; text?: string })
    return chunks
  }

  it('reads delta.reasoning_content', async () => {
    const chunks = await collect(sse({ reasoning_content: 'r' }))
    expect(chunks).toContainEqual({ type: 'reasoning-delta', index: 0, text: 'r' })
  })

  it('reads delta.reasoning, with reasoning_details only as fallback (MiniMax M2.5)', async () => {
    // The M2.5 stream carries both spellings repeating the same text; the
    // reader must not double-emit them.
    const chunks = await collect(sse({
      reasoning: 'a',
      reasoning_details: [{ type: 'reasoning.text', text: 'a' }],
    }))
    expect(chunks).toContainEqual({ type: 'reasoning-delta', index: 0, text: 'a' })
    expect(chunks.filter(chunk => chunk.type === 'reasoning-delta')).toHaveLength(1)
    const detailsOnly = await collect(sse({
      reasoning_details: [{ type: 'reasoning.text', text: 'b' }],
    }))
    expect(detailsOnly).toContainEqual({ type: 'reasoning-delta', index: 0, text: 'b' })
  })

  it('extracts inline <think> markup when the model needs it', async () => {
    const chunks = await collect(sse({ content: 'out<think>rr</think>tail' }), { inlineReasoning: true })
    // The inline think block opens beside the text block, which resumes after.
    expect(chunks).toContainEqual({ type: 'reasoning-delta', index: 1, text: 'rr' })
    expect(chunks).toContainEqual({ type: 'text-delta', index: 0, text: 'out' })
    expect(chunks).toContainEqual({ type: 'text-delta', index: 0, text: 'tail' })
  })

  it('leaves inline markup alone when the model does not need extraction', async () => {
    const chunks = await collect(sse({ content: 'a<think>b</think>c' }))
    expect(chunks).toContainEqual({ type: 'text-delta', index: 0, text: 'a<think>b</think>c' })
  })

  it('honours a finish_reason at EOF when a route never sends [DONE]', async () => {
    // Verified live: minimax-m3 closes after finish_reason + a usage chunk.
    const noDone = [
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: 'a' } }] })}`,
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}`,
      `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 } })}`,
    ].join('\n\n') + '\n\n'
    const chunks = await collect(noDone, { untilEof: true })
    expect(chunks).toContainEqual({ type: 'finish', reason: { kind: 'stop' } })
    expect(chunks).toContainEqual({
      type: 'usage',
      usage: { inputTokens: 3, outputTokens: 1, totalTokens: 4 },
    })
  })

  it('still refuses a bare EOF that arrived with no finish_reason', async () => {
    await expect(collect(
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: 'a' } }] })}\n\n`,
      { untilEof: true },
    )).rejects.toMatchObject({ code: 'STREAM_CLOSED' })
  })
})

describe('OpenCode Go usage view', () => {
  it('normalizes the live /v1/usage shape and ignores unknown fields', () => {
    const view = parseGoUsage({
      usage: {
        rolling: { status: 'ok', percent: 12.5, resetsAt: '2026-09-21T08:00:00Z' },
        weekly: { status: 'rate-limited', percent: 100 },
        surprise: { field: true },
      },
    })
    expect(view?.rolling).toEqual({ status: 'ok', percent: 12.5, resetsAt: '2026-09-21T08:00:00Z' })
    expect(view?.weekly).toEqual({ status: 'rate-limited', percent: 100 })
    expect(view?.monthly).toBeUndefined()
  })

  it('accepts the flat view the fenced route serves', () => {
    // /api/opencode-go/usage returns the normalized GoUsageView directly, not
    // the upstream {usage:{}} envelope — the strip must parse that reply.
    const view = parseGoUsage({ rolling: { status: 'ok', percent: 2 }, weekly: { percent: 0 } })
    expect(view?.rolling).toEqual({ status: 'ok', percent: 2 })
    expect(view?.weekly).toEqual({ percent: 0 })
  })

  it('refuses a body that is not a usage object', () => {
    expect(parseGoUsage(null)).toBeUndefined()
    expect(parseGoUsage([1, 2])).toBeUndefined()
    expect(parseGoUsage({ usage: 7 })).toBeUndefined()
    expect(parseGoUsage('{}')).toBeUndefined()
  })
})

describe('OpenCode Go usage route', () => {
  function hooksWith(enabled: boolean, options?: Partial<ResolvedProtocomOptions>): GoUsageHooks {
    const resolved = resolveAdapterOptions(
      { groups: { go: { enabled, apiKey: 'OPENCODE_GO_API_KEY' } } },
      OPENCODE_GO,
    )
    return {
      options: () => ({ ...resolved, ...options }),
      resolveApiKey: async () => 'oc_sk_test',
      log: () => {},
    }
  }

  it('serves the quota windows with no-store headers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      usage: { rolling: { status: 'ok', percent: 4 } },
    }), { status: 200 })))
    const handler = goUsageFetchHandler(new GoUsageService(hooksWith(true)), hooksWith(true))
    const response = await handler(new Request('http://127.0.0.1:3080/api/opencode-go/usage'))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ rolling: { status: 'ok', percent: 4 } })
  })

  it('answers 405 to non-GET and 404 when the group is off', async () => {
    const hooks = hooksWith(true)
    const handler = goUsageFetchHandler(new GoUsageService(hooks), hooks)
    expect((await handler(new Request('http://x/', { method: 'POST' }))).status).toBe(405)
    const offHooks = hooksWith(false)
    const offHandler = goUsageFetchHandler(new GoUsageService(offHooks), offHooks)
    expect((await offHandler(new Request('http://x/'))).status).toBe(404)
  })

  it('answers a fixed 502 body on an upstream failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })))
    const hooks = hooksWith(true)
    const handler = goUsageFetchHandler(new GoUsageService(hooks), hooks)
    const response = await handler(new Request('http://x/'))
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'the usage query failed' })
  })
})

describe('OpenCode Go adapter requests', () => {
  function adapter() {
    const options = resolveAdapterOptions(GO_CONFIG, OPENCODE_GO)
    return new ProtocomAdapter({
      options: () => options,
      resolveApiKey: async () => 'oc_sk_test',
    })
  }

  function capture() {
    const requests: { url: string; init: RequestInit }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, init: init as RequestInit })
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"index":0,"delta":{"reasoning_content":"r"}}]}\n\ndata: [DONE]\n\n'))
            controller.close()
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      )
    }))
    return requests
  }

  it('sends both session headers with the harness session id', async () => {
    const requests = capture()
    const options = {
      provider: 'opencode-go-sub',
      model: 'glm-5.3',
      sessionId: 'session-xyz',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    } as unknown as GenerateOptions
    for await (const _chunk of adapter().stream(options)) { /* drain */ }
    expect(requests).toHaveLength(1)
    const headers = new Headers(requests[0]?.init.headers)
    expect(headers.get('x-opencode-session')).toBe('session-xyz')
    expect(headers.get('x-deepseek-harness-session-id')).toBe('session-xyz')
  })

  it('writes the effort word verbatim for an effort-only route', async () => {
    const requests = capture()
    const options = {
      provider: 'opencode-go-sub',
      model: 'glm-5.3',
      sessionId: 'session-xyz',
      reasoningEffort: 'xhigh',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    } as unknown as GenerateOptions
    for await (const _chunk of adapter().stream(options)) { /* drain */ }
    const body = JSON.parse(String(requests[0]?.init.body))
    expect(body.reasoning_effort).toBe('xhigh')
    expect('thinking' in body).toBe(false)
  })
})

describe('grok-4.7 routing', () => {
  // The endpoint lists grok-4.7 and serves it on /v1/responses, but the Go
  // gateway 503s it on /v1/chat/completions exactly like the rest of the grok
  // family. With no registry entry the id fell back to the group's chat
  // protocol, so every call answered 503 "Endpoint is unavailable" (measured).
  // The entry is what routes it, so this guards against losing it again.
  it('routes grok-4.7 through the responses protocol', () => {
    const entry = matchRegistry('grok-4.7', GO_REGISTRY)
    expect(entry).toBeDefined()
    expect(entry?.protocol).toBe('responses')
  })

  it('carries grok-4.7 in the go menu', () => {
    const catalog = groupCatalog('go', undefined, { family: OPENCODE_GO })
    expect(catalog.some(model => model.upstreamId === 'grok-4.7')).toBe(true)
  })

  it('declares grok-4.7 its own probed effort vocabulary', () => {
    // Probed model by model rather than inherited: minimal/low/medium/high/
    // xhigh answer 200 and none/max answer 400 -- the same set as grok-4.6,
    // verified separately so a future divergence is caught here.
    const efforts = matchRegistry('grok-4.7', GO_REGISTRY)?.reasoning?.efforts
    expect(efforts).toEqual(expect.arrayContaining(['minimal', 'low', 'medium', 'high', 'xhigh']))
    expect(efforts).not.toContain('none')
    expect(efforts).not.toContain('max')
  })
})
