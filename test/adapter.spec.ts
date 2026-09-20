import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { ProtocomAdapter } from '../src/adapter.ts'
import { resolveAdapterOptions } from '../src/config.ts'
import type { Config } from '../src/config.ts'
import { MAX_PROVIDER_RETRY_AFTER_MS, postSse } from '../src/protocol/http.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

function adapterFor(config: Config, attachments?: unknown): ProtocomAdapter {
  const options = resolveAdapterOptions(config)
  return new ProtocomAdapter({
    options: () => options,
    resolveApiKey: async () => 'test-key',
    ...attachments === undefined ? {} : { resolveAttachments: () => attachments as never },
  })
}

function request(provider: string, model: string, content: readonly unknown[]): GenerateOptions {
  return {
    provider,
    model,
    messages: [{ role: 'user', content }],
  } as unknown as GenerateOptions
}

/** A response body that never sends an event and never closes. */
function stalledFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const signal = init?.signal
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')))
      },
    })
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  })
}

const CODEX = {
  baseURL: 'https://relay.test',
  allowCustomBaseURL: true,
  streamIdleTimeoutMs: 30,
  groups: { codex: { enabled: true, apiKey: 'PROTOCOM_CODEX_API_KEY' } },
}

describe('stream idle watchdog (P1-4)', () => {
  it('aborts a provider stream that goes idle past the watchdog interval', async () => {
    vi.stubGlobal('fetch', stalledFetch())
    const adapter = adapterFor(CODEX)
    const consume = async (): Promise<void> => {
      for await (const _chunk of adapter.stream(request('protocom-codex', 'gpt-5.6-sol', [{ type: 'text', text: 'hi' }]))) {
        // drain
      }
    }
    await expect(consume()).rejects.toMatchObject({ code: 'TIMEOUT' })
  })

  it('still completes a stream that keeps producing events', async () => {
    const payload = 'data: {"type":"response.output_text.delta","delta":"ok"}\n\ndata: {"type":"response.completed","response":{"status":"completed"}}\n\n'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(payload, { status: 200 })))
    const adapter = adapterFor(CODEX)
    const chunks: unknown[] = []
    for await (const chunk of adapter.stream(request('protocom-codex', 'gpt-5.6-sol', [{ type: 'text', text: 'hi' }]))) {
      chunks.push(chunk)
    }
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
  })
})

