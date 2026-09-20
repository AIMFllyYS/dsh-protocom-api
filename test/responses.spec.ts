import { describe, expect, it } from 'vitest'
import type { GenerateOptions, Message, StreamChunk } from '@deepseek-ai/dsh-llm'
import { parseSseUntilEof } from '../src/sse.ts'
import { mapResponseUsage, serializeResponsesRequest, translateResponses } from '../src/protocol/responses.ts'

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

/** Frame payloads as an SSE body; the responses protocol ends by closing, with no sentinel. */
function sseBody(events: readonly unknown[]): string {
  return events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')
}

async function collect(events: readonly unknown[], chunkSize?: number): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of translateResponses(parseSseUntilEof(sseStream(sseBody(events), chunkSize)))) {
    chunks.push(chunk)
  }
  return chunks
}

/** The full lifecycle a streaming provider sends for one tool call. */
function functionCallEvents(argumentsText: string): unknown[] {
  const item = {
    id: 'fc_1',
    type: 'function_call',
    status: 'completed',
    name: 'read_file',
    arguments: argumentsText,
    call_id: 'call_1',
  }
  return [
    { type: 'response.created', response: { status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', output_index: 0, item: { ...item, status: 'in_progress', arguments: '' } },
    { type: 'response.function_call_arguments.delta', item_id: 'fc_1', output_index: 0, delta: argumentsText.slice(0, 6) },
    { type: 'response.function_call_arguments.delta', item_id: 'fc_1', output_index: 0, delta: argumentsText.slice(6) },
    { type: 'response.function_call_arguments.done', item_id: 'fc_1', output_index: 0, arguments: argumentsText },
    { type: 'response.output_item.done', output_index: 0, item },
    {
      type: 'response.completed',
      response: {
        status: 'completed',
        usage: {
          input_tokens: 10,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens: 5,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 15,
        },
      },
    },
  ]
}

describe('responses SSE translation', () => {
  const ARGUMENTS = '{"path":"a.ts","limit":20}'

  it('streams one tool call across added, delta, done and the terminal item without duplicating arguments', async () => {
    const chunks = await collect(functionCallEvents(ARGUMENTS))
    expect(chunks).toEqual([
      // A tool call that has not yet disclosed call_id/name still opens.
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      {
        type: 'tool-call-delta',
        index: 0,
        id: 'call_1',
        name: 'read_file',
        argumentsDelta: ARGUMENTS.slice(0, 6),
      },
      {
        type: 'tool-call-delta',
        index: 0,
        id: 'call_1',
        name: 'read_file',
        argumentsDelta: ARGUMENTS.slice(6),
      },
      {
        type: 'block-end',
        index: 0,
        block: { type: 'tool-call', id: 'call_1', name: 'read_file', arguments: ARGUMENTS },
      },
      {
        type: 'usage',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, cacheReadTokens: 0, reasoningTokens: 0 },
      },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ])
  })

  it('keeps a split tool call on one block and one block-start', async () => {
    const chunks = await collect(functionCallEvents(ARGUMENTS), 11)
    expect(chunks.filter(chunk => chunk.type === 'block-start')).toEqual([
      { type: 'block-start', index: 0, blockType: 'tool-call' },
    ])
    const end = chunks.find(chunk => chunk.type === 'block-end')
    expect(end).toEqual({
      type: 'block-end',
      index: 0,
      block: { type: 'tool-call', id: 'call_1', name: 'read_file', arguments: ARGUMENTS },
    })
  })

  it('does not replay a complete argument text that the deltas never streamed', async () => {
    // The wire's done events resend everything; text that does not extend what
    // was streamed is dropped rather than appended twice.
    const chunks = await collect([
      { type: 'response.function_call_arguments.done', item_id: 'fc_1', output_index: 0, arguments: '{"a":1}' },
      { type: 'response.output_item.done', output_index: 0, item: { id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'f', arguments: '{"a":1}' } },
      { type: 'response.completed', response: { status: 'completed' } },
    ])
    expect(chunks.filter(chunk => chunk.type === 'block-end')).toEqual([
      { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'call_1', name: 'f', arguments: '{"a":1}' } },
    ])
    expect(chunks.filter(chunk => chunk.type === 'tool-call-delta')).toEqual([
      { type: 'tool-call-delta', index: 0, id: '', argumentsDelta: '{"a":1}' },
    ])
  })

  it('carries text, reasoning and a tool call as separate ordered blocks', async () => {
    const chunks = await collect([
      { type: 'response.reasoning_summary_text.delta', delta: '想' },
      { type: 'response.output_text.delta', delta: 'hi' },
      ...functionCallEvents('{}'),
    ])
    expect(chunks.filter(chunk => chunk.type === 'block-start')).toEqual([
      { type: 'block-start', index: 0, blockType: 'reasoning' },
      { type: 'block-start', index: 1, blockType: 'text' },
      { type: 'block-start', index: 2, blockType: 'tool-call' },
    ])
    expect(chunks.filter(chunk => chunk.type === 'block-end')).toEqual([
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: '想' } },
      { type: 'block-end', index: 1, block: { type: 'text', text: 'hi' } },
      { type: 'block-end', index: 2, block: { type: 'tool-call', id: 'call_1', name: 'read_file', arguments: '{}' } },
    ])
  })

  it('streams the plain reasoning vocabulary and folds its restatement without doubling', async () => {
    // Captured from the live endpoint: the reasoning item opens first, the
    // deltas carry the text, and `response.reasoning.done` restates it whole.
    const chunks = await collect([
      { type: 'response.output_item.added', output_index: 0, item: { type: 'reasoning', id: 'rs_1', summary: [] } },
      { type: 'response.reasoning.delta', item_id: 'rs_1', output_index: 0, content_index: 0, delta: 'We need' },
      { type: 'response.reasoning.delta', item_id: 'rs_1', output_index: 0, content_index: 0, delta: ' answer.' },
      { type: 'response.reasoning.done', item_id: 'rs_1', output_index: 0, content_index: 0, text: 'We need answer.' },
      { type: 'response.output_text.delta', delta: 'ok' },
      { type: 'response.completed', response: { status: 'completed' } },
    ])
    expect(chunks.filter(chunk => chunk.type === 'reasoning-delta')).toEqual([
      { type: 'reasoning-delta', index: 0, text: 'We need' },
      { type: 'reasoning-delta', index: 0, text: ' answer.' },
    ])
    expect(chunks.filter(chunk => chunk.type === 'block-end')).toEqual([
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'We need answer.' } },
      { type: 'block-end', index: 1, block: { type: 'text', text: 'ok' } },
    ])
  })

  it('delivers reasoning a model only ever restates complete', async () => {
    const chunks = await collect([
      { type: 'response.reasoning_summary_text.done', item_id: 'item_1', output_index: 0, summary_index: 0, text: 'whole chain' },
      { type: 'response.output_text.delta', delta: 'ok' },
      { type: 'response.completed', response: { status: 'completed' } },
    ])
    expect(chunks.filter(chunk => chunk.type === 'reasoning-delta')).toEqual([
      { type: 'reasoning-delta', index: 0, text: 'whole chain' },
    ])
    expect(chunks.filter(chunk => chunk.type === 'block-end')).toEqual([
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'whole chain' } },
      { type: 'block-end', index: 1, block: { type: 'text', text: 'ok' } },
    ])
  })

  it('folds a summary part restatement into the block its deltas opened', async () => {
    const chunks = await collect([
      { type: 'response.reasoning_summary_part.added', item_id: 'item_1', output_index: 0, summary_index: 0, part: { type: 'summary_text', text: '' } },
      { type: 'response.reasoning_summary_text.delta', item_id: 'item_1', output_index: 0, summary_index: 0, delta: 'The' },
      { type: 'response.reasoning_summary_text.delta', item_id: 'item_1', output_index: 0, summary_index: 0, delta: ' user' },
      { type: 'response.reasoning_summary_text.done', item_id: 'item_1', output_index: 0, summary_index: 0, text: 'The user' },
      { type: 'response.reasoning_summary_part.done', item_id: 'item_1', output_index: 0, summary_index: 0, part: { type: 'summary_text', text: 'The user' } },
      { type: 'response.output_text.delta', delta: 'ok' },
      { type: 'response.completed', response: { status: 'completed' } },
    ])
    expect(chunks.filter(chunk => chunk.type === 'reasoning-delta')).toEqual([
      { type: 'reasoning-delta', index: 0, text: 'The' },
      { type: 'reasoning-delta', index: 0, text: ' user' },
    ])
  })

  it('drops a terminal restatement that does not extend the streamed reasoning', async () => {
    const chunks = await collect([
      { type: 'response.reasoning.delta', delta: 'streamed' },
      { type: 'response.reasoning.done', text: 'something else entirely' },
      { type: 'response.output_text.delta', delta: 'ok' },
      { type: 'response.completed', response: { status: 'completed' } },
    ])
    expect(chunks.filter(chunk => chunk.type === 'block-end')).toEqual([
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'streamed' } },
      { type: 'block-end', index: 1, block: { type: 'text', text: 'ok' } },
    ])
  })

  it('reports a failed response as an error finish', async () => {
    const chunks = await collect([
      { type: 'response.output_text.delta', delta: 'partial' },
      { type: 'response.failed', response: { status: 'failed', error: { message: 'boom', code: 'bad' } } },
    ])
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'error', failure: { message: 'boom', code: 'bad' } } })
  })

  it('fails an empty completed response instead of ending silently', async () => {
    const chunks = await collect([{ type: 'response.completed', response: { status: 'completed' } }])
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error' } })
  })

  it('maps usage fields and subtracts cache reads out of input tokens', () => {
    expect(mapResponseUsage({
      input_tokens: 100,
      output_tokens: 20,
      total_tokens: 120,
      input_tokens_details: { cached_tokens: 64 },
      output_tokens_details: { reasoning_tokens: 7 },
    })).toEqual({ inputTokens: 36, outputTokens: 20, totalTokens: 120, cacheReadTokens: 64, reasoningTokens: 7 })
  })
})

