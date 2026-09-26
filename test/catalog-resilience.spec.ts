// @vitest-environment node
/**
 * The catalog scan, on hostile input.
 *
 * The capability page is fetched from a hardcoded vendor URL with no
 * authentication, so its bytes are attacker-influenced by DNS hijack or a
 * compromised host. The scan used to restart at every marker, which made a
 * payload of unterminated arrays quadratic: a measured 1.9s at 128KiB, and the
 * 8MiB cap allowed roughly sixteen minutes of blocked event loop.
 *
 * The timing assertion is deliberately loose. It exists to catch a return to
 * quadratic behaviour -- which costs whole seconds at this size -- not to
 * measure the machine.
 */
import { describe, expect, it } from 'vitest'
import { modelsArrays } from '../src/commandcode-catalog.ts'

describe('catalog scan resilience (R3)', () => {
  it('stays linear when no array ever closes', () => {
    // 512KiB of the marker with no closing bracket anywhere. Quadratic
    // behaviour at this size is tens of seconds (measured 37s before the fix).
    const hostile = '"models":['.repeat(52_428)
    expect(hostile.length).toBeGreaterThan(500_000)
    const started = Date.now()
    const found = modelsArrays(hostile)
    const elapsed = Date.now() - started
    expect(found).toEqual([])
    expect(elapsed).toBeLessThan(2000)
  })

  it('still finds every balanced array, in largest-first order', () => {
    const payload = 'x"models":[{"id":"a"}] y "models":[{"id":"b"},{"id":"c"}] z'
    const found = modelsArrays(payload)
    expect(found).toHaveLength(2)
    // Largest first: the caller tries the biggest candidate before smaller ones.
    expect(found[0]).toContain('"c"')
    expect(found[1]).toContain('"a"')
  })

  it('ignores a marker inside a JSON string', () => {
    // The scanner tracks string state, so a quoted marker must not open a scan.
    const payload = '{"note":"see \\"models\\":[ for details","models":[{"id":"real"}]}'
    const found = modelsArrays(payload)
    expect(found).toHaveLength(1)
    expect(found[0]).toContain('real')
  })

  it('handles an escaped quote inside a string', () => {
    const payload = '"models":[{"id":"a\\"b"}]'
    const found = modelsArrays(payload)
    expect(found).toHaveLength(1)
  })
})