describe('whole-request image budget (P2-2)', () => {
  const AGGREGATE = {
    baseURL: 'https://relay.test',
    allowCustomBaseURL: true,
    groups: { aggregate: { enabled: true, apiKey: 'PROTOCOM_AGGREGATE_API_KEY' } },
  }
  const VISION_MODEL = 'Qwen/Qwen3.8-27B'

  function imageBlocks(count: number): unknown[] {
    return Array.from({ length: count }, (_, index) => ({
      type: 'image',
      attachment: {
        attachmentId: `sha256:${String(index).padStart(64, '0')}`,
        mediaType: 'image/png',
        width: 1,
        height: 1,
        bytes: 1,
      },
    }))
  }

  function capturingFetch(bodies: string[]): ReturnType<typeof vi.fn> {
    return vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(String(init?.body))
      const encoder = new TextEncoder()
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        },
      })
      return new Response(body, { status: 200 })
    })
  }

  const attachments = {
    readImageRequest: vi.fn(async () => ({ mediaType: 'image/png', data: Uint8Array.of(1) })),
  }

  function partsOf(body: string): { type?: string; text?: string }[] {
    const parsed = JSON.parse(body) as { messages: { content: { type?: string; text?: string }[] }[] }
    return parsed.messages.flatMap(message => Array.isArray(message.content) ? message.content : [])
  }

  it('passes a small image set through untouched', async () => {
    const bodies: string[] = []
    vi.stubGlobal('fetch', capturingFetch(bodies))
    const adapter = adapterFor(AGGREGATE, attachments)
    for await (const _chunk of adapter.stream(request('protocom-aggregate', VISION_MODEL, imageBlocks(2)))) {
      // drain
    }
    const parts = partsOf(bodies[0] as string)
    expect(parts.filter(part => part.type === 'image_url')).toHaveLength(2)
    expect(parts.some(part => part.type === 'text' && String(part.text).includes('image omitted'))).toBe(false)
  })

  it('drops the oldest images past the count budget into text placeholders', async () => {
    const bodies: string[] = []
    vi.stubGlobal('fetch', capturingFetch(bodies))
    const adapter = adapterFor(AGGREGATE, attachments)
    for await (const _chunk of adapter.stream(request('protocom-aggregate', VISION_MODEL, imageBlocks(601)))) {
      // drain
    }
    const parts = partsOf(bodies[0] as string)
    expect(parts.filter(part => part.type === 'image_url')).toHaveLength(600)
    const placeholder = parts.find(part => part.type === 'text')
    expect(String(placeholder?.text)).toContain('image omitted to fit request image limits')
  })

  it('drops the oldest images past the byte budget', async () => {
    const bodies: string[] = []
    vi.stubGlobal('fetch', capturingFetch(bodies))
    const big = new Uint8Array(11 * 1024 * 1024)
    const bigAttachments = { readImageRequest: vi.fn(async () => ({ mediaType: 'image/png', data: big })) }
    const adapter = adapterFor(AGGREGATE, bigAttachments)
    for await (const _chunk of adapter.stream(request('protocom-aggregate', VISION_MODEL, imageBlocks(2)))) {
      // drain
    }
    const parts = partsOf(bodies[0] as string)
    // 2 x 11 MiB encodes past the 20 MiB whole-request bound, so the oldest goes.
    expect(parts.filter(part => part.type === 'image_url')).toHaveLength(1)
    expect(parts.some(part => part.type === 'text' && String(part.text).includes('image omitted'))).toBe(true)
  })
})

describe('declared retry policy (F-3)', () => {
  it('pins a forwarded Retry-After inside the policy the retry layer consumes', async () => {
    const policy = adapterFor(CODEX).providerRetryPolicy('protocom-codex')
    expect(policy?.mode).toBe('normal')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { message: 'slow down' } }),
      { status: 429, headers: { 'retry-after': '86400' } },
    )))
    const error = await postSse({ baseURL: 'https://relay.test', apiKey: 'k' }, 'chat/completions', {})
      .catch((caught: unknown) => caught)
    const delay = (error as { failure: { providerRetryAfterMs: number } }).failure.providerRetryAfterMs
    // llm-retry cancels a retry when providerRetryAfterMs > policy.maxDelayMs in
    // normal mode; the clamp and the declared policy must make that unreachable.
    expect(delay).toBeLessThanOrEqual(policy?.maxDelayMs as number)
    expect(policy?.maxDelayMs).toBe(MAX_PROVIDER_RETRY_AFTER_MS)
  })
})

describe('pre-stream idle bound (F-6)', () => {
  it('bounds a stalled image projection with the same idle timeout', async () => {
    vi.stubGlobal('fetch', vi.fn())
    // Deliberately ignores every abort signal: the idle bound must hold on its
    // own, not merely notify a store that happens to cooperate.
    const hanging = { readImageRequest: vi.fn(() => new Promise(() => {})) }
    const adapter = adapterFor({
      baseURL: 'https://relay.test',
      allowCustomBaseURL: true,
      streamIdleTimeoutMs: 30,
      groups: { aggregate: { enabled: true, apiKey: 'PROTOCOM_AGGREGATE_API_KEY' } },
    }, hanging)
    const image = [{
      type: 'image',
      attachment: { attachmentId: `sha256:${'0'.repeat(64)}`, mediaType: 'image/png', width: 1, height: 1, bytes: 1 },
    }]
    const consume = async (): Promise<void> => {
      for await (const _chunk of adapter.stream(request('protocom-aggregate', 'Qwen/Qwen3.8-27B', image))) {
        // drain
      }
    }
    await expect(consume()).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(hanging.readImageRequest).toHaveBeenCalledOnce()
  })
})
