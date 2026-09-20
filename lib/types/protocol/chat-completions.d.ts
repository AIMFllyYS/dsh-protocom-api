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
import type { FinishReason, GenerateOptions, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm';
import type { ProtocolConnection, RequestImageUrls } from './http.ts';
export type { RequestImageUrls } from './http.ts';
/** Token accounting as the endpoint reports it. */
export interface WireUsage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens?: number;
    prompt_tokens_details?: {
        cached_tokens?: number;
    };
    completion_tokens_details?: {
        reasoning_tokens?: number;
    };
}
/**
 * Resolve the wire thinking fields for one request. `off` disables thinking
 * explicitly; any other effort enables it and rides as `reasoning_effort`;
 * an absent effort leaves the provider's own default alone.
 */
export declare function resolveThinking(effort: string | undefined): {
    thinking?: {
        type: 'enabled' | 'disabled';
    };
    reasoning_effort?: string;
};
/**
 * Map wire usage fields to the harness's DISJOINT counts: the endpoint folds
 * cache hits into `prompt_tokens`, so cached reads are subtracted out of
 * `inputTokens` and reported separately.
 */
export declare function mapUsage(usage: WireUsage): TokenUsage;
/**
 * Map the wire finish_reason vocabulary to the harness FinishReason.
 * Unrecognized values become `{kind: 'error'}` with the uppercased value as
 * `code`.
 */
export declare function mapFinishReason(reason: string): FinishReason;
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
export type AssistantTextReplay = 'keep' | 'drop' | 'user';
/** Serialize one request into the chat-completions wire body. */
export declare function serializeChatRequest(options: GenerateOptions, model: string, images?: RequestImageUrls, replayReasoning?: boolean, assistantTextReplay?: AssistantTextReplay): Record<string, unknown>;
/**
 * Consume SSE data payloads (ending with `[DONE]`) and yield StreamChunks.
 * `block-end`s, `usage`, and `finish` are deferred to the `[DONE]` sentinel
 * so no chunk follows `finish`. A `stop` (or absent) finish with no opened
 * blocks maps to an `EMPTY_RESPONSE` error finish instead of a successful
 * empty message.
 */
export declare function translateChatCompletions(payloads: AsyncIterable<string>): AsyncGenerator<StreamChunk>;
/** Stream one chat-completions call as harness chunks. */
export declare function streamChatCompletions(connection: ProtocolConnection, options: GenerateOptions, model: string, images?: RequestImageUrls, replayReasoning?: boolean, assistantTextReplay?: AssistantTextReplay): AsyncGenerator<StreamChunk>;
