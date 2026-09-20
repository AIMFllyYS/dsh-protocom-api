import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureDir } from '../src/capture.ts'
import { postSse } from '../src/protocol/http.ts'

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'protocom-capture-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env['DSH_PROTOCOM_CAPTURE_DIR']
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('opt-in wire capture (diagnostics for the StepFun rejection)', () => {
  it('is off unless the switch names a directory', () => {
    expect(captureDir()).toBeUndefined()
    process.env['DSH_PROTOCOM_CAPTURE_DIR'] = '   '
    expect(captureDir()).toBeUndefined()
  })

  it('records the exact request and the upstream error body when enabled', async () => {
    const dir = tempDir()
    process.env['DSH_PROTOCOM_CAPTURE_DIR'] = dir
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"detail":"210 validation errors"}', { status: 400 })))
    await postSse(
      { baseURL: 'https://relay.test', apiKey: 'k' },
      'responses',
      { model: 'step-5', input: [{ content: 'hi' }] },
    ).catch(() => undefined)
    const files = readdirSync(dir)
    expect(files).toHaveLength(1)
    const record = JSON.parse(readFileSync(join(dir, files[0] as string), 'utf8')) as {
      url: string
      status: number
      request: { model: string; input: unknown[] }
      response: string
    }
    expect(record.url).toBe('https://relay.test/v1/responses')
    expect(record.status).toBe(400)
    expect(record.request.model).toBe('step-5')
    expect(record.request.input).toEqual([{ content: 'hi' }])
    expect(record.response).toContain('210 validation errors')
    // Headers are never captured, so no credential can appear in the file.
    expect(JSON.stringify(record)).not.toContain('Bearer')
  })
})
