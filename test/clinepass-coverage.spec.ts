// @vitest-environment node
/**
 * The ClinePass registry against the list the endpoint publishes.
 *
 * ClinePass is the family whose `/models` listing is NOT its catalog: that
 * endpoint answers 200 without a credential and returns 458 rows from Cline's
 * pay-as-you-go product, with no `cline-pass/*` id among them. The subscription
 * list lives elsewhere -- `/api/v1/ai/cline/recommended-models`, also public
 * and keyless -- and it is what this fixture archives.
 *
 * Both directions matter, for the reasons the other families' guards record:
 * a registry entry the endpoint no longer serves is a menu row whose every use
 * fails, and a live id with no entry is a row with fallback metadata, which
 * presents a guess as a fact.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CLINEPASS_REFUSED_MODEL_IDS, CLINEPASS_REGISTRY } from '../src/clinepass.ts'

/** The `clinePass` array as fetched on 2026-09-28. */
const LIVE: string[] = JSON.parse(
  readFileSync(new URL('../.agents/clinepass-models-2026-09-28.json', import.meta.url), 'utf8'),
)

describe('clinepass registry coverage (R3)', () => {
  it('declares every model the subscription list carries', () => {
    const declared = new Set(CLINEPASS_REGISTRY.map(entry => entry.id))
    const refused = new Set(CLINEPASS_REFUSED_MODEL_IDS as readonly string[])
    expect(LIVE.filter(id => !declared.has(id) && !refused.has(id))).toEqual([])
  })

  it('offers no model the subscription list has dropped', () => {
    // The failure this catches: the endpoint retires a model and the menu keeps
    // offering it, so every use answers 400.
    const live = new Set(LIVE)
    const refused = new Set(CLINEPASS_REFUSED_MODEL_IDS as readonly string[])
    expect(CLINEPASS_REGISTRY.map(entry => entry.id).filter(id => !live.has(id) && !refused.has(id)))
      .toEqual([])
  })

  it('keeps every entry tagged as a membership source', () => {
    // The listing is not a membership source here, so an untagged entry would
    // never reach the menu at all -- the model would simply be missing, with
    // nothing to explain it.
    for (const entry of CLINEPASS_REGISTRY) {
      expect(entry.groups, entry.id).toEqual(['clinepass'])
    }
  })

  it('names the model Cline documents as no longer served', () => {
    // Retired on the vendor's own page, and absent from the live list.
    expect(CLINEPASS_REFUSED_MODEL_IDS).toContain('cline-pass/deepseek-v4-flash')
    const live = new Set(LIVE)
    for (const id of CLINEPASS_REFUSED_MODEL_IDS) expect(live.has(id), id).toBe(false)
  })
})
