/**
 * OpenAI responses wire protocol (the Codex group). Minimal hand-rolled SSE
 * handling: requests map messages to `input` items and the reasoning effort
 * to `reasoning.effort`; stream events resolve through their payload `type`
 * field, terminating at `response.completed` / `response.failed` rather than
 * relying on a `[DONE]` sentinel. Images ride as inline base64
 * `input_image` parts, so a multimodal model is reachable on either wire
 * protocol. Tool calls stream twice on this protocol —
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
import { contentHasImage, EMPTY_RESPONSE_CODE, LlmError, ToolCallId } from '@deepseek-ai/dsh-llm';
import { DONE, parseSseUntilEof } from "../sse.js";
import { postSse } from "./http.js";
/**
 * Map wire usage fields to the harness's DISJOINT counts: cached input is
 * folded into `input_tokens`, so it is subtracted out and reported
 * separately.
 */
export function mapResponseUsage(usage) {
    const cacheRead = usage.input_tokens_details?.cached_tokens;
    const reasoning = usage.output_tokens_details?.reasoning_tokens;
    const combined = usage.input_tokens + usage.output_tokens;
    const hasExactTotal = Number.isSafeInteger(usage.input_tokens)
        && usage.input_tokens >= 0
        && Number.isSafeInteger(usage.output_tokens)
        && usage.output_tokens >= 0
        && Number.isSafeInteger(combined)
        && (usage.total_tokens === undefined || usage.total_tokens === combined);
    return {
        inputTokens: usage.input_tokens - (cacheRead ?? 0),
        outputTokens: usage.output_tokens,
        ...hasExactTotal ? { totalTokens: combined } : {},
        ...cacheRead !== undefined ? { cacheReadTokens: cacheRead } : {},
        ...reasoning !== undefined ? { reasoningTokens: reasoning } : {},
    };
}
function flattenText(blocks) {
    return blocks.filter(block => block.type === 'text').map(block => block.text).join('');
}
function inputTextItem(role, text) {
    return { type: 'message', role, content: [{ type: 'input_text', text }] };
}
/**
 * The content parts of one input item: the block's text first, then every image
 * this request retained as the inline data URL the endpoint accepts. An item
 * whose parts all failed to resolve still carries its text, because an empty
 * content array is a wire error and the text is what keeps the replayed turn
 * faithful.
 */
function inputParts(blocks, images) {
    const text = flattenText(blocks);
    const parts = text.length > 0 ? [{ type: 'input_text', text }] : [];
    for (const block of blocks) {
        if (block.type !== 'image')
            continue;
        const url = images?.get(String(block.attachment.attachmentId));
        if (url !== undefined)
            parts.push({ type: 'input_image', image_url: url });
    }
    return parts.length === 0 ? [{ type: 'input_text', text }] : parts;
}
function wireInput(message, images) {
    if (message.role === 'system')
        return [inputTextItem('system', flattenText(message.content))];
    if (message.role === 'user') {
        const result = message.content.find((block) => block.type === 'tool-result');
        if (result !== undefined) {
            const parts = inputParts(result.content, images);
            return [{
                    type: 'function_call_output',
                    call_id: String(result.toolCallId),
                    // A text-only tool result keeps the historical string form, so nothing
                    // about the common path changes; only a result carrying an image needs
                    // the content-part form the protocol also accepts.
                    output: parts.length === 1 && parts[0]?.type === 'input_text' ? parts[0].text : parts,
                }];
        }
        return [{ type: 'message', role: 'user', content: inputParts(message.content, images) }];
    }
    // Assistant output is declared text-only, so an image here is a caller bug
    // rather than something the protocol could carry.
    if (contentHasImage(message.content)) {
        throw new LlmError('The protocom-api responses adapter does not support image content on an assistant message.', 'UNSUPPORTED_CONTENT');
    }
    // Reasoning blocks cannot be replayed: the protocol's reasoning items carry
    // server-issued signatures a stateless client cannot reconstruct, so only
    // visible output and tool calls go back.
    const items = [];
    const text = flattenText(message.content);
    if (text.length > 0) {
        items.push({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] });
    }
    for (const block of message.content) {
        if (block.type !== 'tool-call')
            continue;
        items.push({
            type: 'function_call',
            call_id: String(block.id),
            name: block.name,
            arguments: block.arguments,
        });
    }
    return items;
}
/**
 * Serialize one request into the responses wire body. Any effort but `off`
 * maps to `reasoning.effort`; `off` and an absent effort both omit the field
 * (the protocol has no explicit disabled spelling).
 */
