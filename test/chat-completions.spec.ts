import { describe, expect, it } from 'vitest'
import type { GenerateOptions, Message, StreamChunk } from '@deepseek-ai/dsh-llm'
import { parseSse } from '../src/sse.ts'
import {
  mapFinishReason,
  mapUsage,
  resolveThinking,
  serializeChatRequest,
  translateChatCompletions,
} from '../src/protocol/chat-completions.ts'

function sseStream(text: string, chunkSize?: number): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text)
  return new ReadableStream({
    start(controller) {
      if (chunkSize === undefined) {
        controller.enqueue(bytes)
      } else {
        for (let at = 0; at < bytes.length; at += chunkSize) {
          controller.enqueue(bytes.slice(at, at + chunkSize))
        }
      }
      controller.close()
    },
  })
}

async function collect(text: string, chunkSize?: number): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of translateChatCompletions(parseSse(sseStream(text, chunkSize)))) {
    chunks.push(chunk)
  }
  return chunks
}

const THINKING_STREAM = [
  'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":"思考"},"finish_reason":""}]}',
  '',
  'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{"reasoning_content":"一下"},"finish_reason":""}]}',
  '',
  'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{"content":"你好"},"finish_reason":""}]}',
  '',
  'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{"content":"！"},"finish_reason":""}]}',
  '',
  // Terminal content chunk reports the finish reason; the trailing usage-only
  // chunk pads finish_reason with the empty string, which must not overwrite it.
  'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
  '',
  'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{},"finish_reason":""}],"usage":{"prompt_tokens":90,"completion_tokens":19,"total_tokens":109,"completion_tokens_details":{"reasoning_tokens":3},"prompt_tokens_details":{"cached_tokens":0}}}',
  '',
  'data: [DONE]',
  '',
  '',
].join('\n')

describe('chat-completions SSE translation', () => {
  it('translates reasoning, text, empty finish_reason padding, usage, and [DONE]', async () => {
    const chunks = await collect(THINKING_STREAM)
    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 0, text: '思考' },
      { type: 'reasoning-delta', index: 0, text: '一下' },
      { type: 'block-start', index: 1, blockType: 'text' },
      { type: 'text-delta', index: 1, text: '你好' },
      { type: 'text-delta', index: 1, text: '！' },
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: '思考一下' } },
      { type: 'block-end', index: 1, block: { type: 'text', text: '你好！' } },
      {
        type: 'usage',
        usage: { inputTokens: 90, outputTokens: 19, totalTokens: 109, cacheReadTokens: 0, reasoningTokens: 3 },
      },
      { type: 'finish', reason: { kind: 'stop' } },
    ])
  })

  it('survives SSE frames split mid-event', async () => {
    const chunks = await collect(THINKING_STREAM, 7)
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'stop' } })
    expect(chunks.find(chunk => chunk.type === 'usage')).toMatchObject({
      usage: { inputTokens: 90, reasoningTokens: 3 },
    })
  })

  it('maps a length finish to max-tokens', async () => {
    const chunks = await collect([
      'data: {"choices":[{"index":0,"delta":{"content":"x"},"finish_reason":"length"}]}',
      '',
      'data: [DONE]',
      '',
      '',
    ].join('\n'))
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'max-tokens' } })
  })

  it('subtracts cache reads out of input tokens', () => {
    expect(mapUsage({
      prompt_tokens: 100,
      completion_tokens: 20,
      total_tokens: 120,
      prompt_tokens_details: { cached_tokens: 64 },
    })).toEqual({ inputTokens: 36, outputTokens: 20, totalTokens: 120, cacheReadTokens: 64 })
  })

  it('omits an inconsistent total', () => {
    const usage = mapUsage({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 999 })
    expect(usage.totalTokens).toBeUndefined()
    expect(usage.inputTokens).toBe(10)
  })

  it('fails a stream that ends without [DONE]', async () => {
    await expect(collect('data: {"choices":[{"index":0,"delta":{"content":"x"},"finish_reason":null}]}\n\n'))
      .rejects.toMatchObject({ code: 'STREAM_CLOSED' })
  })

  it('maps finish reasons', () => {
    expect(mapFinishReason('stop')).toEqual({ kind: 'stop' })
    expect(mapFinishReason('tool_calls')).toEqual({ kind: 'tool-calls' })
    expect(mapFinishReason('length')).toEqual({ kind: 'max-tokens' })
    expect(mapFinishReason('content_filter')).toMatchObject({ kind: 'error' })
  })
})

