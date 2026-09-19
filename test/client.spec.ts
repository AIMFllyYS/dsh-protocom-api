import { describe, expect, it } from 'vitest'
import { en, zh } from '../src/client/locale.ts'
import { STANDARD_VARIANT_CHOICES, toggleLength, variantChoicesFor } from '../src/client/variants.ts'

describe('client locale dictionaries', () => {
  it('zh covers exactly the en key set', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
  })
})

describe('variantChoicesFor', () => {
  it('offers the standard four lengths for an unlisted model', () => {
    expect(variantChoicesFor('some-unknown-model')).toEqual(STANDARD_VARIANT_CHOICES)
  })

  it('offers the registry lengths for a listed model', () => {
    expect(variantChoicesFor('deepseek/deepseek-v4.1-flash')).toEqual([204_800, 262_144, 409_600, 1_048_576])
  })
})

describe('toggleLength', () => {
  it('adds a length, keeping the list sorted and unique', () => {
    expect(toggleLength([1_048_576, 204_800], 409_600)).toEqual([204_800, 409_600, 1_048_576])
    expect(toggleLength([], 262_144)).toEqual([262_144])
  })

  it('removes a length already present', () => {
    expect(toggleLength([204_800, 409_600], 204_800)).toEqual([409_600])
  })
})
