// @vitest-environment node
/**
 * Command Code's capability facts, end to end.
 *
 * Its endpoints listing publishes routing only -- no reasoning and no vision --
 * so every capability this menu shows comes from the vendor's capability page
 * joined onto the listing. These tests pin that join, because a silent miss
 * renders a vision model as text-only with nothing to indicate a problem.
 */
import { describe, expect, it } from 'vitest'
import { catalogFor, parseCatalogRows } from '../src/commandcode-catalog.ts'
import { COMMANDCODE } from '../src/commandcode.ts'
import { groupCatalog } from '../src/model-registry.ts'
import { acceptsImages } from '../src/model-registry.ts'

/** Two rows in the shape the vendor's capability payload publishes. */
const ROWS = [
  { id: 'deepseek/deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash', reasoning: true, vision: true, contextWindow: 1_000_000 },
  { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash', reasoning: true, vision: false, contextWindow: 1_000_000 },
]

describe('Command Code capabilities (R3)', () => {
  it('carries the vendor\'s vision verdict through the listing join', () => {
    const { byId } = parseCatalogRows(ROWS)
    const seen = catalogFor(byId, 'deepseek/deepseek-v4.1-flash')
    const blind = catalogFor(byId, 'deepseek/deepseek-v4-flash')
    // The page names the difference explicitly and the menu must honour it.
    expect(seen?.vision).toBe(true)
    expect(blind?.vision).toBe(false)
  })

  it('projects an upstream vision flag onto the row the menu renders', () => {
    const rows = groupCatalog('cc', [
      { id: 'deepseek/deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash', vision: true },
      { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash', vision: false },
    ] as never, { recommended: [], family: COMMANDCODE, registryFallback: false })
    const seen = rows.find(row => row.upstreamId === 'deepseek/deepseek-v4.1-flash')
    const blind = rows.find(row => row.upstreamId === 'deepseek/deepseek-v4-flash')
    expect(seen?.vision).toBe(true)
    expect(blind?.vision).toBe(false)
  })

  it('lets a deployment declaration outrank the endpoint', () => {
    // An operator who knows better must be able to correct the menu: the
    // per-model override is the surface for that.
    const declared = new Map([['deepseek/deepseek-v4.1-flash', false]])
    expect(acceptsImages('deepseek/deepseek-v4.1-flash', declared, COMMANDCODE.registry)).toBe(false)
  })

  it('ships no hand-maintained registry to go stale', () => {
    // Every fact comes from the live listing plus the vendor page, so a
    // hand-written copy of either could only drift.
    expect(COMMANDCODE.registry).toEqual([])
    expect(COMMANDCODE.capabilityCatalogUrl).toBeTruthy()
  })
})
