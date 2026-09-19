/**
 * Decode an SSE byte stream into event `data` payloads, after
 * llm-deepseek's sse.ts: framing (chunk reassembly, UTF-8/CRLF/BOM, comments,
 * multi-`data:` joining) is `eventsource-parser`'s; this module keeps the
 * protocol policy — the literal `[DONE]` is yielded so the caller owns final
 * flushing, and whether EOF before it is truncation differs per protocol.
 *
 * @module dsh-protocom-api/sse
 */
/** The terminal payload chat-completions endpoints send after the last chunk. */
export declare const DONE = "[DONE]";
/**
 * Parse a chat-completions SSE stream into data payloads. Yields `[DONE]` as
 * the final value and returns; throws `LlmError('STREAM_CLOSED')` when the
 * stream ends without it (a truncated response cannot be trusted).
 */
export declare function parseSse(stream: ReadableStream<BufferSource>): AsyncGenerator<string>;
/**
 * Parse an SSE stream whose protocol may end by closing (responses): yields
 * payloads through `[DONE]` or EOF, whichever comes first.
 */
export declare function parseSseUntilEof(stream: ReadableStream<BufferSource>): AsyncGenerator<string>;
