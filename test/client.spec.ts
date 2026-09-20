import { describe, expect, it } from 'vitest'
import { en, zh } from '../src/client/locale.ts'

describe('client locale dictionaries', () => {
  it('zh covers exactly the en key set', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
  })

  it('names every group and every control the section renders', () => {
    // The copy is part of the contract: a missing key renders `undefined` in
    // the panel, and the group titles are what the per-group model lists hang
    // off.
    for (const key of ['groupAggregate', 'groupCodex', 'groupStepfun', 'groupGrok'] as const) {
      expect(en[key].length).toBeGreaterThan(0)
      expect(zh[key].length).toBeGreaterThan(0)
    }
    for (const key of ['models', 'modelsHint', 'probeDetails', 'probeRefresh', 'visionTitle', 'visionOff'] as const) {
      expect(en[key].length).toBeGreaterThan(0)
      expect(zh[key].length).toBeGreaterThan(0)
    }
  })
})
