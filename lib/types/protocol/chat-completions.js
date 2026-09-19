/**
 * OpenAI chat-completions wire protocol: request serialization (thinking
 * fields ported from llm-deepseek's serialize.ts) and SSE translation into
 * harness StreamChunks (after llm-deepseek's translate.ts). Two upstream
 * quirks drive the differences: intermediate chunks may carry an empty-string
 * `finish_reason` that means "not finished", and thinking models stream
 * `delta.reasoning_content`.
 *
 * @module dsh-protocom-api/protocol/chat-completions
 */
import { contentHasImage, EMPTY_RESPONSE_CODE, LlmError, ToolCallId } from '@deepseek-ai/dsh-llm';
import { DONE, parseSse } from "../sse.js";
import { postSse } from "./http.js";
/**
 * Resolve the wire thinking fields for one request. `off` disables thinking
 * explicitly; any other effort enables it and rides as `reasoning_effort`;
 * an absent effort leaves the provider's own default alone.
 */
export function resolveThinking(effort) {
    if (effort === 'off')
        return { thinking: { type: 'disabled' } };
    if (effort !== undefined)
        return { thinking: { type: 'enabled' }, reasoning_effort: effort };
    return {};
}
/**
 * Map wire usage fields to the harness's DISJOINT counts: the endpoint folds
 * cache hits into `prompt_tokens`, so cached reads are subtracted out of
 * `inputTokens` and reported separately.
 */
export function mapUsage(usage) {
    const cacheRead = usage.prompt_tokens_details?.cached_tokens;
    const reasoning = usage.completion_tokens_details?.reasoning_tokens;
    const combined = usage.prompt_tokens + usage.completion_tokens;
    const hasExactTotal = Number.isSafeInteger(usage.prompt_tokens)
        && usage.prompt_tokens >= 0
        && Number.isSafeInteger(usage.completion_tokens)
        && usage.completion_tokens >= 0
        && Number.isSafeInteger(combined)
        && (usage.total_tokens === undefined || usage.total_tokens === combined);
    return {
        inputTokens: usage.prompt_tokens - (cacheRead ?? 0),
        outputTokens: usage.completion_tokens,
        ...hasExactTotal ? { totalTokens: combined } : {},
        ...cacheRead !== undefined ? { cacheReadTokens: cacheRead } : {},
        ...reasoning !== undefined ? { reasoningTokens: reasoning } : {},
    };
}
/**
 * Map the wire finish_reason vocabulary to the harness FinishReason.
 * Unrecognized values become `{kind: 'error'}` with the uppercased value as
 * `code`.
 */
