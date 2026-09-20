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
import type { GenerateOptions, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm';
import type { ProtocolConnection } from './http.ts';
/** Token accounting as the responses endpoint reports it. */
export interface WireResponseUsage {
    input_tokens: number;
    output_tokens: number;
    total_tokens?: number;
    input_tokens_details?: {
        cached_tokens?: number;
    };
    output_tokens_details?: {
        reasoning_tokens?: number;
    };
}
/**
 * Map wire usage fields to the harness's DISJOINT counts: cached input is
 * folded into `input_tokens`, so it is subtracted out and reported
 * separately.
 */
export declare function mapResponseUsage(usage: WireResponseUsage): TokenUsage;
/**
 * Serialize one request into the responses wire body. Any effort but `off`
 * maps to `reasoning.effort`; `off` and an absent effort both omit the field
 * (the protocol has no explicit disabled spelling).
 */
export declare function serializeResponsesRequest(options: GenerateOptions, model: string): Record<string, unknown>;
/**
 * Consume responses-protocol SSE payloads and yield StreamChunks. The
 * terminal state arrives as a `response.completed` / `response.failed` event
 * (or stream EOF); `block-end`s, `usage`, and `finish` are emitted only then,
 * so no chunk follows `finish`.
 */
export declare function translateResponses(payloads: AsyncIterable<string>): AsyncGenerator<StreamChunk>;
/** Stream one responses-protocol call as harness chunks. */
export declare function streamResponses(connection: ProtocolConnection, options: GenerateOptions, model: string): AsyncGenerator<StreamChunk>;