export function serializeResponsesRequest(options, model, images) {
    const input = [];
    for (const message of options.messages)
        input.push(...wireInput(message, images));
    const effort = options.reasoningEffort;
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
    };
}
function closeBlock(block) {
    switch (block.kind) {
        case 'text': return { type: 'text', text: block.text };
        case 'reasoning': return { type: 'reasoning', text: block.text };
        case 'tool-call': return {
            type: 'tool-call',
            id: ToolCallId(block.callId ?? ''),
            name: block.name ?? '',
            arguments: block.text,
        };
    }
}
/** `id` and `name` are identity: the wire sends each once, on the call's first event. */
function acceptIdentity(current, incoming) {
    return typeof incoming === 'string' && incoming.length > 0 ? incoming : current;
}
/**
 * The part of a complete text the deltas have not carried yet. Providers
 * resend the complete value on the `...done` events — tool-call arguments and
 * reasoning alike — so only what extends the streamed prefix is new; text that
 * does not extend it is dropped rather than replayed as duplicate content.
 */
function streamedRemainder(streamed, complete) {
    if (complete === undefined || complete.length === 0)
        return undefined;
    if (!complete.startsWith(streamed))
        return undefined;
    return complete.slice(streamed.length);
}
/**
 * Adopt one completing event's authoritative argument text, or leave the block
 * unconfirmed. The event's *existence* proves nothing — the endpoint controls
 * its payload too — so the text must be present and must be exactly what the
 * block now holds (the streamed prefix extended by the event's remainder).
 * Anything else fails closed: the flush drops the block and forces an error.
 */
function acceptComplete(block, complete) {
    if (complete === undefined || complete.length === 0)
        return;
    if (block.text !== complete)
        return;
    block.complete = true;
}
/**
 * The reasoning text one complete reasoning item carries, when it carries any.
 * Providers spell the same content as `reasoning_text` parts, as summary
 * parts, or as both; a provider that streams nothing and only restates the
 * finished item still delivers its thinking through here.
 */
function itemReasoningText(item) {
    const parts = [
        ...(item.content ?? []).filter(part => part.type === 'reasoning_text').map(part => part.text ?? ''),
        ...(item.summary ?? []).map(part => part.text ?? ''),
    ].filter(text => text.length > 0);
    return parts.length === 0 ? undefined : parts.join('');
}
/**
 * Consume responses-protocol SSE payloads and yield StreamChunks. The
 * terminal state must arrive as a `response.completed` / `response.incomplete`
 * / `response.failed` / `error` event, or the `[DONE]` sentinel; `block-end`s,
 * `usage`, and `finish` are emitted only then, so no chunk follows `finish`.
 * A bare EOF is a truncated stream, not a completed turn.
 */
