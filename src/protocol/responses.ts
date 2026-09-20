/**
 * OpenAI responses wire protocol (the Codex group). Minimal hand-rolled SSE
 * handling: requests map messages to `input` items and the reasoning effort
 * to `reasoning.effort`; stream events resolve through their payload `type`
 * field, terminating at `response.completed` / `response.failed` rather than
 * relying on a `[DONE]` sentinel. Tool calls stream twice on this protocol —
 * identity on `response.output_item.added`, arguments on
 * `response.function_call_arguments.delta`, and the complete item once more on
 * `response.output_item.done` — so the terminal item only ever contributes the
 * part the deltas have not already carried. Reasoning streams under three
 * vocabularies (`response.reasoning.delta`, `response.reasoning_summary_text.delta`,
 * and one complete restatement on the `...done` events) and all three fold
 * into a single reasoning block by the same remainder rule.
 *
 * @module dsh-protocom-api/protocol/responses
 */

import { contentHasImage, EMPTY_RESPONSE_CODE, LlmError, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, FinishReason, GenerateOptions, Message, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import { DONE, parseSseUntilEof } from '../sse.ts'
import { postSse } from './http.ts'
import type { ProtocolConnection } from './http.ts'

/** Token accounting as the responses endpoint reports it. */
export interface WireResponseUsage {
  input_tokens: number
  output_tokens: number
  total_tokens?: number
  input_tokens_details?: { cached_tokens?: number }
  output_tokens_details?: { reasoning_tokens?: number }
}

/** The subset of streamed event payloads this adapter reads. */
interface WireEvent {
  type?: string
  delta?: string
  /** Streamed-item identity; providers send one or both of these. */
  item_id?: string
  output_index?: number
  /** Complete argument text some providers put on `function_call_arguments.done`. */
  arguments?: string
  /** Complete reasoning text some providers put on a terminal reasoning event. */
  text?: string
  /** Summary part some providers restate complete on `reasoning_summary_part.done`. */
  part?: { text?: string }
  item?: {
    id?: string
    type?: string
    call_id?: string
    name?: string
    arguments?: string
  }
  response?: {
    status?: string
    usage?: WireResponseUsage
    incomplete_details?: { reason?: string }
    error?: { message?: string; code?: string }
  }
  message?: string
  code?: string
}

/**
 * Map wire usage fields to the harness's DISJOINT counts: cached input is
 * folded into `input_tokens`, so it is subtracted out and reported
 * separately.
 */
export function mapResponseUsage(usage: WireResponseUsage): TokenUsage {
  const cacheRead = usage.input_tokens_details?.cached_tokens
  const reasoning = usage.output_tokens_details?.reasoning_tokens
  const combined = usage.input_tokens + usage.output_tokens
  const hasExactTotal = Number.isSafeInteger(usage.input_tokens)
    && usage.input_tokens >= 0
    && Number.isSafeInteger(usage.output_tokens)
    && usage.output_tokens >= 0
    && Number.isSafeInteger(combined)
    && (usage.total_tokens === undefined || usage.total_tokens === combined)
  return {
    inputTokens: usage.input_tokens - (cacheRead ?? 0),
    outputTokens: usage.output_tokens,
    ...hasExactTotal ? { totalTokens: combined } : {},
    ...cacheRead !== undefined ? { cacheReadTokens: cacheRead } : {},
    ...reasoning !== undefined ? { reasoningTokens: reasoning } : {},
  }
}

function flattenText(blocks: readonly ContentBlock[]): string {
  return blocks.filter(block => block.type === 'text').map(block => block.text).join('')
}

function inputTextItem(role: 'system' | 'user', text: string): Record<string, unknown> {
  return { type: 'message', role, content: [{ type: 'input_text', text }] }
}

function wireInput(message: Message): Record<string, unknown>[] {
  if (contentHasImage(message.content)) {
    throw new LlmError('The protocom-api responses adapter does not support image content.', 'UNSUPPORTED_CONTENT')
  }
  if (message.role === 'system') return [inputTextItem('system', flattenText(message.content))]
  if (message.role === 'user') {
    const result = message.content.find((block): block is Extract<ContentBlock, { type: 'tool-result' }> =>
      block.type === 'tool-result')
    if (result !== undefined) {
      if (contentHasImage(result.content)) {
        throw new LlmError('The protocom-api responses adapter does not support image content.', 'UNSUPPORTED_CONTENT')
      }
      return [{
        type: 'function_call_output',
        call_id: String(result.toolCallId),
        output: flattenText(result.content),
      }]
    }
    return [inputTextItem('user', flattenText(message.content))]
  }
  // Reasoning blocks cannot be replayed: the protocol's reasoning items carry
  // server-issued signatures a stateless client cannot reconstruct, so only
  // visible output and tool calls go back.
  const items: Record<string, unknown>[] = []
  const text = flattenText(message.content)
  if (text.length > 0) {
    items.push({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] })
  }
  for (const block of message.content) {
    if (block.type !== 'tool-call') continue
    items.push({
      type: 'function_call',
      call_id: String(block.id),
      name: block.name,
      arguments: block.arguments,
    })
  }
  return items
}

