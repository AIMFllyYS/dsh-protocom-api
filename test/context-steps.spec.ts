// @vitest-environment node
/**
 * What context steps a model may be offered.
 *
 * Two families pull in opposite directions here, and the rule has to serve
 * both. Command Code publishes a length on every row, so a longer step is a
 * menu entry the model cannot honour -- a 256K model was offered 400K and 1M,
 * and the window reported to the harness followed the minted step. StepFun
 * publishes nothing, and its uncurated ids carry only a floor this plugin
 * assumed, so filtering there would hide steps those models do serve.
 */
import { describe, expect, it } from 'vitest'
import { contextStepsFor, groupCatalog } from '../src/model-registry.ts'
import { COMMANDCODE, COMMANDCODE_CONTEXT_LADDER } from '../src/commandcode.ts'
import { PROTOCOM } from '../src/family.ts'

const GO_LADDER = [204_800, 262_144, 409_600, 1_048_576]

describe('context steps (R3)', () => {
  it('never offers a step above a length the endpoint disclosed', () => {
    // The live Command Code row for this model says 256000.
    // The row carries the endpoint's own disclosure, as discovery projects it.
    const rows = groupCatalog('cc', [{
      id: 'moonshotai/Kimi-K2.7-Code',
      displayName: 'Kimi K2.7 Code',
      contextWindow: 256_000,
    }] as never, { recommended: [], family: COMMANDCODE, registryFallback: false })
    const row = rows[0]!
    expect(row.contextWindow).toBe(256_000)
    const steps = contextStepsFor(row, COMMANDCODE_CONTEXT_LADDER)
    expect(steps).toEqual([200_000, 256_000])
    // The 400K and 1M entries this used to mint are the defect.
    expect(steps.every(step => step <= row.contextWindow)).toBe(true)
  })

  it('keeps every step for a model nothing but our own floor bounds', () => {
    // StepFun publishes no length, so the group ladder is authoritative and
    // filtering by the assumed window would hide steps it can honour.
    const rows = groupCatalog('stepfun', [{ id: 'step-3.7-flash', name: 'step-3.7-flash' }] as never,
      { recommended: [], family: PROTOCOM, registryFallback: false })
    const row = rows[0]!
    expect(row.contextWindowDisclosed).toBeUndefined()
    expect(contextStepsFor(row, PROTOCOM.defaults['stepfun']?.contextLengths))
      .toEqual([204_800, 262_144, 409_600, 1_048_576])
  })

  it('never leaves a model without a step', () => {
    // A disclosed window below every ladder rung still yields its own window,
    // so the model is listed once rather than vanishing from the menu.
    const steps = contextStepsFor(
      { contextWindow: 100_000, contextWindowDisclosed: true },
      GO_LADDER,
    )
    expect(steps).toEqual([100_000])
  })

  it('prefers the registry options when the model is sized there', () => {
    const steps = contextStepsFor(
      { contextOptions: [262_144, 1_048_576], contextWindow: 1_048_576 },
      GO_LADDER,
    )
    expect(steps).toEqual([262_144, 1_048_576])
  })
})
