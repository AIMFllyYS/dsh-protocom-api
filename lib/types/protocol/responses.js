/**
 * OpenAI responses wire protocol (the Codex group). Minimal hand-rolled SSE
 * handling: requests map messages to `input` items and the reasoning effort
 * to `reasoning.effort`; stream events resolve through their payload `type`
 * field, terminating at `response.completed` / `response.failed` rather than
 * relying on a `[DONE]` sentinel.
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
function wireInput(message) {
    if (contentHasImage(message.content)) {
        throw new LlmError('The protocom-api responses adapter does not support image content.', 'UNSUPPORTED_CONTENT');
    }
    if (message.role === 'system')
        return [inputTextItem('system', flattenText(message.content))];
    if (message.role === 'user') {
        const result = message.content.find((block) => block.type === 'tool-result');
        if (result !== undefined) {
            if (contentHasImage(result.content)) {
                throw new LlmError('The protocom-api responses adapter does not support image content.', 'UNSUPPORTED_CONTENT');
            }
            return [{
                    type: 'function_call_output',
                    call_id: String(result.toolCallId),
                    output: flattenText(result.content),
                }];
        }
        return [inputTextItem('user', flattenText(message.content))];
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
export function serializeResponsesRequest(options, model) {
    const input = [];
    for (const message of options.messages)
        input.push(...wireInput(message));
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
/**
 * Consume responses-protocol SSE payloads and yield StreamChunks. The
 * terminal state arrives as a `response.completed` / `response.failed` event
 * (or stream EOF); `block-end`s, `usage`, and `finish` are emitted only then,
 * so no chunk follows `finish`.
 */
export async function* translateResponses(payloads) {
    let nextIndex = 0;
    let textBlock;
    let reasoningBlock;
    const order = [];
    let pendingFinish;
    let pendingUsage;
    let sawToolCall = false;
    function open(kind) {
        const block = { index: nextIndex++, kind, text: '' };
        order.push(block);
        return block;
    }
    for await (const payload of payloads) {
        if (payload === DONE)
            break;
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
            case 'response.reasoning_summary_text.delta': {
                if (typeof event.delta !== 'string' || event.delta.length === 0)
                    break;
                if (!reasoningBlock) {
                    reasoningBlock = open('reasoning');
                    yield { type: 'block-start', index: reasoningBlock.index, blockType: 'reasoning' };
                }
                reasoningBlock.text += event.delta;
                yield { type: 'reasoning-delta', index: reasoningBlock.index, text: event.delta };
                break;
            }
            case 'response.output_item.done': {
                const item = event.item;
                if (item?.type !== 'function_call')
                    break;
                sawToolCall = true;
                const block = open('tool-call');
                block.callId = typeof item.call_id === 'string' ? item.call_id : undefined;
                block.name = typeof item.name === 'string' ? item.name : undefined;
                block.text = typeof item.arguments === 'string' ? item.arguments : '';
                yield { type: 'block-start', index: block.index, blockType: 'tool-call' };
                yield {
                    type: 'tool-call-delta',
                    index: block.index,
                    id: ToolCallId(block.callId ?? ''),
                    ...block.name !== undefined ? { name: block.name } : {},
                    argumentsDelta: block.text,
                };
                break;
            }
            case 'response.completed':
            case 'response.incomplete': {
                if (event.response?.usage)
                    pendingUsage = mapResponseUsage(event.response.usage);
                const reason = event.response?.incomplete_details?.reason;
                pendingFinish = sawToolCall
                    ? { kind: 'tool-calls' }
                    : reason === 'max_output_tokens' || reason === 'max_tokens'
                        ? { kind: 'max-tokens' }
                        : { kind: 'stop' };
                break;
            }
            case 'response.failed': {
                const message = event.response?.error?.message ?? 'the model call failed';
                pendingFinish = {
                    kind: 'error',
                    failure: { message, code: event.response?.error?.code ?? 'PROVIDER_ERROR' },
                };
                break;
            }
            case 'error': {
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
    for (const block of order) {
        yield { type: 'block-end', index: block.index, block: closeBlock(block) };
    }
    if (pendingUsage)
        yield { type: 'usage', usage: pendingUsage };
    const reason = pendingFinish ?? (sawToolCall ? { kind: 'tool-calls' } : { kind: 'stop' });
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
export async function* streamResponses(connection, options, model) {
    const response = await postSse(connection, 'responses', serializeResponsesRequest(options, model), options.signal);
    yield* translateResponses(parseSseUntilEof(response.body));
}