describe('StepFun reasoning vocabulary (issue 2a)', () => {
  const row = (id: string, type: string): Record<string, unknown> => ({ id, type, status: null, summary: [] })

  it('streams the reasoning_text spelling and never doubles its restatements', async () => {
    // Verified against the relay: StepFun streams reasoning as
    // response.reasoning_text.delta, restates it on ...text.done, repeats it on
    // ...part.done, and sends the finished item once more.
    const chunks = await collect([
      { type: 'response.created', response: { status: 'in_progress', output: [] } },
      { type: 'response.output_item.added', output_index: 0, item: row('rs_1', 'reasoning') },
      { type: 'response.reasoning_part.added', item_id: 'rs_1', output_index: 0, part: { type: 'reasoning_text', text: '' } },
      { type: 'response.reasoning_text.delta', item_id: 'rs_1', output_index: 0, delta: 'think' },
      { type: 'response.reasoning_text.delta', item_id: 'rs_1', output_index: 0, delta: 'ing' },
      { type: 'response.reasoning_text.done', item_id: 'rs_1', output_index: 0, text: 'thinking' },
      { type: 'response.reasoning_part.done', item_id: 'rs_1', output_index: 0, part: { type: 'reasoning_text', text: 'thinking' } },
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: { ...row('rs_1', 'reasoning'), content: [{ type: 'reasoning_text', text: 'thinking' }] },
      },
      { type: 'response.completed', response: { status: 'completed', output: [] } },
    ])
    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 0, text: 'think' },
      { type: 'reasoning-delta', index: 0, text: 'ing' },
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'thinking' } },
      { type: 'finish', reason: { kind: 'stop' } },
    ])
  })

  it('delivers reasoning a provider only restates as the finished item', async () => {
    const chunks = await collect([
      { type: 'response.output_item.added', output_index: 0, item: row('rs_2', 'reasoning') },
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: { ...row('rs_2', 'reasoning'), content: [{ type: 'reasoning_text', text: 'whole thought' }] },
      },
      { type: 'response.completed', response: { status: 'completed', output: [] } },
    ])
    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 0, text: 'whole thought' },
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'whole thought' } },
      { type: 'finish', reason: { kind: 'stop' } },
    ])
  })

  it('reads a summary-only reasoning item too', async () => {
    const chunks = await collect([
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: { ...row('rs_3', 'reasoning'), summary: [{ text: 'summary thought' }] },
      },
      { type: 'response.completed', response: { status: 'completed', output: [] } },
    ])
    expect(chunks.at(-2)).toEqual({ type: 'block-end', index: 0, block: { type: 'reasoning', text: 'summary thought' } })
  })

  it('reports an incomplete response that names no reason as a token limit', async () => {
    // StepFun stops mid-reasoning with status "incomplete" and a null
    // incomplete_details; that is a truncated turn, not a finished one.
    const chunks = await collect([
      { type: 'response.reasoning_text.delta', item_id: 'rs_4', output_index: 0, delta: 'thinking hard' },
      { type: 'response.completed', response: { status: 'incomplete', incomplete_details: null, output: [] } },
    ])
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'max-tokens' } })
  })
})

