import { describe, expect, it } from 'vitest'
import {
  catalogEntry,
  CONTEXT_LADDER,
  contextChoicesFor,
  contextLabel,
  DEFAULT_RECOMMENDED,
  displayNameWithContext,
  FALLBACK_CONTEXT_WINDOW,
  identityKey,
  matchRegistry,
  REGISTRY,
} from '../src/model-registry.ts'

describe('model-registry', () => {
  it('matches known ids with their declared facts', () => {
    const prefixed = matchRegistry('deepseek/deepseek-v4.1-flash')
    const bare = matchRegistry('deepseek-v4.1-flash')
    expect(prefixed?.displayName).toBe('DeepSeek V4.1 Flash')
    expect(bare?.displayName).toBe('DeepSeek V4.1 Flash')
    expect(prefixed?.contextWindow).toBe(1_048_576)
    expect(prefixed?.reasoning).toEqual({ efforts: ['off', 'low', 'high', 'max'], defaultEffort: 'off' })
    // Verified against the endpoint: the flash model accepts image input.
    expect(prefixed?.vision).toBe(true)
  })

  it('pins kimi-k3 to its forced context window and reasoning vocabulary', () => {
    const entry = matchRegistry('kimi-k3')
    expect(entry?.displayName).toBe('Kimi K3')
    expect(entry?.contextWindow).toBe(262_144)
    expect(entry?.reasoning).toEqual({ efforts: ['low', 'high'], defaultEffort: 'high' })
    expect(entry?.vision).toBe(true)
  })

  it('advertises no reasoning vocabulary for a route that rejects the effort field', () => {
    // Verified against the endpoint: sending `reasoning_effort` to the
    // Moonshot route fails the whole request with HTTP 400 "invalid moonshotai
    // provider options", so a declared default effort would make the model
    // unusable rather than merely mute.
    const entry = matchRegistry('moonshotai/Kimi-K2.7-Code')
    expect(entry?.displayName).toBe('Kimi K2.7 Code')
    expect(entry?.reasoning).toBeUndefined()
    expect(entry?.vision).toBe(true)
  })

  it('recommends the models whose reasoning content actually streams', () => {
    // The shipped recommendation orders the menu; it removes nothing.
    expect(DEFAULT_RECOMMENDED).toEqual(['kimi-k3', 'glm-5.2', 'mimo-v2.5'])
    // The flash model hides its reasoning, so it is not recommended by default.
    expect(DEFAULT_RECOMMENDED).not.toContain('deepseek/deepseek-v4.1-flash')
  })

  it('resolves an alias to its model identity', () => {
    expect(identityKey('deepseek-v4.1-flash')).toBe('deepseek/deepseek-v4.1-flash')
    expect(identityKey('zai-org/GLM-5.2')).toBe('glm-5.2')
    // An unknown id is its own identity.
    expect(identityKey('meta/unknown')).toBe('meta/unknown')
  })

  it('keeps every advertised model catalogued rather than blocking any', () => {
    // A model the endpoint currently refuses stays described here: the picker
    // is how a deployment says what it wants, and a model that starts serving
    // again should simply start working.
    for (const id of [
      'google/gemini-3.7-flash',
      'tencent/hy4-preview',
      'inclusionai/ling-3.0-flash-sante:free',
      'Qwen/Qwen3.8-Flash',
    ]) {
      expect(matchRegistry(id)?.displayName, id).toBeTruthy()
    }
  })

  it('declares image input only where the endpoint accepted one', () => {
    const vision = REGISTRY.filter(entry => entry.vision === true).map(entry => entry.id)
    expect(vision).toContain('kimi-k3')
    expect(vision).toContain('gpt-5.6-sol')
    // Text-only by the vendor's own documentation.
    expect(matchRegistry('glm-5.3')?.vision).toBeUndefined()
    // The endpoint answered 404 "no endpoints found that support image input".
    expect(matchRegistry('mimo-v2.5-pro')?.vision).toBeUndefined()
  })

  it('never offers an off switch to a model that refuses one', () => {
    // GLM answers 400 "invalid thinking type, only be disabled when reasoning
    // effort is none", so an off entry there would be a broken menu choice.
    for (const id of ['glm-5.2', 'glm-5.3', 'z-ai/glm-5.3-flash', 'zai-org/GLM-5.2']) {
      expect(matchRegistry(id)?.reasoning?.efforts, id).not.toContain('off')
    }
  })

  it('matches the remaining named models', () => {
    expect(matchRegistry('z-ai/glm-5.3-flashx')?.displayName).toBe('GLM-5.3 FlashX')
    expect(matchRegistry('zai-org/GLM-5.2')?.displayName).toBe('GLM-5.2')
    expect(matchRegistry('Qwen/Qwen3.8-Omni-Flash')?.displayName).toBe('Qwen3.8 Omni Flash')
    expect(matchRegistry('gpt-5.6-sol')?.displayName).toBe('GPT-5.6 Sol')
    expect(matchRegistry('meituan/LongCat-2.0:free')?.displayName).toBe('LongCat 2.0')
    expect(matchRegistry('poolside/laguna-s-2.1-free')?.displayName).toBe('Laguna S 2.1 Free')
    expect(matchRegistry('meta/muse-spark-1.3-contributor')?.displayName).toBe('Muse Spark 1.3 Contributor')
    expect(matchRegistry('tencent/hy3-paid')?.contextWindow).toBe(262_144)
    expect(matchRegistry('poolside/some-model')).toBeUndefined()
  })

  it('gives every entry a distinct, self-resolving id', () => {
    const seen = new Set<string>()
    for (const entry of REGISTRY) {
      expect(seen.has(entry.id), `duplicate registry id ${entry.id}`).toBe(false)
      seen.add(entry.id)
      expect(matchRegistry(entry.id)).toBe(entry)
    }
  })

  it('never sizes a model below the fallback', () => {
    // The old registry left most entries on the fallback, so the menu read
    // 128K for models that publish far more.
    for (const entry of REGISTRY) {
      expect(entry.contextWindow, entry.id).toBeGreaterThanOrEqual(FALLBACK_CONTEXT_WINDOW)
      for (const length of entry.contextOptions ?? []) {
        expect(length, entry.id).toBeLessThanOrEqual(entry.contextWindow)
      }
    }
  })

  it('formats context labels as 200K/256K/400K/1M', () => {
    expect(contextLabel(204_800)).toBe('200K')
    expect(contextLabel(262_144)).toBe('256K')
    expect(contextLabel(409_600)).toBe('400K')
    expect(contextLabel(1_048_576)).toBe('1M')
    expect(displayNameWithContext('Kimi K3', 262_144)).toBe('Kimi K3 [256K]')
  })

  it('offers only the ladder steps a model can actually honour', () => {
    // 1M is the whole ladder; a 256K model can only honour its first two steps.
    expect(contextChoicesFor(1_048_576)).toEqual([204_800, 262_144, 409_600, 1_048_576])
    expect(contextChoicesFor(262_144)).toEqual([204_800, 262_144])
    // A window below the whole ladder still offers itself, so a model is never
    // left without a choice.
    expect(contextChoicesFor(131_072)).toEqual([131_072])
    expect(CONTEXT_LADDER[0]).toBe(204_800)
  })

  it('uses the endpoint display name for unknown ids when it adds information', () => {
    const beautified = catalogEntry({ id: 'meta/llama-x', displayName: 'Llama X' })
    expect(beautified.displayName).toBe('Llama X')
    expect(beautified.contextWindow).toBe(FALLBACK_CONTEXT_WINDOW)

    const raw = catalogEntry({ id: 'meta/llama-x', displayName: 'meta/llama-x' })
    expect(raw.displayName).toBe('meta/llama-x')

    const unnamed = catalogEntry({ id: 'inclusionai/x' })
    expect(unnamed.displayName).toBe('inclusionai/x')
  })

  it('projects registry entries over endpoint rows and honors disclosed reasoning', () => {
    const known = catalogEntry({ id: 'kimi-k3', displayName: 'whatever' })
    expect(known.displayName).toBe('Kimi K3')
    expect(known.contextWindow).toBe(262_144)
    expect(known.reasoning?.efforts).toEqual(['low', 'high'])
    expect(known.vision).toBe(true)

    // The endpoint discloses no reasoning metadata, so a row without one takes
    // the group vocabulary.
    const disclosed = catalogEntry({ id: 'grok-x', reasoningEfforts: ['low', 'high'] })
    expect(disclosed.reasoning).toEqual({ efforts: ['low', 'high'], defaultEffort: 'high' })

    // A registry entry wins over both the disclosed list and the group default.
    const group = catalogEntry({ id: 'gpt-5.6-sol' }, { efforts: ['minimal', 'low', 'medium'], defaultEffort: 'medium' })
    expect(group.displayName).toBe('GPT-5.6 Sol')
    expect(group.reasoning?.efforts).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
  })

  it('treats an unknown model as text-only and unranked', () => {
    const unknown = catalogEntry({ id: 'meta/llama-x' })
    expect(unknown.vision).toBe(false)
    expect(unknown.rank).toBe(Number.MAX_SAFE_INTEGER)
    expect(unknown.contextOptions).toBeUndefined()
  })

  it('never invents registry models the endpoint did not list', () => {
    // The catalog is a projection of the discovered rows, so a registry entry
    // without a matching upstream id simply never appears.
    const upstream = [{ id: 'unlisted-model' }]
    const catalog = upstream.map(row => catalogEntry(row))
    expect(catalog).toHaveLength(1)
    expect(catalog[0]?.displayName).toBe('unlisted-model')
  })
})
