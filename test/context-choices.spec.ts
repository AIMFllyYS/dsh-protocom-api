// @vitest-environment node
/**
 * A model window is always offered as one of its own steps.
 *
 * The ladder is binary (1,048,576) while providers publish decimal figures, so
 * an exact-membership test left 24 of 41 Go entries unable to reach their own
 * ceiling: a 1M model topped out at 400K, and every 500K model did too.
 */
import { describe, expect, it } from 'vitest'
import { contextChoicesFor, GO_REGISTRY, REGISTRY } from '../src/model-registry.ts'

const ALL_WINDOWS = [...REGISTRY, ...GO_REGISTRY].map(entry => entry.contextWindow)

describe('context choices (R3)', () => {
  it('offers every model its own window', () => {
    for (const window of ALL_WINDOWS) {
      expect(contextChoicesFor(window)).toContain(window)
    }
  })

  it('never offers a rung above the window', () => {
    for (const window of [100_000, 200_000, 262_144, 500_000, 1_000_000, 1_048_576, 1_050_000]) {
      const choices = contextChoicesFor(window)
      expect(choices.every(length => length <= window)).toBe(true)
    }
  })

  it('does not list a rung twice when the window is that rung', () => {
    const choices = contextChoicesFor(1_048_576)
    expect(new Set(choices).size).toBe(choices.length)
    expect(choices.filter(length => length === 1_048_576)).toHaveLength(1)
  })

  it('gives a decimal 1M model its ceiling rather than 400K', () => {
    expect(contextChoicesFor(1_000_000)).toContain(1_000_000)
    expect(contextChoicesFor(500_000)).toContain(500_000)
  })
})
