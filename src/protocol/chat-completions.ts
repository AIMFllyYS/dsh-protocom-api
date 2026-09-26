/**
 * OpenAI chat-completions wire protocol: request serialization (thinking
 * fields ported from llm-deepseek's serialize.ts) and SSE translation into
 * harness StreamChunks (after llm-deepseek's translate.ts). Three upstream
 * quirks drive the differences: intermediate chunks may carry an empty-string
 * `finish_reason` that means "not finished", thinking models stream
 * `delta.reasoning_content`, and images ride as inline base64 `image_url`
 * parts (the endpoint accepts data URLs and rejects no image input of its
 * own, so the model's declared modality is the only gate).
 *
 * @module dsh-protocom-api/protocol/chat-completions
 */

import { contentHasImage, EMPTY_RESPONSE_CODE, LlmError, ToolCallId } from '@deepseek-ai/dsh-llm'
import type {
  ContentBlock,
  FinishReason,
  GenerateOptions,
  Message,
  RequestMessage,
  StreamChunk,
  TokenUsage,
} from '@deepseek-ai/dsh-llm'
import { DONE, parseSse, parseSseUntilEof } from '../sse.ts'
import { postSse } from './http.ts'
import type { ProtocolConnection, RequestImageUrls } from './http.ts'

export type { RequestImageUrls } from './http.ts'

/** One content part of a multimodal user message. */
type WireContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

/** One conversation message on the wire. */
interface WireMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  /** Participant label; the re-attribution compatibility mode uses it. */
  name?: string
  content: string | WireContentPart[]
  reasoning_content?: string
  tool_call_id?: string
  tool_calls?: {
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }[]
}

/** Token accounting as the endpoint reports it. */
export interface WireUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number }
  completion_tokens_details?: { reasoning_tokens?: number }
}

/** One streamed chunk on the wire. */
interface WireChunk {
  choices?: {
    delta?: {
      content?: string
      reasoning_content?: string
      /**
       * Alternate thinking fields an OpenRouter-style route streams instead
       * of `reasoning_content`: `reasoning` carries the text (MiniMax M2.5 on
       * OpenCode Go) and `reasoning_details` repeats it as typed detail rows.
       */
      reasoning?: string
      reasoning_details?: { type?: string; text?: string }[]
      tool_calls?: {
        index: number
        id?: string | null
        function?: { name?: string; arguments?: string }
      }[]
    }
    // Upstream quirk: intermediate chunks may carry '' here.
    finish_reason?: string | null
  }[]
  usage?: WireUsage
}

/** How a request spells thinking control on this family's chat surface. */
export type ThinkingMode = 'toggle' | 'effort-only'

/**
 * Resolve the wire thinking fields for one request. The default `toggle`
 * spelling sends `thinking: {type}` plus `reasoning_effort`: `off` disables
 * thinking explicitly; any other effort enables it and rides as
 * `reasoning_effort`; an absent effort leaves the provider's own default
 * alone. `effort-only` (OpenCode Go) sends `reasoning_effort` verbatim — the
 * gateway parses it without a `thinking` block, which GLM routes refuse
 * outright — and the disabling word (`none`, `off`) is part of the model's
 * advertised effort vocabulary rather than a special case here.
 */
export function resolveThinking(effort: string | undefined, mode: ThinkingMode = 'toggle'): {
  thinking?: { type: 'enabled' | 'disabled' }
  reasoning_effort?: string
} {
  if (mode === 'effort-only') {
    return effort === undefined ? {} : { reasoning_effort: effort }
  }
  if (effort === 'off') return { thinking: { type: 'disabled' } }
  if (effort !== undefined) return { thinking: { type: 'enabled' }, reasoning_effort: effort }
  return {}
}

/**
 * Map wire usage fields to the harness's DISJOINT counts: the endpoint folds
 * cache hits into `prompt_tokens`, so cached reads are subtracted out of
 * `inputTokens` and reported separately.
 */
export function mapUsage(usage: WireUsage): TokenUsage {
  const cacheRead = usage.prompt_tokens_details?.cached_tokens
  const reasoning = usage.completion_tokens_details?.reasoning_tokens
  const combined = usage.prompt_tokens + usage.completion_tokens
  const hasExactTotal = Number.isSafeInteger(usage.prompt_tokens)
    && usage.prompt_tokens >= 0
    && Number.isSafeInteger(usage.completion_tokens)
    && usage.completion_tokens >= 0
    && Number.isSafeInteger(combined)
    && (usage.total_tokens === undefined || usage.total_tokens === combined)
  return {
    inputTokens: usage.prompt_tokens - (cacheRead ?? 0),
    outputTokens: usage.completion_tokens,
    ...hasExactTotal ? { totalTokens: combined } : {},
    ...cacheRead !== undefined ? { cacheReadTokens: cacheRead } : {},
    ...reasoning !== undefined ? { reasoningTokens: reasoning } : {},
  }
}

