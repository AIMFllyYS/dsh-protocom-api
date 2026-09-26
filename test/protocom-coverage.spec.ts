// @vitest-environment node
/**
 * The aggregate registry against the listing it must cover.
 *
 * The endpoint listing is the membership source, so an unregistered id still
 * reaches the menu -- but sized by the family floor, with no Effort control,
 * and on the permissive vision default. That is the failure this guards: not a
 * missing row, a row whose metadata is quietly wrong.
 *
 * The fixture is an archived listing, so the check is deterministic rather than
 * dependent on the endpoint answering. Refused ids are excluded, because a
 * model that cannot serve a turn must have no entry: the menu would then offer
 * a row whose every use ends in an error, which is the defect this catalog
 * exists to remove.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { REFUSED_CHAT_MODEL_IDS, REGISTRY, servesChat } from '../src/model-registry.ts'

/** The aggregate listing as fetched on 2026-09-27. */
const LISTING: string[] = JSON.parse(
  readFileSync(new URL('../.agents/protocom-aggregate-ids-2026-09-27.json', import.meta.url), 'utf8'),
)

describe('aggregate registry coverage (R3)', () => {
  it('declares every servable model the aggregate listing carries', () => {
    const declared = new Set(REGISTRY.map(entry => entry.id))
    const refused = new Set(REFUSED_CHAT_MODEL_IDS as readonly string[])
    const missing = LISTING.filter(id => !declared.has(id) && !refused.has(id))
    expect(missing).toEqual([])
  })

  it('offers no id that the endpoint refuses to serve', () => {
    // An id may appear in BOTH lists, and that pairing is deliberate rather
    // than contradictory: the registry entry carries the model's facts so it
    // is ready the moment the endpoint starts serving it, while the refused
    // list is the gate that keeps it out of the menu until then. Removing the
    // id from that list is the single line that puts it back.
    //
    // What must hold is the outcome, not the absence of overlap: no refused id
    // may reach a menu, and `servesChat` is what enforces it.
    for (const id of REFUSED_CHAT_MODEL_IDS) {
      expect(servesChat(id)).toBe(false)
    }
  })
})
