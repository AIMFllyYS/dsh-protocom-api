/**
 * Opt-in wire capture for diagnosing an upstream rejection. Nothing is written
 * unless DSH_PROTOCOM_CAPTURE_DIR names a directory, so a normal deployment has
 * no extra I/O and no extra on-disk copies of anything.
 *
 * Request *bodies* and upstream *error* bodies are captured; headers are never
 * written, so no credential can reach the files. Bodies do contain the
 * conversation (including tool results), which is why the switch is explicit
 * and per-process rather than a stored setting.
 *
 * @module dsh-protocom-api/capture
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Largest body written; a capture that size is already unusable for diagnosis. */
const MAX_CAPTURE_BYTES = 8 * 1024 * 1024

/** One captured exchange. */
export interface WireCapture {
  /** Absolute upstream URL that answered. */
  url: string
  /** HTTP status of the rejecting reply. */
  status: number
  /** Serialized request body, verbatim. */
  request: string
  /** Upstream error body, verbatim. */
  response: string
}

/** The configured capture directory, or undefined when capture is off. */
export function captureDir(): string | undefined {
  const dir = process.env['DSH_PROTOCOM_CAPTURE_DIR']
  return dir !== undefined && dir.trim().length > 0 ? dir.trim() : undefined
}

/**
 * Write one exchange into the capture directory. Never throws: a diagnostic
 * must not turn a provider error into a different provider error.
 * @param capture - the exchange to record.
 */
export async function captureWire(capture: WireCapture): Promise<void> {
  const dir = captureDir()
  if (dir === undefined) return
  try {
    await mkdir(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const body = JSON.stringify({
      capturedAt: new Date().toISOString(),
      url: capture.url,
      status: capture.status,
      // The upstream's own message is what names the rejected field; keep it
      // whole rather than truncating the one thing worth reading.
      request: capture.request.length > MAX_CAPTURE_BYTES ? '<request body omitted: too large>' : JSON.parse(capture.request) as unknown,
      response: capture.response.slice(0, MAX_CAPTURE_BYTES),
    }, null, 2)
    await writeFile(join(dir, `${stamp}-${capture.status}.json`), body, 'utf8')
  } catch {
    // Diagnostics are best-effort; the caller still reports the real failure.
  }
}