describe('responses serialization', () => {
  const base: GenerateOptions = {
    provider: 'protocom-codex',
    model: 'gpt-5.6-sol',
    system: 'be brief',
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'hi' }] } as unknown as Message,
    ],
    tools: [{ name: 'read_file', description: 'read', parameters: { type: 'object' } }],
  }

  it('maps messages, instructions and tools onto the wire shape', () => {
    const body = serializeResponsesRequest(base, 'gpt-5.6-sol')
    expect(body).toMatchObject({
      model: 'gpt-5.6-sol',
      stream: true,
      store: false,
      instructions: 'be brief',
      input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
      tools: [{ type: 'function', name: 'read_file', description: 'read', parameters: { type: 'object' } }],
    })
  })

  it('sends no reasoning field for off or an absent effort', () => {
    expect(serializeResponsesRequest(base, 'm').reasoning).toBeUndefined()
    expect(serializeResponsesRequest({ ...base, reasoningEffort: 'off' as GenerateOptions['reasoningEffort'] }, 'm').reasoning)
      .toBeUndefined()
    expect(serializeResponsesRequest({ ...base, reasoningEffort: 'high' as GenerateOptions['reasoningEffort'] }, 'm').reasoning)
      .toEqual({ effort: 'high' })
  })

  it('carries a user image as an inline input_image part', () => {
    const imageMessage = {
      role: 'user',
      content: [
        { type: 'text', text: 'what is this?' },
        { type: 'image', attachment: { attachmentId: 'sha256:abc', mediaType: 'image/png' } },
      ],
    } as unknown as Message
    const images = new Map([['sha256:abc', 'data:image/png;base64,AAAA']])
    const body = serializeResponsesRequest({ ...base, messages: [imageMessage] }, 'm', images)
    expect(body.input).toEqual([{
      type: 'message',
      role: 'user',
      content: [
        { type: 'input_text', text: 'what is this?' },
        { type: 'input_image', image_url: 'data:image/png;base64,AAAA' },
      ],
    }])
  })

  it('degrades an unresolvable image to the text it travelled with', () => {
    const imageMessage = {
      role: 'user',
      content: [
        { type: 'text', text: 'hi' },
        { type: 'image', attachment: { attachmentId: 'sha256:missing', mediaType: 'image/png' } },
      ],
    } as unknown as Message
    // An empty content array is a wire error, so the text stands alone.
    const unresolved = serializeResponsesRequest({ ...base, messages: [imageMessage] }, 'm', new Map())
    expect(unresolved.input).toEqual([{
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: 'hi' }],
    }])
  })

  it('keeps a text-only tool result a string and carries one with an image as parts', () => {
    const plain = {
      role: 'user',
      content: [{ type: 'tool-result', toolCallId: 'call_1', content: [{ type: 'text', text: 'ok' }] }],
    } as unknown as Message
    expect(serializeResponsesRequest({ ...base, messages: [plain] }, 'm').input).toEqual([
      { type: 'function_call_output', call_id: 'call_1', output: 'ok' },
    ])

    const withImage = {
      role: 'user',
      content: [{
        type: 'tool-result',
        toolCallId: 'call_2',
        content: [
          { type: 'text', text: 'screenshot' },
          { type: 'image', attachment: { attachmentId: 'sha256:abc', mediaType: 'image/png' } },
        ],
      }],
    } as unknown as Message
    const images = new Map([['sha256:abc', 'data:image/png;base64,AAAA']])
    expect(serializeResponsesRequest({ ...base, messages: [withImage] }, 'm', images).input).toEqual([
      {
        type: 'function_call_output',
        call_id: 'call_2',
        output: [
          { type: 'input_text', text: 'screenshot' },
          { type: 'input_image', image_url: 'data:image/png;base64,AAAA' },
        ],
      },
    ])
  })

  it('still refuses an image on an assistant message', () => {
    const assistantImage = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'x' },
        { type: 'image', attachment: { attachmentId: 'sha256:abc', mediaType: 'image/png' } },
      ],
    } as unknown as Message
    expect(() => serializeResponsesRequest({ ...base, messages: [assistantImage] }, 'm', new Map()))
      .toThrowError(/does not support image content/)
  })
})

