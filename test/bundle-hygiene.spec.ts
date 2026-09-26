// @vitest-environment node
/**
 * No debug output in the shipped client.
 *
 * The browser half is served to the settings page as one bundle, so anything
 * it prints lands in an operator's console. A leftover `console.warn` of the
 * committed settings section does exactly that: the group apiKeys array is the
 * credential-REFERENCE list, so it discloses which credentials exist and where
 * they are pointed even though no key value rides along.
 *
 * This scans the SOURCE, so it fails at the point of the mistake rather than
 * after a build someone might forget to run.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Every .ts/.tsx under one directory, recursively. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return sources(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })
}

describe('client bundle hygiene (R3)', () => {
  it('prints nothing to the console from src/client', () => {
    const offenders = sources('src/client').filter(file => /console\.(log|warn|error|info|debug)\s*\(/.test(readFileSync(file, 'utf8')))
    // The Host half may log through ctx.logger; the browser half has no
    // logger and must stay silent, because its output is public to the page.
    expect(offenders).toEqual([])
  })

  it('carries no debug flag or scratch marker', () => {
    const markers = /__DBG__|__DEBUG__|__CTX_DEBUG__|TODO: remove|XXX/
    const offenders = sources('src').filter(file => markers.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })
})