/**
 * Map the wire finish_reason vocabulary to the harness FinishReason.
 * Unrecognized values become `{kind: 'error'}` with the uppercased value as
 * `code`.
 */
export function mapFinishReason(reason: string): FinishReason {
  switch (reason) {
    case 'stop': return { kind: 'stop' }
    case 'tool_calls': return { kind: 'tool-calls' }
    case 'length': return { kind: 'max-tokens' }
    default:
      return {
        kind: 'error',
        failure: { message: `model stopped: ${reason}`, code: reason.toUpperCase() },
      }
  }
}

function flattenText(blocks: readonly ContentBlock[]): string {
  return blocks.filter(block => block.type === 'text').map(block => block.text).join('')
}

function assertTextOnly(blocks: readonly ContentBlock[]): void {
  if (contentHasImage(blocks)) {
    throw new LlmError('The chat-completions adapter does not support image content here.', 'UNSUPPORTED_CONTENT')
  }
}

/**
 * The user-message content: a plain string while no image survives, otherwise
 * the multimodal part list. Text parts keep their order ahead of the images,
 * matching how the composer presents them.
 */
function userContent(
  blocks: readonly ContentBlock[],
  images: RequestImageUrls | undefined,
): string | WireContentPart[] {
  const text = flattenText(blocks)
  if (images === undefined || images.size === 0) return text
  const parts: WireContentPart[] = []
  if (text.length > 0) parts.push({ type: 'text', text })
  for (const block of blocks) {
    if (block.type !== 'image') continue
    const url = images.get(String(block.attachment.attachmentId))
    if (url !== undefined) parts.push({ type: 'image_url', image_url: { url } })
  }
  return parts.length === 0 ? text : parts
}

function wireMessage(message: RequestMessage, images: RequestImageUrls | undefined): WireMessage {
  if (message.role === 'system') return { role: 'system', content: flattenText(message.content) }
  // Since 1.7 a tool result is its own message of role `tool` carrying the
  // blocks directly, rather than a `tool-result` block nested in a user
  // message. The wire shape is unchanged; only where the harness puts it moved.
  if (message.role === 'tool') {
    assertTextOnly(message.content)
    return { role: 'tool', tool_call_id: String(message.toolCallId), content: flattenText(message.content) }
  }
  if (message.role === 'user') {
    return { role: 'user', content: userContent(message.content, images) }
  }
  // The assistant branch is decided by the compatibility mode, not here.
  throw new LlmError('assistant messages are serialized by assistantMessages()', 'INVALID_REQUEST')
}

/**
 * How a chat-completions request replays an assistant message's own text.
 *
 * `see GroupConfig.assistantTextReplay — this relay's chat surface translates
 * to an upstream Responses API that refuses an assistant text item in every
 * chat-side shape (string, `text` part, `output_text` part all answer 400),
 * while accepting the same words on a user item. `keep` is the correct wire
 * behaviour and the default; the two other modes exist so a deployment whose
 * route has that defect can still be served.
 */
export type AssistantTextReplay = 'keep' | 'drop' | 'user'

/**
 * The wire messages one assistant turn becomes. An image is a caller bug here
 * (assistant output is declared text-only), and the text may be dropped or
 * re-attributed when the route cannot carry it.
 */