/**
 * Serialize one request into the responses wire body. Any effort but `off`
 * maps to `reasoning.effort`; `off` and an absent effort both omit the field
 * (the protocol has no explicit disabled spelling).
 */
export function serializeResponsesRequest(options: GenerateOptions, model: string): Record<string, unknown> {
  const input: Record<string, unknown>[] = []
  for (const message of options.messages) input.push(...wireInput(message))
  const effort = options.reasoningEffort
  return {
    model,
    input,
    stream: true,
    store: false,
    ...options.system === undefined ? {} : { instructions: options.system },
    ...effort === undefined || effort === 'off' ? {} : { reasoning: { effort } },
    ...options.temperature === undefined ? {} : { temperature: options.temperature },
    ...options.maxTokens === undefined ? {} : { max_output_tokens: options.maxTokens },
    ...options.tools === undefined || options.tools.length === 0
      ? {}
      : {
        tools: options.tools.map(tool => ({
          type: 'function',
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        })),
      },
  }
}

/** One open block under assembly. */
interface OpenBlock {
  index: number
  kind: 'text' | 'reasoning' | 'tool-call'
  text: string
  callId?: string | undefined
  name?: string | undefined
  /** Whether this block's `block-start` has been emitted (a tool call may open before its identity arrives). */
  announced?: boolean
}

function closeBlock(block: OpenBlock): ContentBlock {
  switch (block.kind) {
    case 'text': return { type: 'text', text: block.text }
    case 'reasoning': return { type: 'reasoning', text: block.text }
    case 'tool-call': return {
      type: 'tool-call',
      id: ToolCallId(block.callId ?? ''),
      name: block.name ?? '',
      arguments: block.text,
    }
  }
}

/** `id` and `name` are identity: the wire sends each once, on the call's first event. */
function acceptIdentity(current: string | undefined, incoming: unknown): string | undefined {
  return typeof incoming === 'string' && incoming.length > 0 ? incoming : current
}

/**
 * The part of a complete text the deltas have not carried yet. Providers
 * resend the complete value on the `...done` events — tool-call arguments and
 * reasoning alike — so only what extends the streamed prefix is new; text that
 * does not extend it is dropped rather than replayed as duplicate content.
 */
function streamedRemainder(streamed: string, complete: string | undefined): string | undefined {
  if (complete === undefined || complete.length === 0) return undefined
  if (!complete.startsWith(streamed)) return undefined
  return complete.slice(streamed.length)
}

/**
 * Consume responses-protocol SSE payloads and yield StreamChunks. The
 * terminal state arrives as a `response.completed` / `response.failed` event
 * (or stream EOF); `block-end`s, `usage`, and `finish` are emitted only then,
 * so no chunk follows `finish`.
 */
