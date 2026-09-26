// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { catalogFor } from '../src/commandcode-catalog.ts'
import type { CatalogCapabilities } from '../src/commandcode-catalog.ts'

const caps = (reasoning: boolean, vision: boolean): CatalogCapabilities =>
  ({ reasoning, vision } as CatalogCapabilities)

describe('capability join (R3)', () => {
  it('matches a dated snapshot id to the undated page entry', () => {
    // The listing carries claude-haiku-4-5-20251001 while the page carries
    // claude-haiku-4-5. Losing this join drops BOTH the reasoning and vision
    // flags, so the row renders as text-only and non-reasoning -- wrong twice,
    // and only for the model whose id happens to carry a date.
    const byId = new Map([['claude-haiku-4-5', caps(true, true)]])
    expect(catalogFor(byId, 'claude-haiku-4-5-20251001')?.vision).toBe(true)
  })

  it('still refuses a date suffix that matches nothing', () => {
    const byId = new Map([['claude-haiku-4-5', caps(true, true)]])
    expect(catalogFor(byId, 'claude-opus-9-20990101')).toBeUndefined()
  })

  it('prefers the exact id over any suffix or undated guess', () => {
    const byId = new Map([
      ['model-x', caps(false, false)],
      ['model-x-20250101', caps(true, true)],
    ])
    expect(catalogFor(byId, 'model-x-20250101')).toEqual(caps(true, true))
  })

  it('keeps the bidirectional tail match intact', () => {
    const byId = new Map([['stealth/space-bunny-alpha', caps(true, true)]])
    expect(catalogFor(byId, 'space-bunny-alpha')?.vision).toBe(true)
  })
})
