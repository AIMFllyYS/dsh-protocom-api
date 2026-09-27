// @vitest-environment node
/**
 * Every model a group's menu can offer must be one the endpoint serves.
 *
 * A registry entry tagged for a group is a menu MEMBERSHIP SOURCE: it is
 * offered even when the live listing no longer carries it. That is what makes
 * the catalog survive an unreachable listing, and it is also how six Go models
 * became selectable rows whose every use answered 400 "Model is unavailable"
 * after the endpoint's catalog shrank from 43 ids to 36.
 *
 * An id the endpoint has stopped serving belongs in that group's refused list,
 * which keeps it out of the menu while leaving its metadata one line away from
 * returning. This asserts the outcome: tagged, but neither served nor refused,
 * is the defect.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GO_REFUSED_MODEL_IDS, GO_REGISTRY } from '../src/model-registry.ts'

/** The Go listing as fetched on 2026-09-27 (36 ids, stable across 3 fetches). */
const LIVE: string[] = JSON.parse(
  readFileSync(new URL('../.agents/opencode-go-ids-2026-09-27.json', import.meta.url), 'utf8'),
)

describe('go registry coverage (R3)', () => {
  it('offers no tagged model the endpoint has stopped serving', () => {
    const refused = new Set(GO_REFUSED_MODEL_IDS as readonly string[])
    const live = new Set(LIVE)
    const stranded = GO_REGISTRY
      .filter(entry => entry.groups?.includes('go') === true)
      .map(entry => entry.id)
      .filter(id => !live.has(id) && !refused.has(id))
    expect(stranded).toEqual([])
  })

  it('refuses no model the endpoint is actually serving', () => {
    // The inverse mistake: refusing a working model hides it from the menu.
    const live = new Set(LIVE)
    const wronglyRefused = GO_REFUSED_MODEL_IDS
      .filter(id => live.has(id))
      // minimax-m2.7 is listed yet answers 503 on both wire protocols, so a
      // listing alone is not proof of service -- it was verified by request.
      .filter(id => id !== 'minimax-m2.7')
    expect(wronglyRefused).toEqual([])
  })
})
