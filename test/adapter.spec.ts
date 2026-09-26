import { afterEach, describe, expect, it, vi } from 'vitest'
import { IMAGE_OFFLOAD_REQUIRED_CODE } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { ProtocomAdapter } from '../src/adapter.ts'
import { resolveAdapterOptions } from '../src/config.ts'
import type { Config } from '../src/config.ts'
import { postSse } from '../src/protocol/http.ts'
import { DEFAULT_RETRY_MAX_ATTEMPTS, DEFAULT_RETRY_MAX_DELAY_MS, RETRY_INITIAL_DELAY_MS } from '../src/config.ts'

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

  /**
   * Drain one request and return the failure it raised, if any.
   * @param adapter - the adapter under test.
   * @param count - how many image occurrences the request carries.
   * @param store - the attachment store answering for them.
   * @returns the raised error, or undefined when the request was sent.
   */
  async function failureFor(count: number, store: unknown): Promise<any> {
    const bodies: string[] = []
    vi.stubGlobal('fetch', capturingFetch(bodies))
    const adapter = adapterFor(AGGREGATE, store as never)
    try {
      for await (const _chunk of adapter.stream(request('protocom-aggregate', VISION_MODEL, imageBlocks(count)))) {
        // drain
      }
    } catch (error) {
      return error
    }
    return undefined
  }

  it('declares a count-budget overrun instead of dropping images itself', async () => {
    // Since 1.7 an adapter does not silently project images away: it reports how
    // many oldest occurrences must go, and the session-level executor records
    // that choice durably and retries. Offloading here instead would make the
    // decision per-request and invisible to replay.
    const error = await failureFor(601, attachments)
    expect(error?.failure?.code).toBe(IMAGE_OFFLOAD_REQUIRED_CODE)
    expect(error?.failure?.offloadImages).toBeGreaterThan(0)
  })

  it('declares a byte-budget overrun at the exact number of occurrences', async () => {
    const big = new Uint8Array(11 * 1024 * 1024)
    const bigAttachments = { readImageRequest: vi.fn(async () => ({ mediaType: 'image/png', data: big })) }
    const error = await failureFor(2, bigAttachments)
    // 2 x 11 MiB encodes past the 20 MiB whole-request bound, so exactly the
    // oldest one has to go -- not both.
    expect(error?.failure?.code).toBe(IMAGE_OFFLOAD_REQUIRED_CODE)
    expect(error?.failure?.offloadImages).toBe(1)
  })

  it('renders an already-offloaded image as its placeholder', async () => {
    // The offloaded set is a durable surface fact, so every route renders the
    // same selection as text; a replayed conversation must not silently
    // re-send an attachment the budget already dropped.
    const bodies: string[] = []
    vi.stubGlobal('fetch', capturingFetch(bodies))
    const adapter = adapterFor(AGGREGATE, attachments)
    const blocks = imageBlocks(1) as Record<string, unknown>[]
    ;(blocks[0] as Record<string, unknown>)['offloaded'] = true
    for await (const _chunk of adapter.stream(request('protocom-aggregate', VISION_MODEL, blocks))) {
      // drain
    }
    const body = bodies[0] as string
    // With no images left the serializer collapses the message to a plain
    // string, so the check is on the wire body rather than on content parts.
    expect(body).not.toContain('image_url')
    expect(body).toContain('image omitted to fit request image limits')
  })
})

