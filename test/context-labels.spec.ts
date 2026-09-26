// @vitest-environment node
/**
 * Context labels are unambiguous.
 *
 * A model can offer 1,000,000 and 1,048,576 as separate steps, and both used
 * to render as `1M`: two identical chips with different budgets behind them,
 * which is worse than either label being long.
 */
import { describe, expect, it } from 'vitest'
import { contextLabel } from '../src/model-registry.ts'

describe('context labels (R3)', () => {
  it('never labels two different budgets the same way', () => {
    const budgets = [204_800, 262_144, 409_600, 500_000, 1_000_000, 1_024_000, 1_048_576, 1_050_000, 200_000]
    const labels = budgets.map(contextLabel)
    // The collision this guards: 1M and 1M for two different windows.
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('keeps the familiar binary label', () => {
    expect(contextLabel(204_800)).toBe('200K')
    expect(contextLabel(262_144)).toBe('256K')
    expect(contextLabel(409_600)).toBe('400K')
    expect(contextLabel(1_048_576)).toBe('1M')
  })

  it('distinguishes the decimal million', () => {
    expect(contextLabel(1_000_000)).not.toBe(contextLabel(1_048_576))
  })
})
