/**
 * Decode an SSE byte stream into event `data` payloads, after
 * llm-deepseek's sse.ts: framing (chunk reassembly, UTF-8/CRLF/BOM, comments,
 * multi-`data:` joining) is `eventsource-parser`'s; this module keeps the
 * protocol policy — the literal `[DONE]` is yielded so the caller owns final
 * flushing, and whether EOF before it is truncation differs per protocol.
 *
 * @module dsh-protocom-api/sse
 */

import { EventSourceParserStream } from 'eventsource-parser/stream'
import { LlmError } from '@deepseek-ai/dsh-llm'

/** The terminal payload chat-completions endpoints send after the last chunk. */
export const DONE = '[DONE]'

async function* read(stream: ReadableStream<BufferSource>): AsyncGenerator<string> {
  const events = stream
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream())
  for await (const { data } of events) yield data
}

/**
 * Parse a chat-completions SSE stream into data payloads. Yields `[DONE]` as
 * the final value and returns; throws `LlmError('STREAM_CLOSED')` when the
 * stream ends without it (a truncated response cannot be trusted).
 */
export async function* parseSse(stream: ReadableStream<BufferSource>): AsyncGenerator<string> {
  for await (const data of read(stream)) {
    yield data
    if (data === DONE) return
  }
  throw new LlmError('SSE stream ended without [DONE]', 'STREAM_CLOSED')
}

/**
 * Parse an SSE stream whose protocol may end by closing (responses): yields
 * payloads through `[DONE]` or EOF, whichever comes first.
 */
export async function* parseSseUntilEof(stream: ReadableStream<BufferSource>): AsyncGenerator<string> {
  for await (const data of read(stream)) {
    yield data
    if (data === DONE) return
  }
}