function assistantMessages(
  message: Message,
  replayReasoning: boolean,
  assistantTextReplay: AssistantTextReplay,
): WireMessage[] {
  assertTextOnly(message.content)
  const text = flattenText(message.content)
  const reasoning = message.content
    .filter(block => block.type === 'reasoning')
    .map(block => block.text)
    .join('')
  const toolCalls = message.content
    .filter((block): block is Extract<ContentBlock, { type: 'tool-call' }> => block.type === 'tool-call')
    .map(block => ({
      id: String(block.id),
      type: 'function' as const,
      function: { name: block.name, arguments: block.arguments },
    }))
  const body: WireMessage = {
    role: 'assistant',
    content: text,
    // Reasoning is the model's own scratch work, and routes disagree about
    // whether it may come back: this relay answers 400 for a replayed
    // assistant turn that carries it, and DeepSeek's own API documents the
    // same. A route that needs its thinking back — an interleaved-thinking
    // provider — asks for it with `replayReasoning: true`.
    ...replayReasoning && reasoning.length > 0 ? { reasoning_content: reasoning } : {},
    ...toolCalls.length > 0 ? { tool_calls: toolCalls } : {},
  }
  if (text.length === 0 || assistantTextReplay === 'keep') return [body]
  // Nothing about the turn is lost — the tool calls still ride the assistant
  // message — but the route never sees the assistant's own prose.
  if (assistantTextReplay === 'drop') return [{ ...body, content: '' }]
  // The text survives on a user item labelled `assistant`: the only shape this
  // relay's translation accepts with the words still present.
  return [{ role: 'user', name: 'assistant', content: text }, { ...body, content: '' }]
}

/** The wire messages one harness message becomes, under the route's modes. */
function wireMessages(
  message: RequestMessage,
  images: RequestImageUrls | undefined,
  replayReasoning: boolean,
  assistantTextReplay: AssistantTextReplay,
): WireMessage[] {
  if (message.role === 'assistant') return assistantMessages(message, replayReasoning, assistantTextReplay)
  return [wireMessage(message, images)]
}

/** Serialize one request into the chat-completions wire body. */
export function serializeChatRequest(
  options: GenerateOptions,
  model: string,
  images?: RequestImageUrls,
  replayReasoning = false,
  assistantTextReplay: AssistantTextReplay = 'keep',
  thinking: ThinkingMode = 'toggle',
): Record<string, unknown> {
  const messages: WireMessage[] = []
  if (options.system !== undefined) messages.push({ role: 'system', content: options.system })
  for (const message of options.messages) {
    messages.push(...wireMessages(message, images, replayReasoning, assistantTextReplay))
  }
  return {
    model,
    messages,
    stream: true,
    ...options.temperature === undefined ? {} : { temperature: options.temperature },
    ...options.maxTokens === undefined ? {} : { max_tokens: options.maxTokens },
    ...options.stop === undefined || options.stop.length === 0 ? {} : { stop: options.stop },
    ...options.tools === undefined || options.tools.length === 0
      ? {}
      : {
        tools: options.tools.map(tool => ({
          type: 'function',
          function: { name: tool.name, description: tool.description, parameters: tool.parameters },
        })),
      },
    ...resolveThinking(options.reasoningEffort, thinking),
  }
}

/** One open block under assembly. */
interface OpenBlock {
  index: number
  kind: 'text' | 'reasoning' | 'tool-call'
  text: string
  callId?: string | undefined
  name?: string | undefined
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

/** `id` and `name` are identity: the wire sends each once, on the call's first delta. */
function acceptIdentity(current: string | undefined, incoming: unknown): string | undefined {
  return typeof incoming === 'string' && incoming.length > 0 ? incoming : current
}

/** One extracted stream segment: text, or thinking lifted out of it. */
interface TextSegment {
  kind: 'text' | 'reasoning'
  text: string
}

const OPEN_TAG = '<think>'
const CLOSE_TAG = '</think>'

/**
 * Lift an inline `<think>…</think>` segment out of a streamed `content`
 * string. Some routes (MiniMax M3 on OpenCode Go) emit thinking inside the
 * content stream rather than on a reasoning field; keeping the tag split-safe
 * across chunk boundaries is the whole job — a suffix that is a proper prefix
 * of the boundary tag is buffered until the next chunk resolves it, and a
 * buffered suffix that turns out not to be a tag flows through as text.
 */
export class ThinkTagExtractor {
  private pending = ''
  private state: 'text' | 'reasoning' = 'text'

  /** Consume one content delta; emit the segments it completes. */
  feed(input: string): TextSegment[] {
    this.pending += input
    const out: TextSegment[] = []
    for (;;) {
      const tag = this.state === 'text' ? OPEN_TAG : CLOSE_TAG
      const at = this.pending.indexOf(tag)
      if (at === -1) {
        // The only bytes worth holding back are a suffix that could still
        // grow into the boundary tag; everything else is decided text.
        let keep = 0
        for (let length = Math.min(tag.length - 1, this.pending.length); length > 0; length--) {
          if (tag.startsWith(this.pending.slice(this.pending.length - length))) {
            keep = length
            break
          }
        }
        const emit = this.pending.slice(0, this.pending.length - keep)
        if (emit.length > 0) out.push({ kind: this.state, text: emit })
        this.pending = this.pending.slice(this.pending.length - keep)
        return out
      }
      if (at > 0) out.push({ kind: this.state, text: this.pending.slice(0, at) })
      this.state = this.state === 'text' ? 'reasoning' : 'text'
      this.pending = this.pending.slice(at + tag.length)
    }
  }