export async function* translateResponses(payloads: AsyncIterable<string>): AsyncGenerator<StreamChunk> {
  let nextIndex = 0
  let textBlock: OpenBlock | undefined
  let reasoningBlock: OpenBlock | undefined
  const order: OpenBlock[] = []
  let pendingFinish: FinishReason | undefined
  let pendingUsage: TokenUsage | undefined
  let sawToolCall = false
  /** One streamed call per wire identity, so its deltas and its terminal item share one block. */
  const toolBlocks = new Map<string, OpenBlock>()

  function open(kind: OpenBlock['kind']): OpenBlock {
    const block: OpenBlock = { index: nextIndex++, kind, text: '' }
    order.push(block)
    return block
  }

  /** The open call block for one wire identity, created on first sight. */
  function toolBlockFor(identity: string): OpenBlock {
    let block = toolBlocks.get(identity)
    if (!block) {
      block = open('tool-call')
      toolBlocks.set(identity, block)
    }
    return block
  }

  /** One wire identity per call: the item id when sent, else its output index. */
  function identityOf(itemId: unknown, outputIndex: unknown): string | undefined {
    if (typeof itemId === 'string' && itemId.length > 0) return itemId
    if (typeof outputIndex === 'number' && Number.isSafeInteger(outputIndex)) return `#${outputIndex}`
    return undefined
  }

  /**
   * Adopt whatever identity this event discloses and, on the first one, open
   * the block. Identity is re-read on every event because the wire may not
   * disclose `call_id`/`name` until the item completes, and the opening
   * `block-start` must precede every delta whether or not it ever does.
   */
  function* announce(block: OpenBlock, id: unknown, name: unknown): Generator<StreamChunk> {
    block.callId = acceptIdentity(block.callId, id)
    block.name = acceptIdentity(block.name, name)
    if (block.announced !== true) {
      block.announced = true
      sawToolCall = true
      yield { type: 'block-start', index: block.index, blockType: 'tool-call' }
    }
  }

  /** Append argument text and yield the delta carrying it. */
  function* emitArguments(block: OpenBlock, fragment: string): Generator<StreamChunk> {
    if (fragment.length === 0) return
    block.text += fragment
    yield {
      type: 'tool-call-delta',
      index: block.index,
      id: ToolCallId(block.callId ?? ''),
      ...block.name === undefined ? {} : { name: block.name },
      argumentsDelta: fragment,
    }
  }

  /**
   * Append reasoning text and yield the delta carrying it. The endpoint
   * streams reasoning under three vocabularies — a plain `delta` on
   * `response.reasoning.delta`, a summary `delta` on
   * `response.reasoning_summary_text.delta`, and a complete restatement on the
   * `...done` events — so every spelling funnels through here and the block
   * opens on whichever one carries the first text.
   */
  function* emitReasoning(fragment: string | undefined): Generator<StreamChunk> {
    if (fragment === undefined || fragment.length === 0) return
    if (reasoningBlock === undefined) {
      reasoningBlock = open('reasoning')
      yield { type: 'block-start', index: reasoningBlock.index, blockType: 'reasoning' }
    }
    reasoningBlock.text += fragment
    yield { type: 'reasoning-delta', index: reasoningBlock.index, text: fragment }
  }

  for await (const payload of payloads) {
    if (payload === DONE) break
    let event: WireEvent
    try {
      event = JSON.parse(payload) as WireEvent
    } catch {
      throw new LlmError(`malformed SSE payload: ${payload.slice(0, 120)}`, 'MALFORMED_RESPONSE')
    }

    switch (event.type) {
      case 'response.output_text.delta': {
        if (typeof event.delta !== 'string' || event.delta.length === 0) break
        if (!textBlock) {
          textBlock = open('text')
          yield { type: 'block-start', index: textBlock.index, blockType: 'text' }
        }
        textBlock.text += event.delta
        yield { type: 'text-delta', index: textBlock.index, text: event.delta }
        break
      }
      // Streaming reasoning. Models differ on the spelling: some stream the
      // plain `response.reasoning.delta`, others the summary variant.
      case 'response.reasoning.delta':
      case 'response.reasoning_summary_text.delta': {
        yield* emitReasoning(typeof event.delta === 'string' ? event.delta : undefined)
        break
      }
      // Terminal reasoning: the whole text once more. Only the part the deltas
      // have not carried is emitted, so a model that streams AND restates never
      // doubles its reasoning, while a model that only restates still delivers
      // the complete text as one delta.
      case 'response.reasoning.done':
      case 'response.reasoning_summary_text.done': {
        yield* emitReasoning(streamedRemainder(
          reasoningBlock?.text ?? '',
          typeof event.text === 'string' ? event.text : undefined,
        ))
        break
      }
      case 'response.reasoning_summary_part.done': {
        yield* emitReasoning(streamedRemainder(
          reasoningBlock?.text ?? '',
          typeof event.part?.text === 'string' ? event.part.text : undefined,
        ))
        break
      }
      case 'response.output_item.added': {
        const item = event.item
        if (item?.type !== 'function_call') break
        const identity = identityOf(item.id ?? event.item_id, event.output_index)
        if (identity === undefined) break
        const block = toolBlockFor(identity)
        yield* announce(block, item.call_id, item.name)
        yield* emitArguments(block, item.arguments ?? '')
        break
      }
      case 'response.function_call_arguments.delta': {
        const identity = identityOf(event.item_id, event.output_index)
        if (identity === undefined || typeof event.delta !== 'string') break
        const deltaBlock = toolBlockFor(identity)
        yield* announce(deltaBlock, undefined, undefined)
        yield* emitArguments(deltaBlock, event.delta)
        break
      }
      case 'response.function_call_arguments.done': {
        const identity = identityOf(event.item_id, event.output_index)
        if (identity === undefined) break
        const block = toolBlockFor(identity)
        yield* announce(block, undefined, undefined)
        yield* emitArguments(block, streamedRemainder(block.text, event.arguments) ?? '')
        break
      }
      case 'response.output_item.done': {
        const item = event.item
        if (item?.type !== 'function_call') break
        const identity = identityOf(item.id ?? event.item_id, event.output_index)
        const block = identity === undefined
          ? open('tool-call')
          : toolBlockFor(identity)
        yield* announce(block, item.call_id, item.name)
        yield* emitArguments(block, streamedRemainder(block.text, item.arguments) ?? '')
        break
      }
      case 'response.completed':
      case 'response.incomplete': {
        if (event.response?.usage) pendingUsage = mapResponseUsage(event.response.usage)
        const reason = event.response?.incomplete_details?.reason
        pendingFinish = sawToolCall
          ? { kind: 'tool-calls' }
          : reason === 'max_output_tokens' || reason === 'max_tokens'
            ? { kind: 'max-tokens' }
            : { kind: 'stop' }
        break
      }
      case 'response.failed': {
        const message = event.response?.error?.message ?? 'the model call failed'
        pendingFinish = {
          kind: 'error',
          failure: { message, code: event.response?.error?.code ?? 'PROVIDER_ERROR' },
        }
        break
      }
      case 'error': {
        pendingFinish = {
          kind: 'error',
          failure: { message: event.message ?? 'the model call failed', code: event.code ?? 'PROVIDER_ERROR' },
        }
        break
      }
      default:
        break
    }
  }

  for (const block of order) {
    yield { type: 'block-end', index: block.index, block: closeBlock(block) }
  }
  if (pendingUsage) yield { type: 'usage', usage: pendingUsage }
  const reason = pendingFinish ?? (sawToolCall ? { kind: 'tool-calls' as const } : { kind: 'stop' as const })
  yield {
    type: 'finish',
    reason: reason.kind === 'stop' && order.length === 0
      ? {
        kind: 'error',
        failure: { message: 'model returned a completed response with no content', code: EMPTY_RESPONSE_CODE },
      }
      : reason,
  }
}

/** Stream one responses-protocol call as harness chunks. */
export async function* streamResponses(
  connection: ProtocolConnection,
  options: GenerateOptions,
  model: string,
): AsyncGenerator<StreamChunk> {
  const response = await postSse(
    connection,
    'responses',
    serializeResponsesRequest(options, model),
    options.signal,
  )
  yield* translateResponses(parseSseUntilEof(response.body as ReadableStream<BufferSource>))
}
