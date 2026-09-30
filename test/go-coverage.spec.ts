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

/**
 * Ids the listing still advertises that were proven unservable by request.
 *
 * A listing is an advertisement, not a promise. These appear in it and answer
 * 503 or 410 when actually called, so refusing them is correct and the inverse
 * check below -- which exists to catch a WORKING model being hidden -- must not
 * flag them. Each entry records how it failed.
 */
const LISTED_BUT_DEAD: readonly string[] = [
  'minimax-m2.7', // 503 on both wire protocols.
  'kimi-k2.6', // 410 Gone, re-probed 2026-10-01.
]

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
      .filter(id => !LISTED_BUT_DEAD.includes(id))
    expect(wronglyRefused).toEqual([])
  })
})