describe('responses stream completion (P0-2)', () => {
  async function collectUntilFailure(events: readonly unknown[]): Promise<{ chunks: StreamChunk[]; error: unknown }> {
    const chunks: StreamChunk[] = []
    const iterator = translateResponses(parseSseUntilEof(sseStream(sseBody(events))))[Symbol.asyncIterator]()
    try {
      for (;;) {
        const result = await iterator.next()
        if (result.done) return { chunks, error: undefined }
        chunks.push(result.value)
      }
    } catch (error: unknown) {
      return { chunks, error }
    }
  }

  it('refuses a stream that ends without a terminal event', async () => {
    const { error } = await collectUntilFailure([{ type: 'response.output_text.delta', delta: 'partial' }])
    expect(error).toMatchObject({ code: 'STREAM_CLOSED' })
  })

  it('never emits a truncated tool call as a complete block', async () => {
    // The endpoint controls both the arguments and the disconnect point: it can
    // stream a complete-looking prefix and then cut the stream. Executing that
    // prefix as the tool's arguments is the vulnerability, so no tool-call
    // block-end may follow a truncated stream.
    const { chunks, error } = await collectUntilFailure([
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { id: 'fc_1', type: 'function_call', name: 'shell', call_id: 'call_1', arguments: '' },
      },
      {
        type: 'response.function_call_arguments.delta',
        item_id: 'fc_1',
        output_index: 0,
        delta: '{"command":"rm -rf /tmp/victim"',
      },
    ])
    expect(error).toMatchObject({ code: 'STREAM_CLOSED' })
    expect(chunks.filter(chunk => chunk.type === 'block-end')).toEqual([])
  })

  it('accepts the [DONE] sentinel as an explicit terminal', async () => {
    const chunks: StreamChunk[] = []
    for await (const chunk of translateResponses(parseSseUntilEof(
      sseStream(`${sseBody([{ type: 'response.output_text.delta', delta: 'ok' }])}data: [DONE]\n\n`),
    ))) chunks.push(chunk)
    expect(chunks.filter(chunk => chunk.type === 'block-end')).toEqual([
      { type: 'block-end', index: 0, block: { type: 'text', text: 'ok' } },
    ])
  })

  // A terminal stream event proves the *stream* ended, not that an individual
  // tool call carried complete arguments. The endpoint controls both, so the
  // per-call confirmation events are the only proof.
  it('drops a tool call the wire never confirmed, even when the stream claims completion', async () => {
    const { chunks, error } = await collectUntilFailure([
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { id: 'fc_1', type: 'function_call', name: 'shell', call_id: 'call_1', arguments: '' },
      },
      {
        type: 'response.function_call_arguments.delta',
        item_id: 'fc_1',
        output_index: 0,
        delta: '{"path":"/etc/shadow"}',
      },
      { type: 'response.completed', response: { status: 'completed' } },
    ])
    expect(error).toBeUndefined()
    expect(chunks.filter(chunk => chunk.type === 'block-end')).toEqual([])
    expect(chunks.at(-1)).toMatchObject({
      type: 'finish',
      reason: { kind: 'error', failure: { code: 'STREAM_CLOSED' } },
    })
  })

  it('does not execute a tool call truncated by a genuine output-token limit', async () => {
    const { chunks } = await collectUntilFailure([
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { id: 'fc_1', type: 'function_call', name: 'shell', call_id: 'call_1', arguments: '' },
      },
      {
        type: 'response.function_call_arguments.delta',
        item_id: 'fc_1',
        output_index: 0,
        delta: '{"path":"/etc/shadow"}',
      },
      {
        type: 'response.incomplete',
        response: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } },
      },
    ])
    expect(chunks.filter(chunk => chunk.type === 'block-end')).toEqual([])
    expect(chunks.at(-1)).toMatchObject({
      type: 'finish',
      reason: { kind: 'error', failure: { code: 'STREAM_CLOSED' } },
    })
  })

  it('does not let a completion event without argument text confirm a tool call', async () => {
    const { chunks } = await collectUntilFailure([
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { id: 'fc_1', type: 'function_call', name: 'shell', call_id: 'call_1', arguments: '' },
      },
      { type: 'response.function_call_arguments.delta', item_id: 'fc_1', output_index: 0, delta: '{"cmd":"rm ' },
      { type: 'response.function_call_arguments.done', item_id: 'fc_1', output_index: 0 },
      { type: 'response.completed', response: { status: 'completed' } },
    ])
    expect(chunks.filter(chunk => chunk.type === 'block-end')).toEqual([])
    expect(chunks.at(-1)).toMatchObject({
      type: 'finish',
      reason: { kind: 'error', failure: { code: 'STREAM_CLOSED' } },
    })
  })

  it('refuses a completion whose text does not extend what was streamed', async () => {
    const { chunks } = await collectUntilFailure([
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { id: 'fc_1', type: 'function_call', name: 'shell', call_id: 'call_1', arguments: '' },
      },
      { type: 'response.function_call_arguments.delta', item_id: 'fc_1', output_index: 0, delta: '{"cmd":"rm ' },
      {
        type: 'response.function_call_arguments.done',
        item_id: 'fc_1',
        output_index: 0,
        arguments: '{"cmd":"safe"}',
      },
      { type: 'response.completed', response: { status: 'completed' } },
    ])
    expect(chunks.filter(chunk => chunk.type === 'block-end')).toEqual([])
    expect(chunks.at(-1)).toMatchObject({
      type: 'finish',
      reason: { kind: 'error', failure: { code: 'STREAM_CLOSED' } },
    })
  })

  it('freezes a confirmed tool call against later deltas', async () => {
    const chunks = await collect([
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { id: 'fc_1', type: 'function_call', name: 'shell', call_id: 'call_1', arguments: '' },
      },
      { type: 'response.function_call_arguments.done', item_id: 'fc_1', output_index: 0, arguments: '{"a":1}' },
      { type: 'response.function_call_arguments.delta', item_id: 'fc_1', output_index: 0, delta: '{"b":2}' },
      { type: 'response.completed', response: { status: 'completed' } },
    ])
    expect(chunks.filter(chunk => chunk.type === 'block-end')).toEqual([
      { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'call_1', name: 'shell', arguments: '{"a":1}' } },
    ])
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'tool-calls' } })
  })

  it('fails the turn when any one tool call is unconfirmed, even beside confirmed ones', async () => {
    const { chunks } = await collectUntilFailure([
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { id: 'fc_1', type: 'function_call', name: 'shell', call_id: 'call_1', arguments: '' },
      },
      { type: 'response.function_call_arguments.done', item_id: 'fc_1', output_index: 0, arguments: '{"a":1}' },
      {
        type: 'response.output_item.added',
        output_index: 1,
        item: { id: 'fc_2', type: 'function_call', name: 'shell', call_id: 'call_2', arguments: '' },
      },
      { type: 'response.function_call_arguments.delta', item_id: 'fc_2', output_index: 1, delta: '{"b":' },
      { type: 'response.completed', response: { status: 'completed' } },
    ])
    // The confirmed call survives; the unconfirmed one is dropped and the whole
    // turn fails so nothing is executed.
    expect(chunks.filter(chunk => chunk.type === 'block-end')).toEqual([
      { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'call_1', name: 'shell', arguments: '{"a":1}' } },
    ])
    expect(chunks.at(-1)).toMatchObject({
      type: 'finish',
      reason: { kind: 'error', failure: { code: 'STREAM_CLOSED' } },
    })
  })

  it('still executes a tool call the wire did confirm', async () => {
    const chunks = await collect(functionCallEvents('{"a":1}'))
    expect(chunks.filter(chunk => chunk.type === 'block-end')).toHaveLength(1)
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'tool-calls' } })
  })
})
