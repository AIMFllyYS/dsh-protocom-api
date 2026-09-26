// @vitest-environment node
/**
 * The capability join against the REAL archived vendor payload.
 *
 * The unit tests above use a two-row fixture, which cannot show how much of
 * the live catalog actually joins. This one loads the archived scrape, so a
 * regression that silently drops most of the catalog fails here rather than
 * in production, where it would render as 'every model is text-only'.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { catalogFor, parseCatalogRows } from '../src/commandcode-catalog.ts'

/** The archived capability payload, as the page delivered it. */
function archivedCatalog(): unknown {
  return JSON.parse(readFileSync(new URL('../.agents/commandcode-catalog-2026-09-23.json', import.meta.url), 'utf8'))
}

describe('the archived Command Code catalog (R3)', () => {
  it('parses every row the vendor publishes', () => {
    const { byId, skipped } = parseCatalogRows(archivedCatalog())
    expect(byId.size).toBeGreaterThan(70)
    expect(skipped).toBe(0)
  })

  it('states a vision verdict for both outcomes, not just the positive one', () => {
    // A catalog that only ever said 'true' would make the text-only verdict
    // unreachable, and every model would appear vision-capable.
    const { byId } = parseCatalogRows(archivedCatalog())
    const verdicts = [...byId.values()].map(caps => caps.vision)
    expect(verdicts).toContain(true)
    expect(verdicts).toContain(false)
  })

  it('resolves a bare listing id against a vendor-prefixed page key', () => {
    // The listing uses bare ids for some models while the page prefixes them,
    // so a one-directional match would silently lose most of the catalog.
    const { byId } = parseCatalogRows(archivedCatalog())
    expect(catalogFor(byId, 'space-bunny-alpha')).toBeDefined()
  })
})
