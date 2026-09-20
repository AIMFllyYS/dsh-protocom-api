import { describe, expect, it } from 'vitest'
import { MAX_SSE_EVENT_CHARS, parseSse } from '../src/sse.ts'

function byteStream(parts: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part))
      controller.close()
    },
  })
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const out: string[] = []
  for await (const data of parseSse(stream)) out.push(data)
  return out
}

describe('SSE event buffer bound (P1-4)', () => {
  it('still parses ordinary events', async () => {
    expect(await drain(byteStream(['data: {"a":1}\n\n', 'data: [DONE]\n\n']))).toEqual(['{"a":1}', '[DONE]'])
  })

  it('terminates a single never-ended event past the buffer bound', async () => {
    // No newline ever arrives, so the parser's buffer is the only growth. The
    // library default is unbounded; the adapter must set the limit.
    const oversized = `data: ${'x'.repeat(MAX_SSE_EVENT_CHARS + 1024)}`
    await expect(drain(byteStream([oversized]))).rejects.toThrowError(/exceeded/)
  })

  it('also bounds an event fed in pieces that never terminates', async () => {
    const piece = 'x'.repeat(Math.ceil(MAX_SSE_EVENT_CHARS / 4) + 1024)
    await expect(drain(byteStream(['data: ', piece, piece, piece, piece])))
      .rejects.toThrowError(/exceeded/)
  })
})
