import { describe, expect, it } from 'vitest'
import {
  catalogEntry,
  contextLabel,
  displayNameWithContext,
  FALLBACK_CONTEXT_WINDOW,
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
    expect(prefixed?.contextOptions).toEqual([204_800, 262_144, 409_600, 1_048_576])
    expect(prefixed?.reasoning).toEqual({ efforts: ['off', 'low', 'high', 'max'], defaultEffort: 'off' })
  })

  it('pins kimi-k3 to its forced context window and reasoning vocabulary', () => {
    const entry = matchRegistry('kimi-k3')
    expect(entry?.displayName).toBe('Kimi K3')
    expect(entry?.contextWindow).toBe(262_144)
    expect(entry?.contextOptions).toBeUndefined()
    expect(entry?.reasoning).toEqual({ efforts: ['low', 'high'], defaultEffort: 'high' })
  })

  it('matches the remaining named models', () => {
    expect(matchRegistry('z-ai/glm-5.3-flashx')?.displayName).toBe('GLM-5.3 FlashX')
    expect(matchRegistry('zai-org/GLM-5.2')?.displayName).toBe('GLM-5.2')
    expect(matchRegistry('Qwen/Qwen3.8-Omni-Flash')?.displayName).toBe('Qwen3.8 Omni Flash')
    expect(matchRegistry('gpt-5.6-sol')?.displayName).toBe('GPT-5.6 Sol')
    expect(matchRegistry('meituan/LongCat-2.0:free')?.displayName).toBe('LongCat 2.0')
    expect(matchRegistry('poolside/laguna-s-2.1-free')?.displayName).toBe('Laguna S 2.1 Free')
    expect(matchRegistry('inclusionai/ling-3.0-flash-sante:free')?.displayName).toBe('Ling 3.0 Flash Sante')
    expect(matchRegistry('meta/muse-spark-1.3-contributor')?.displayName).toBe('Muse Spark 1.3 Contributor')
    expect(matchRegistry('poolside/some-model')).toBeUndefined()
  })

  it('covers every listed model without duplicate or unreachable entries', () => {
    const seen = new Set<string>()
    for (const entry of REGISTRY) {
      const key = typeof entry.match === 'string' ? entry.match : entry.match.source
      expect(seen.has(key), `duplicate registry matcher ${key}`).toBe(false)
      seen.add(key)
      // A literal entry must resolve to itself, not be shadowed by an earlier
      // pattern that happens to match the same id.
      if (typeof entry.match === 'string') expect(matchRegistry(entry.match)).toBe(entry)
    }
  })

  it('formats context labels as 200K/256K/400K/1M', () => {
    expect(contextLabel(204_800)).toBe('200K')
    expect(contextLabel(262_144)).toBe('256K')
    expect(contextLabel(409_600)).toBe('400K')
    expect(contextLabel(1_048_576)).toBe('1M')
    expect(displayNameWithContext('Kimi K3', 262_144)).toBe('Kimi K3 [256K]')
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

    const disclosed = catalogEntry({ id: 'grok-x', reasoningEfforts: ['low', 'high'] })
    expect(disclosed.reasoning).toEqual({ efforts: ['low', 'high'], defaultEffort: 'high' })

    const group = catalogEntry({ id: 'gpt-5.6-sol' }, { efforts: ['minimal', 'low', 'medium'], defaultEffort: 'medium' })
    expect(group.displayName).toBe('GPT-5.6 Sol')
    expect(group.reasoning).toEqual({ efforts: ['minimal', 'low', 'medium'], defaultEffort: 'medium' })
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
