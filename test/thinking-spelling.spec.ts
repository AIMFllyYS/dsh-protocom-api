// @vitest-environment node
/**
 * The disabling word differs by family, and getting it wrong is a 400.
 *
 * Verified live 2026-09-27 on both endpoints:
 *   Protocom relay   reasoning_effort=off  -> 400, names its enum; none -> 200
 *   OpenCode Go      reasoning_effort=off  -> 200; none -> 400
 *
 * They are opposite, so the two registries must not share one vocabulary. A
 * single family-wide list would work on one gateway and fail on the other.
 */
import { describe, expect, it } from 'vitest'
import { GO_REGISTRY, REGISTRY } from '../src/model-registry.ts'

const effortsOf = (registry: readonly { id: string; reasoning?: { efforts: readonly string[] } }[], id: string) =>
  registry.find(entry => entry.id === id)?.reasoning?.efforts ?? []

describe('disabling-word conventions (R3)', () => {
  it('spells it none on the Protocom relay', () => {
    for (const id of ['deepseek/deepseek-v4.1-flash', 'deepseek-v4.1-flash', 'mimo-v2.5', 'mimo-v2.5-pro']) {
      const efforts = effortsOf(REGISTRY, id)
      expect(efforts).toContain('none')
      // The relay names its enum in a 400 when handed `off`.
      expect(efforts).not.toContain('off')
    }
  })

  it('spells it off on the OpenCode Go gateway', () => {
    const efforts = effortsOf(GO_REGISTRY, 'kimi-k2.7-code')
    expect(efforts).toContain('off')
    // Go refuses `none` on this route.
    expect(efforts).not.toContain('none')
  })
})