export async function* translateResponses(payloads) {
    let nextIndex = 0;
    let textBlock;
    let reasoningBlock;
    const order = [];
    let pendingFinish;
    let pendingUsage;
    let sawToolCall = false;
    /** Whether the peer explicitly ended the stream, as opposed to closing it. */
    let sawTerminal = false;
    /** One streamed call per wire identity, so its deltas and its terminal item share one block. */
    const toolBlocks = new Map();
    function open(kind) {
        const block = { index: nextIndex++, kind, text: '' };
        order.push(block);
        return block;
    }
    /** The open call block for one wire identity, created on first sight. */
    function toolBlockFor(identity) {
        let block = toolBlocks.get(identity);
        if (!block) {
            block = open('tool-call');
            toolBlocks.set(identity, block);
        }
        return block;
    }
    /** One wire identity per call: the item id when sent, else its output index. */
    function identityOf(itemId, outputIndex) {
        if (typeof itemId === 'string' && itemId.length > 0)
            return itemId;
        if (typeof outputIndex === 'number' && Number.isSafeInteger(outputIndex))
            return `#${outputIndex}`;
        return undefined;
    }
    /**
     * Adopt whatever identity this event discloses and, on the first one, open
     * the block. Identity is re-read on every event because the wire may not
     * disclose `call_id`/`name` until the item completes, and the opening
     * `block-start` must precede every delta whether or not it ever does.
     */
    function* announce(block, id, name) {
        block.callId = acceptIdentity(block.callId, id);
        block.name = acceptIdentity(block.name, name);
        if (block.announced !== true) {
            block.announced = true;
            sawToolCall = true;
            yield { type: 'block-start', index: block.index, blockType: 'tool-call' };
        }
    }
    /** Append argument text and yield the delta carrying it. A confirmed block is frozen. */
    function* emitArguments(block, fragment) {
        if (block.complete === true || fragment.length === 0)
            return;
        block.text += fragment;
        yield {
            type: 'tool-call-delta',
            index: block.index,
            id: ToolCallId(block.callId ?? ''),
            ...block.name === undefined ? {} : { name: block.name },
            argumentsDelta: fragment,
        };
    }
    /**
     * Append reasoning text and yield the delta carrying it. The endpoint
     * streams reasoning under three vocabularies — a plain `delta` on
     * `response.reasoning.delta`, a summary `delta` on
     * `response.reasoning_summary_text.delta`, and a complete restatement on the
     * `...done` events — so every spelling funnels through here and the block
     * opens on whichever one carries the first text.
     */
    function* emitReasoning(fragment) {
        if (fragment === undefined || fragment.length === 0)
            return;
        if (reasoningBlock === undefined) {
            reasoningBlock = open('reasoning');
            yield { type: 'block-start', index: reasoningBlock.index, blockType: 'reasoning' };
        }
        reasoningBlock.text += fragment;
        yield { type: 'reasoning-delta', index: reasoningBlock.index, text: fragment };
    }
    for await (const payload of payloads) {
        if (payload === DONE) {
            sawTerminal = true;
            break;
        }
        let event;
        try {
            event = JSON.parse(payload);
        }
        catch {
            throw new LlmError(`malformed SSE payload: ${payload.slice(0, 120)}`, 'MALFORMED_RESPONSE');
        }
        switch (event.type) {
            case 'response.output_text.delta': {
                if (typeof event.delta !== 'string' || event.delta.length === 0)
                    break;
                if (!textBlock) {
                    textBlock = open('text');
                    yield { type: 'block-start', index: textBlock.index, blockType: 'text' };
                }
                textBlock.text += event.delta;
                yield { type: 'text-delta', index: textBlock.index, text: event.delta };
                break;
            }
            // Streaming reasoning. Models differ on the spelling: the plain
            // `response.reasoning.delta`, the summary variant, or — StepFun's own
            // — `response.reasoning_text.delta`.
            case 'response.reasoning.delta':
            case 'response.reasoning_text.delta':
            case 'response.reasoning_summary_text.delta': {
                yield* emitReasoning(typeof event.delta === 'string' ? event.delta : undefined);
                break;
            }
            // Terminal reasoning: the whole text once more. Only the part the deltas
            // have not carried is emitted, so a model that streams AND restates never
            // doubles its reasoning, while a model that only restates still delivers
            // the complete text as one delta.
            case 'response.reasoning.done':
            case 'response.reasoning_text.done':
            case 'response.reasoning_summary_text.done': {
                yield* emitReasoning(streamedRemainder(reasoningBlock?.text ?? '', typeof event.text === 'string' ? event.text : undefined));
                break;
            }
            case 'response.reasoning_part.done':
            case 'response.reasoning_summary_part.done': {
                yield* emitReasoning(streamedRemainder(reasoningBlock?.text ?? '', typeof event.part?.text === 'string' ? event.part.text : undefined));
                break;
            }
            case 'response.output_item.added': {
                const item = event.item;
                if (item?.type === 'reasoning') {
                    // Some providers disclose reasoning only as the finished item.
                    yield* emitReasoning(streamedRemainder(reasoningBlock?.text ?? '', itemReasoningText(item)));
                    break;
                }
                if (item?.type !== 'function_call')
                    break;
                const identity = identityOf(item.id ?? event.item_id, event.output_index);
                if (identity === undefined)
                    break;
                const block = toolBlockFor(identity);
                yield* announce(block, item.call_id, item.name);
                yield* emitArguments(block, item.arguments ?? '');
                break;
            }
            case 'response.function_call_arguments.delta': {
                const identity = identityOf(event.item_id, event.output_index);
                if (identity === undefined || typeof event.delta !== 'string')
                    break;
                const deltaBlock = toolBlockFor(identity);
                yield* announce(deltaBlock, undefined, undefined);
                yield* emitArguments(deltaBlock, event.delta);
                break;
            }
            case 'response.function_call_arguments.done': {
                const identity = identityOf(event.item_id, event.output_index);
                if (identity === undefined)
                    break;
                const block = toolBlockFor(identity);
                yield* announce(block, undefined, undefined);
                yield* emitArguments(block, streamedRemainder(block.text, event.arguments) ?? '');
                acceptComplete(block, event.arguments);
                break;
            }
            case 'response.output_item.done': {
                const item = event.item;
                if (item?.type === 'reasoning') {
                    // The terminal restatement of a reasoning item. Only the part the
                    // deltas have not carried is emitted, so StepFun's own stream (which
                    // sends both) never doubles its thinking while a provider that only
                    // restates the item still delivers it whole.
                    yield* emitReasoning(streamedRemainder(reasoningBlock?.text ?? '', itemReasoningText(item)));
                    break;
                }
                if (item?.type !== 'function_call')
                    break;
                const identity = identityOf(item.id ?? event.item_id, event.output_index);
                const block = identity === undefined
                    ? open('tool-call')
                    : toolBlockFor(identity);
                yield* announce(block, item.call_id, item.name);
                yield* emitArguments(block, streamedRemainder(block.text, item.arguments) ?? '');
                acceptComplete(block, item.arguments);
                break;
            }
            case 'response.completed':
            case 'response.incomplete': {
                sawTerminal = true;
                if (event.response?.usage)
                    pendingUsage = mapResponseUsage(event.response.usage);
                const reason = event.response?.incomplete_details?.reason;
                // A response that reports itself incomplete without naming a reason
                // ran out of output budget: StepFun stops mid-reasoning with
                // `status: "incomplete"` and `incomplete_details: null`, and calling
                // that a `stop` would present a truncated turn as a finished one.
                const incomplete = event.type === 'response.incomplete' || event.response?.status === 'incomplete';
                pendingFinish = sawToolCall
                    ? { kind: 'tool-calls' }
                    : reason === 'max_output_tokens' || reason === 'max_tokens'
                        || (incomplete && reason === undefined)
                        ? { kind: 'max-tokens' }
                        : { kind: 'stop' };
                break;
            }
            case 'response.failed': {
                sawTerminal = true;
                const message = event.response?.error?.message ?? 'the model call failed';
                pendingFinish = {
                    kind: 'error',
                    failure: { message, code: event.response?.error?.code ?? 'PROVIDER_ERROR' },
                };
                break;
            }
            case 'error': {
                sawTerminal = true;
                pendingFinish = {
                    kind: 'error',
                    failure: { message: event.message ?? 'the model call failed', code: event.code ?? 'PROVIDER_ERROR' },
                };
                break;
            }
            default:
                break;
        }
    }
    if (!sawTerminal) {
        // A stream that ends without a terminal event was cut off: its open blocks
        // hold whatever happened to arrive. Flushing a tool call there would let the
        // endpoint choose the command's arguments by choosing when to disconnect,
        // and a `tool-calls` finish would skip the retry layer an error reaches.
        // The chat-completions path already throws here; aligning the two closes the
        // responses-only integrity gap.
        throw new LlmError('Protocom responses stream ended before a terminal event', 'STREAM_CLOSED');
    }
    // A terminal event proves the *stream* ended, not that each open tool call
    // carried complete arguments — the endpoint controls both. A call the wire
    // never confirmed (no `function_call_arguments.done` / `output_item.done`) is
    // dropped, and anything dropped turns the finish into an error so the retry
    // layer sees it instead of `tool-calls` reaching `executeToolCalls`.
    let truncated = false;
    for (const block of order) {
        if (block.kind === 'tool-call' && block.complete !== true) {
            truncated = true;
            continue;
        }
        yield { type: 'block-end', index: block.index, block: closeBlock(block) };
    }
    if (pendingUsage)
        yield { type: 'usage', usage: pendingUsage };
    const settled = pendingFinish ?? (sawToolCall ? { kind: 'tool-calls' } : { kind: 'stop' });
    const reason = truncated && settled.kind !== 'error'
        ? {
            kind: 'error',
            failure: {
                message: 'Protocom responses stream carried a tool call whose arguments never completed',
                code: 'STREAM_CLOSED',
            },
        }
        : settled;
    yield {
        type: 'finish',
        reason: reason.kind === 'stop' && order.length === 0
            ? {
                kind: 'error',
                failure: { message: 'model returned a completed response with no content', code: EMPTY_RESPONSE_CODE },
            }
            : reason,
    };
}
/** Stream one responses-protocol call as harness chunks. */
export async function* streamResponses(connection, options, model, images) {
    const response = await postSse(connection, 'responses', serializeResponsesRequest(options, model, images), options.signal);
    yield* translateResponses(parseSseUntilEof(response.body));
}