export function mapFinishReason(reason) {
    switch (reason) {
        case 'stop': return { kind: 'stop' };
        case 'tool_calls': return { kind: 'tool-calls' };
        case 'length': return { kind: 'max-tokens' };
        default:
            return {
                kind: 'error',
                failure: { message: `model stopped: ${reason}`, code: reason.toUpperCase() },
            };
    }
}
function flattenText(blocks) {
    return blocks.filter(block => block.type === 'text').map(block => block.text).join('');
}
function assertTextOnly(blocks) {
    if (contentHasImage(blocks)) {
        throw new LlmError('The protocom-api chat-completions adapter does not support image content.', 'UNSUPPORTED_CONTENT');
    }
}
function wireMessage(message) {
    assertTextOnly(message.content);
    if (message.role === 'system')
        return { role: 'system', content: flattenText(message.content) };
    if (message.role === 'user') {
        const result = message.content.find((block) => block.type === 'tool-result');
        if (result !== undefined) {
            assertTextOnly(result.content);
            return { role: 'tool', tool_call_id: String(result.toolCallId), content: flattenText(result.content) };
        }
        return { role: 'user', content: flattenText(message.content) };
    }
    const text = flattenText(message.content);
    const reasoning = message.content
        .filter(block => block.type === 'reasoning')
        .map(block => block.text)
        .join('');
    const toolCalls = message.content
        .filter((block) => block.type === 'tool-call')
        .map(block => ({
        id: String(block.id),
        type: 'function',
        function: { name: block.name, arguments: block.arguments },
    }));
    return {
        role: 'assistant',
        content: text,
        ...reasoning.length > 0 ? { reasoning_content: reasoning } : {},
        ...toolCalls.length > 0 ? { tool_calls: toolCalls } : {},
    };
}
/** Serialize one request into the chat-completions wire body. */
export function serializeChatRequest(options, model) {
    const messages = [];
    if (options.system !== undefined)
        messages.push({ role: 'system', content: options.system });
    for (const message of options.messages)
        messages.push(wireMessage(message));
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
        ...resolveThinking(options.reasoningEffort),
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
/** `id` and `name` are identity: the wire sends each once, on the call's first delta. */
function acceptIdentity(current, incoming) {
    return typeof incoming === 'string' && incoming.length > 0 ? incoming : current;
}
/**
 * Consume SSE data payloads (ending with `[DONE]`) and yield StreamChunks.
 * `block-end`s, `usage`, and `finish` are deferred to the `[DONE]` sentinel
 * so no chunk follows `finish`. A `stop` (or absent) finish with no opened
 * blocks maps to an `EMPTY_RESPONSE` error finish instead of a successful
 * empty message.
 */
export async function* translateChatCompletions(payloads) {
    let nextIndex = 0;
    let textBlock;
    let reasoningBlock;
    const toolBlocks = new Map();
    const order = [];
    let pendingFinish;
    let pendingUsage;
    function open(kind) {
        const block = { index: nextIndex++, kind, text: '' };
        order.push(block);
        return block;
    }
    for await (const payload of payloads) {
        if (payload === DONE) {
            for (const block of order) {
                yield { type: 'block-end', index: block.index, block: closeBlock(block) };
            }
            if (pendingUsage)
                yield { type: 'usage', usage: pendingUsage };
            const reason = pendingFinish ?? { kind: 'stop' };
            yield {
                type: 'finish',
                reason: reason.kind === 'stop' && order.length === 0
                    ? {
                        kind: 'error',
                        failure: { message: 'model returned a completed response with no content', code: EMPTY_RESPONSE_CODE },
                    }
                    : reason,
            };
            return;
        }
        let chunk;
        try {
            chunk = JSON.parse(payload);
        }
        catch {
            throw new LlmError(`malformed SSE payload: ${payload.slice(0, 120)}`, 'MALFORMED_RESPONSE');
        }
        for (const choice of chunk.choices ?? []) {
            const delta = choice.delta;
            const reasoning = delta?.reasoning_content;
            if (typeof reasoning === 'string' && reasoning.length > 0) {
                if (!reasoningBlock) {
                    reasoningBlock = open('reasoning');
                    yield { type: 'block-start', index: reasoningBlock.index, blockType: 'reasoning' };
                }
                reasoningBlock.text += reasoning;
                yield { type: 'reasoning-delta', index: reasoningBlock.index, text: reasoning };
            }
            const content = delta?.content;
            if (typeof content === 'string' && content.length > 0) {
                if (!textBlock) {
                    textBlock = open('text');
                    yield { type: 'block-start', index: textBlock.index, blockType: 'text' };
                }
                textBlock.text += content;
                yield { type: 'text-delta', index: textBlock.index, text: content };
            }
            for (const call of delta?.tool_calls ?? []) {
                let block = toolBlocks.get(call.index);
                if (!block) {
                    block = open('tool-call');
                    toolBlocks.set(call.index, block);
                    yield { type: 'block-start', index: block.index, blockType: 'tool-call' };
                }
                block.callId = acceptIdentity(block.callId, call.id);
                block.name = acceptIdentity(block.name, call.function?.name);
                const fragment = call.function?.arguments ?? '';
                block.text += fragment;
                yield {
                    type: 'tool-call-delta',
                    index: block.index,
                    id: ToolCallId(block.callId ?? ''),
                    ...block.name !== undefined ? { name: block.name } : {},
                    argumentsDelta: fragment,
                };
            }
            // An empty-string finish_reason on an intermediate chunk is padding,
            // not a terminal state.
            if (typeof choice.finish_reason === 'string' && choice.finish_reason.length > 0) {
                pendingFinish = mapFinishReason(choice.finish_reason);
            }
        }
        // Usage rides the penultimate chunk, after the content deltas.
        if (chunk.usage)
            pendingUsage = mapUsage(chunk.usage);
    }
    // parseSse guarantees the [DONE] sentinel (or throws); reaching here means
    // the payload source violated that contract.
    throw new LlmError('SSE payload stream ended without [DONE]', 'STREAM_CLOSED');
}
/** Stream one chat-completions call as harness chunks. */
export async function* streamChatCompletions(connection, options, model) {
    const response = await postSse(connection, 'chat/completions', serializeChatRequest(options, model), options.signal);
    yield* translateChatCompletions(parseSse(response.body));
}
