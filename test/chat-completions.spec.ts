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

  it('drops the assistant text when the route cannot carry it', () => {
    // Verified against this endpoint: a chat surface that translates to an
    // upstream Responses API refuses an assistant text item in every shape,
    // while an assistant turn with empty content is accepted.
    const body = serializeChatRequest(base, 'm', undefined, false, 'drop')
    expect(body.messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: '' },
      { role: 'user', content: 'again' },
    ])
  })

  it('re-attributes the assistant text to a named user item when asked', () => {
    const body = serializeChatRequest(base, 'm', undefined, false, 'user')
    expect(body.messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'user', name: 'assistant', content: 'hello' },
      { role: 'assistant', content: '' },
      { role: 'user', content: 'again' },
    ])
  })

  it('keeps a tool call on the assistant message its text was lifted from', () => {
    // Lifting the text must not move or drop the call: the tool result that
    // follows still has to find its tool_call_id on an assistant message.
    const withCall = {
      ...base,
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'go' }] },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'running' },
            { type: 'tool-call', id: 'call_1', name: 'run_code', arguments: '{"code":"1"}' },
          ],
        },
        // Since 1.7 a tool result is its own message of role 'tool', carrying
        // its blocks directly rather than nesting a 'tool-result' block.
        {
          role: 'tool',
          toolCallId: 'call_1',
          content: [{ type: 'text', text: '1' }],
        },
      ],
    } as unknown as GenerateOptions
    const body = serializeChatRequest(withCall, 'm', undefined, false, 'user')
    expect(body.messages).toEqual([
      { role: 'user', content: 'go' },
      { role: 'user', name: 'assistant', content: 'running' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'run_code', arguments: '{"code":"1"}' } }],
      },
      { role: 'tool', tool_call_id: 'call_1', content: '1' },
    ])
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


describe('degenerate completion detection', () => {
  // GLM-5.3 Flash on OpenCode Go intermittently ends a turn with a full
  // reasoning_content stream, an empty content delta, and finish_reason
  // "stop" (measured on one prompt: 5 of 16 requests). Counting the reasoning
  // block as output reported that as a successful turn, so the agent turn
  // closed with no reply and no tool call to run — indistinguishable from a
  // hang, and nothing retried it. The reasoning-only shape must therefore
  // reach the retryable EMPTY_RESPONSE code.
  const REASONING_ONLY_STOP = [
    'data: {"id":"c","choices":[{"index":0,"delta":{"role":"assistant","content":"","refusal":null},"finish_reason":null}]}',
    '',
    'data: {"id":"c","choices":[{"index":0,"delta":{"reasoning_content":"思考"},"finish_reason":null}]}',
    '',
    'data: {"id":"c","choices":[{"index":0,"delta":{"reasoning_content":"完毕"},"finish_reason":null}]}',
    '',
    'data: {"id":"c","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
    '',
    'data: [DONE]',
    '',
    '',
  ].join('\n')

  it('reports a reasoning-only stop as the retryable EMPTY_RESPONSE error', async () => {
    const chunks = await collect(REASONING_ONLY_STOP)
    // The thinking stays visible; only the terminal reason is corrected.
    expect(chunks.filter(chunk => chunk.type === 'reasoning-delta').map(chunk => chunk.text)).toEqual(['思考', '完毕'])
    expect(chunks.at(-1)).toEqual({
      type: 'finish',
      reason: {
        kind: 'error',
        failure: {
          message: 'model ended the turn after reasoning without a reply or a tool call',
          code: 'EMPTY_RESPONSE',
        },
      },
    })
  })

  it('keeps a genuinely empty completion on its historical message and code', async () => {
    const chunks = await collect([
      'data: {"id":"c","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
      '',
      'data: [DONE]',
      '',
      '',
    ].join('\n'))
    expect(chunks.at(-1)).toEqual({
      type: 'finish',
      reason: {
        kind: 'error',
        failure: { message: 'model returned a completed response with no content', code: 'EMPTY_RESPONSE' },
      },
    })
  })

  it('still reports a reasoning turn that also produced text as a normal stop', async () => {
    const chunks = await collect([
      'data: {"id":"c","choices":[{"index":0,"delta":{"reasoning_content":"想"},"finish_reason":null}]}',
      '',
      'data: {"id":"c","choices":[{"index":0,"delta":{"content":"答案"},"finish_reason":null}]}',
      '',
      'data: {"id":"c","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
      '',
      'data: [DONE]',
      '',
      '',
    ].join('\n'))
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'stop' } })
  })

  it('still reports a reasoning turn that produced a tool call as tool-calls', async () => {
    const chunks = await collect([
      'data: {"id":"c","choices":[{"index":0,"delta":{"reasoning_content":"想"},"finish_reason":null}]}',
      '',
      'data: {"id":"c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"run_code","arguments":"{}"}}]},"finish_reason":null}]}',
      '',
      'data: {"id":"c","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}',
      '',
      'data: [DONE]',
      '',
      '',
    ].join('\n'))
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'tool-calls' } })
  })
})
