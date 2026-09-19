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
})