describe('declared retry policy (F-3)', () => {
  it('declares an overnight-shaped policy by default', () => {
    const policy = adapterFor(CODEX).providerRetryPolicy('protocom-codex')
    expect(policy).toMatchObject({
      mode: 'normal',
      maxRetries: DEFAULT_RETRY_MAX_ATTEMPTS,
      initialDelayMs: RETRY_INITIAL_DELAY_MS,
      maxDelayMs: DEFAULT_RETRY_MAX_DELAY_MS,
    })
    // A permanent refusal must fail at once rather than wait out the budget.
    expect(policy?.mode === 'normal' ? policy.retryableCodes : []).not.toContain('AUTH')
    expect(policy?.mode === 'normal' ? policy.retryableCodes : []).not.toContain('INVALID_REQUEST')
  })

  it('pins a forwarded Retry-After inside the policy the retry layer consumes', async () => {
    const adapter = adapterFor(CODEX)
    const policy = adapter.providerRetryPolicy('protocom-codex')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { message: 'slow down' } }),
      { status: 429, headers: { 'retry-after': '86400' } },
    )))
    // The adapter passes its own live ceiling into the transport, which is the
    // production path; the assertion below is the invariant that must hold.
    const error = await postSse({
      baseURL: 'https://relay.test',
      apiKey: 'k',
      retryAfterCeilingMs: policy?.maxDelayMs,
    }, 'chat/completions', {}).catch((caught: unknown) => caught)
    const delay = (error as { failure: { providerRetryAfterMs: number } }).failure.providerRetryAfterMs
    // llm-retry cancels a retry when providerRetryAfterMs > policy.maxDelayMs in
    // normal mode; the clamp and the declared policy must make that unreachable.
    expect(delay).toBeLessThanOrEqual(policy?.maxDelayMs as number)
  })

  it('follows a raised ceiling from the settings instead of a pinned constant', () => {
    const adapter = adapterFor({
      baseURL: 'https://relay.test',
      allowCustomBaseURL: true,
      retryMaxAttempts: 40,
      retryMaxDelayMs: 7_200_000,
    })
    const policy = adapter.providerRetryPolicy('protocom-codex')
    expect(policy).toMatchObject({ maxRetries: 40, maxDelayMs: 7_200_000 })
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

describe('image capability (issues 2a/2b)', () => {
  const STEPFUN = {
    baseURL: 'https://relay.test',
    allowCustomBaseURL: true,
    groups: { stepfun: { enabled: true, apiKey: 'PROTOCOM_STEPFUN_API_KEY' } },
  }
  const image = [{
    type: 'image',
    attachment: { attachmentId: `sha256:${'a'.repeat(64)}`, mediaType: 'image/png', width: 1, height: 1, bytes: 1 },
  }]
  const attachments = { readImageRequest: vi.fn(async () => ({ mediaType: 'image/png', data: Uint8Array.of(1) })) }

  it('advertises image input for a listed model nobody has judged', async () => {
    // The endpoint discloses no modality for any model, so a model it lists
    // and the plugin holds no verdict for must still be reachable with an
    // image: refusing it is exactly what made Step 3.7/5 unusable with one.
    const resolved = await adapterFor(STEPFUN).resolveModel('protocom-stepfun', 'step-3.7-flash')
    expect(resolved.inputModalities).toEqual(['text', 'image'])
  })

  it('removes the image modality from a model the deployment declared text-only', async () => {
    const resolved = await adapterFor({ ...STEPFUN, visionModels: { 'step-3.7-flash': false } })
      .resolveModel('protocom-stepfun', 'step-3.7-flash')
    expect(resolved.inputModalities).toEqual(['text'])
  })

  it('refuses an image the deployment declared this model cannot take', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const adapter = adapterFor({ ...STEPFUN, visionModels: { 'step-3.7-flash': false } }, attachments)
    const consume = async (): Promise<void> => {
      for await (const _chunk of adapter.stream(request('protocom-stepfun', 'step-3.7-flash', image))) {
        // drain
      }
    }
    await expect(consume()).rejects.toMatchObject({ code: 'UNSUPPORTED_CONTENT' })
    expect(attachments.readImageRequest).not.toHaveBeenCalled()
  })

  it('carries an image on a responses-protocol group too', async () => {
    const bodies: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(String(init?.body))
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(
            'data: {"type":"response.completed","response":{"status":"completed"}}\n\n',
          ))
          controller.close()
        },
      })
      return new Response(body, { status: 200 })
    }))
    const adapter = adapterFor(CODEX, attachments)
    for await (const _chunk of adapter.stream(request('protocom-codex', 'gpt-5.6-sol', image))) {
      // drain
    }
    // The protocol used to refuse images outright, so a vision model on the
    // Codex group could not be given one at all.
    const parsed = JSON.parse(bodies[0] as string) as { input: { content?: { type?: string; image_url?: string }[] }[] }
    const parts = parsed.input.flatMap(item => item.content ?? [])
    expect(parts.some(part => part.type === 'input_image'
      && String(part.image_url).startsWith('data:image/png;base64,'))).toBe(true)
  })
})