describe('chat-completions serialization', () => {
  const base: GenerateOptions = {
    provider: 'protocom-aggregate',
    model: 'deepseek/deepseek-v4.1-flash',
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'hi' }] } as unknown as Message,
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: '想了一下' },
          { type: 'text', text: 'hello' },
        ],
      } as unknown as Message,
      { role: 'user', content: [{ type: 'text', text: 'again' }] } as unknown as Message,
    ],
  }

  it('does not replay assistant reasoning unless the route asks for it', () => {
    // Verified against this endpoint: a replayed assistant turn carrying
    // reasoning_content is refused with HTTP 400 (loc ('body','input',...,'str')),
    // and DeepSeek's own API documents the same, so silence is the default.
    const body = serializeChatRequest(base, 'deepseek/deepseek-v4.1-flash')
    const messages = body.messages as { role: string; content: string; reasoning_content?: string }[]
    expect(messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
      { role: 'user', content: 'again' },
    ])
    expect(body.stream).toBe(true)
    expect(body.thinking).toBeUndefined()
  })

  it('replays assistant reasoning for a route that asks for it', () => {
    const body = serializeChatRequest(base, 'deepseek/deepseek-v4.1-flash', undefined, true)
    const messages = body.messages as { role: string; content: string; reasoning_content?: string }[]
    expect(messages[1]).toEqual({ role: 'assistant', content: 'hello', reasoning_content: '想了一下' })
  })

  it('resolves thinking fields from the effort', () => {
    expect(resolveThinking(undefined)).toEqual({})
    expect(resolveThinking('off')).toEqual({ thinking: { type: 'disabled' } })
    expect(resolveThinking('high')).toEqual({ thinking: { type: 'enabled' }, reasoning_effort: 'high' })
    expect(resolveThinking('max')).toEqual({ thinking: { type: 'enabled' }, reasoning_effort: 'max' })
  })

  it('sends a user image as an inline base64 image_url part', () => {
    const imageMessage = {
      role: 'user',
      content: [
        { type: 'text', text: 'what is this?' },
        { type: 'image', attachment: { attachmentId: 'sha256:abc', mediaType: 'image/png' } },
      ],
    } as unknown as Message
    const images = new Map([['sha256:abc', 'data:image/png;base64,AAAA']])
    const body = serializeChatRequest(
      { ...base, messages: [imageMessage] },
      'm',
      images,
    )
    expect(body.messages).toEqual([{
      role: 'user',
      content: [
        { type: 'text', text: 'what is this?' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
      ],
    }])
  })

  it('degrades an unresolvable image to its text and keeps a plain string otherwise', () => {
    const imageMessage = {
      role: 'user',
      content: [
        { type: 'text', text: 'hi' },
        { type: 'image', attachment: { attachmentId: 'sha256:missing', mediaType: 'image/png' } },
      ],
    } as unknown as Message
    // An id the map does not carry contributes no part, so the text stands alone.
    const unresolved = serializeChatRequest({ ...base, messages: [imageMessage] }, 'm', new Map())
    expect((unresolved.messages as { content: unknown }[])[0]?.content).toBe('hi')
    // No image map at all keeps the historical string form.
    const plain = serializeChatRequest({ ...base, messages: [imageMessage] }, 'm')
    expect((plain.messages as { content: unknown }[])[0]?.content).toBe('hi')
  })

  it('refuses an image on an assistant message', () => {
    const assistantImage = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'x' },
        { type: 'image', attachment: { attachmentId: 'sha256:abc', mediaType: 'image/png' } },
      ],
    } as unknown as Message
    expect(() => serializeChatRequest({ ...base, messages: [assistantImage] }, 'm', new Map()))
      .toThrowError(/does not support image content/)
  })

  it('materializes the wire thinking fields into the request', () => {
    const off = serializeChatRequest({ ...base, reasoningEffort: 'off' as GenerateOptions['reasoningEffort'] }, 'm')
    expect(off.thinking).toEqual({ type: 'disabled' })
    const high = serializeChatRequest({ ...base, reasoningEffort: 'high' as GenerateOptions['reasoningEffort'] }, 'm')
    expect(high.thinking).toEqual({ type: 'enabled' })
    expect(high.reasoning_effort).toBe('high')
  })
})