  /** Emit whatever remains when the stream ends; an unclosed think stays reasoning. */
  flush(): TextSegment[] {
    const out = this.pending.length > 0 ? [{ kind: this.state, text: this.pending } as TextSegment] : []
    this.pending = ''
    return out
  }
}

/**
 * Consume SSE data payloads (ending with `[DONE]`) and yield StreamChunks.
 * `block-end`s, `usage`, and `finish` are deferred to the `[DONE]` sentinel
 * so no chunk follows `finish`. A `stop` (or absent) finish with no opened
 * blocks maps to an `EMPTY_RESPONSE` error finish instead of a successful
 * empty message.
 */
export async function* translateChatCompletions(
  payloads: AsyncIterable<string>,
  behavior: { inlineReasoning?: boolean } = {},
): AsyncGenerator<StreamChunk> {
  let nextIndex = 0
  let textBlock: OpenBlock | undefined
  let reasoningBlock: OpenBlock | undefined
  const toolBlocks = new Map<number, OpenBlock>()
  const order: OpenBlock[] = []
  let pendingFinish: FinishReason | undefined
  let pendingUsage: TokenUsage | undefined
  const think = behavior.inlineReasoning === true ? new ThinkTagExtractor() : undefined

  function* emitReasoning(text: string): Generator<StreamChunk> {
    if (text.length === 0) return
    if (!reasoningBlock) {
      reasoningBlock = open('reasoning')
      yield { type: 'block-start', index: reasoningBlock.index, blockType: 'reasoning' }
    }
    reasoningBlock.text += text
    yield { type: 'reasoning-delta', index: reasoningBlock.index, text }
  }

  function* emitText(text: string): Generator<StreamChunk> {
    if (text.length === 0) return
    if (!textBlock) {
      textBlock = open('text')
      yield { type: 'block-start', index: textBlock.index, blockType: 'text' }
    }
    textBlock.text += text
    yield { type: 'text-delta', index: textBlock.index, text }
  }

  function* emitSegment(segment: TextSegment): Generator<StreamChunk> {
    yield* segment.kind === 'reasoning' ? emitReasoning(segment.text) : emitText(segment.text)
  }

  function open(kind: OpenBlock['kind']): OpenBlock {
    const block: OpenBlock = { index: nextIndex++, kind, text: '' }
    order.push(block)
    return block
  }

  function* closeOut(): Generator<StreamChunk> {
    // An unclosed <think> at stream end still lands where it was written.
    if (think !== undefined) {
      for (const segment of think.flush()) yield* emitSegment(segment)
    }
    for (const block of order) {
      yield { type: 'block-end', index: block.index, block: closeBlock(block) }
    }
    if (pendingUsage) yield { type: 'usage', usage: pendingUsage }
    yield { type: 'finish', reason: closeOutReason() }
  }

  /**
   * The terminal reason for a stream that ended. A `stop` (or absent) finish
   * is degenerate when the turn produced nothing model-visible: an empty
   * stream, or one whose only blocks are reasoning.
   *
   * Reasoning is the model's own scratch work, never the turn's answer, and
   * GLM-5.3 Flash on OpenCode Go intermittently ends a turn exactly there —
   * `finish_reason: "stop"` with a full `reasoning_content` and an empty
   * content delta (measured on the same prompt: 5 of 16 requests). Counting
   * the reasoning block as output reported that as a successful turn, so the
   * agent loop closed the turn with no reply and no tool call to run: from the
   * outside it is indistinguishable from a hang, and nothing retries it.
   * EMPTY_RESPONSE is on the retryable-code list the harness re-requests, so a
   * stochastic stall costs one backoff instead of the turn.
   */
  function closeOutReason(): FinishReason {
    const reason = pendingFinish ?? { kind: 'stop' as const }
    if (reason.kind !== 'stop' || order.some(block => block.kind !== 'reasoning')) return reason
    return {
      kind: 'error',
      failure: {
        message: order.length === 0
          ? 'model returned a completed response with no content'
          : 'model ended the turn after reasoning without a reply or a tool call',
        code: EMPTY_RESPONSE_CODE,
      },
    }
  }

  for await (const payload of payloads) {
    if (payload === DONE) {
      yield* closeOut()
      return
    }

    let chunk: WireChunk
    try {
      chunk = JSON.parse(payload) as WireChunk
    } catch {
      throw new LlmError(`malformed SSE payload: ${payload.slice(0, 120)}`, 'MALFORMED_RESPONSE')
    }

    for (const choice of chunk.choices ?? []) {
      const delta = choice.delta

      // Reasoning channels differ by route: `reasoning_content` is the common
      // field; `reasoning` and `reasoning_details` are the OpenRouter-style
      // spelling MiniMax M2.5 streams on OpenCode Go.
      const reasoning = delta?.reasoning_content
        ?? (typeof delta?.reasoning === 'string' ? delta.reasoning : undefined)
        ?? delta?.reasoning_details?.map(detail => detail.text ?? '').join('')
      if (typeof reasoning === 'string' && reasoning.length > 0) {
        yield* emitReasoning(reasoning)
      }

      const content = delta?.content
      if (typeof content === 'string' && content.length > 0) {
        if (think === undefined) {
          yield* emitText(content)
        } else {
          for (const segment of think.feed(content)) yield* emitSegment(segment)
        }
      }

      for (const call of delta?.tool_calls ?? []) {
        let block = toolBlocks.get(call.index)
        if (!block) {
          block = open('tool-call')
          toolBlocks.set(call.index, block)
          yield { type: 'block-start', index: block.index, blockType: 'tool-call' }
        }
        block.callId = acceptIdentity(block.callId, call.id)
        block.name = acceptIdentity(block.name, call.function?.name)
        const fragment = call.function?.arguments ?? ''
        block.text += fragment
        yield {
          type: 'tool-call-delta',
          index: block.index,
          id: ToolCallId(block.callId ?? ''),
          ...block.name !== undefined ? { name: block.name } : {},
          argumentsDelta: fragment,
        }
      }

      // An empty-string finish_reason on an intermediate chunk is padding,
      // not a terminal state.
      if (typeof choice.finish_reason === 'string' && choice.finish_reason.length > 0) {
        pendingFinish = mapFinishReason(choice.finish_reason)
      }
    }

    // Usage rides the penultimate chunk, after the content deltas.
    if (chunk.usage) pendingUsage = mapUsage(chunk.usage)
  }

  // parseSse guarantees the [DONE] sentinel (or throws), but a Go route can
  // close cleanly after a finish_reason without sending it (verified live on
  // minimax-m3). A declared finish_reason is the upstream's own completion
  // signal, so honour it; a bare EOF still means the stream was cut.
  if (pendingFinish !== undefined) {
    yield* closeOut()
    return
  }
  throw new LlmError('SSE payload stream ended without [DONE]', 'STREAM_CLOSED')
}

/** Per-route request/response behaviour the group cannot express alone. */
export interface ChatStreamBehavior {
  /** Whether a replayed assistant turn carries its `reasoning_content` back. */
  replayReasoning?: boolean
  /** How a replayed assistant turn's own text is carried. */
  assistantTextReplay?: AssistantTextReplay
  /** Thinking-control spelling this family's surface expects. */
  thinking?: ThinkingMode | undefined
  /**
   * Whether this model emits thinking inline as `<think>…</think>` inside
   * `content`; the extractor lifts it into a reasoning block (MiniMax M3).
   */
  inlineReasoning?: boolean | undefined
}

/** Stream one chat-completions call as harness chunks. */
export async function* streamChatCompletions(
  connection: ProtocolConnection,
  options: GenerateOptions,
  model: string,
  images?: RequestImageUrls,
  behavior: ChatStreamBehavior = {},
): AsyncGenerator<StreamChunk> {
  const response = await postSse(
    connection,
    'chat/completions',
    serializeChatRequest(
      options,
      model,
      images,
      behavior.replayReasoning ?? false,
      behavior.assistantTextReplay ?? 'keep',
      behavior.thinking ?? 'toggle',
    ),
    options.signal,
  )
  // A Go route that streams inline <think> can close after its finish_reason
  // without a [DONE] sentinel (verified live on minimax-m3), so that route
  // reads until EOF and lets the translator judge completion; every other
  // route keeps the strict truncation guard.
  yield* translateChatCompletions(
    behavior.inlineReasoning === true
      ? parseSseUntilEof(response.body as ReadableStream<BufferSource>)
      : parseSse(response.body as ReadableStream<BufferSource>),
    behavior.inlineReasoning === true ? { inlineReasoning: true } : {},
  )
}
