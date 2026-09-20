/**
 * Decode an SSE byte stream into event `data` payloads, after
 * llm-deepseek's sse.ts: framing (chunk reassembly, UTF-8/CRLF/BOM, comments,
 * multi-`data:` joining) is `eventsource-parser`'s; this module keeps the
 * protocol policy — the literal `[DONE]` is yielded so the caller owns final
 * flushing, whether EOF before it is truncation differs per protocol, and one
 * event may not buffer without bound.
 *
 * @module dsh-protocom-api/sse
 */
/** The terminal payload chat-completions endpoints send after the last chunk. */
export declare const DONE = "[DONE]";
/**
 * Largest single event the parser will buffer, in characters. The library's
 * default is unbounded, so one upstream that opens a `data:` line and never
 * terminates it grows the buffer for as long as it keeps sending — the memory
 * half of F6 that no transport timeout covers. The bound is generous on
 * purpose: the responses protocol restates a tool call's *complete* arguments
 * in a single event, so a tight cap would reject large-but-legitimate calls.
 */
export declare const MAX_SSE_EVENT_CHARS: number;
/**
 * Parse a chat-completions SSE stream into data payloads. Yields `[DONE]` as
 * the final value and returns; throws `LlmError('STREAM_CLOSED')` when the
 * stream ends without it (a truncated response cannot be trusted).
 */
export declare function parseSse(stream: ReadableStream<BufferSource>): AsyncGenerator<string>;
/**
 * Parse an SSE stream whose protocol may end by closing (responses): yields
 * payloads through `[DONE]` or EOF, whichever comes first. Reaching EOF is not
 * itself a successful end: the responses translator decides whether a terminal
 * event arrived and refuses to treat a bare close as completion.
 */
export declare function parseSseUntilEof(stream: ReadableStream<BufferSource>): AsyncGenerator<string>;
