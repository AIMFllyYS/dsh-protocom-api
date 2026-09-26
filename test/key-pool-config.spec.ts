/**
 * The multi-key settings surface: how a group's configured keys resolve into a
 * pool, and every bound that keeps a malformed document from becoming a very
 * large fan-out of credential resolutions.
 */
import { describe, expect, it } from 'vitest'
import { resolveAdapterOptions } from '../src/config.ts'
import { MAX_KEYS_PER_GROUP } from '../src/key-pool.ts'

/** Resolve one group's credential configuration. */
function group(group: Record<string, unknown>) {
  const resolved = resolveAdapterOptions({ groups: { aggregate: group } } as never)
  return resolved.groups.get('aggregate') as {
    apiKeyRef?: string
    apiKeyRefs: readonly string[]
    keyPolicy: string
  }
}

describe('single-key configuration (unchanged behavior)', () => {
  it('resolves one key with the historical field', () => {
    const resolved = group({ enabled: true, apiKey: 'PROTOCOM_AGGREGATE_API_KEY' })
    expect(resolved.apiKeyRefs).toEqual(['PROTOCOM_AGGREGATE_API_KEY'])
    expect(resolved.apiKeyRef).toBe('PROTOCOM_AGGREGATE_API_KEY')
    expect(resolved.keyPolicy).toBe('sticky')
  })

  it('has an empty pool when no key is configured', () => {
    expect(group({ enabled: true }).apiKeyRefs).toEqual([])
  })
})

describe('multi-key pools', () => {
  it('puts apiKey first, then every apiKeys entry', () => {
    const resolved = group({
      enabled: true,
      apiKey: 'PROTOCOM_A_KEY',
      apiKeys: ['PROTOCOM_B_KEY', 'PROTOCOM_C_KEY'],
    })
    expect(resolved.apiKeyRefs).toEqual(['PROTOCOM_A_KEY', 'PROTOCOM_B_KEY', 'PROTOCOM_C_KEY'])
    // apiKeyRef stays the primary key so every single-key consumer still works.
    expect(resolved.apiKeyRef).toBe('PROTOCOM_A_KEY')
  })

  it('accepts a pool with no primary key', () => {
    const resolved = group({ enabled: true, apiKeys: ['PROTOCOM_A_KEY', 'PROTOCOM_B_KEY'] })
    expect(resolved.apiKeyRefs).toEqual(['PROTOCOM_A_KEY', 'PROTOCOM_B_KEY'])
    expect(resolved.apiKeyRef).toBe('PROTOCOM_A_KEY')
  })

  it('carries the configured policy', () => {
    expect(group({ keyPolicy: 'round-robin' }).keyPolicy).toBe('round-robin')
    expect(group({ keyPolicy: 'sticky' }).keyPolicy).toBe('sticky')
  })

  it('accepts a pool at the size bound', () => {
    const keys = Array.from({ length: MAX_KEYS_PER_GROUP }, (_, index) => `PROTOCOM_K${index}_API_KEY`)
    expect(group({ apiKeys: keys }).apiKeyRefs).toHaveLength(MAX_KEYS_PER_GROUP)
  })
})

describe('pool validation', () => {
  it('refuses a foreign namespace in any entry, not just the first', () => {
    // The reference is what the environment fallback reads, so an open shape
    // would reach any variable the launching process holds.
    expect(() => group({ apiKey: 'PROTOCOM_A_KEY', apiKeys: ['OPENCODE_GO_API_KEY'] }))
      .toThrowError(/"OPENCODE_GO_API_KEY" must match/)
  })

  it('refuses a repeated reference', () => {
    // A repeat would hand out one key twice and make cooldown bookkeeping
    // ambiguous — the same index would be both parked and serving.
    expect(() => group({ apiKey: 'PROTOCOM_A_KEY', apiKeys: ['PROTOCOM_A_KEY'] }))
      .toThrowError(/repeats the credential reference/)
  })

  it('refuses an empty entry rather than silently dropping it', () => {
    expect(() => group({ apiKeys: [''] })).toThrowError(/non-empty credential references/)
  })

  it('refuses a pool past the size bound', () => {
    const keys = Array.from({ length: MAX_KEYS_PER_GROUP + 2 }, (_, index) => `PROTOCOM_K${index}_API_KEY`)
    expect(() => group({ apiKeys: keys })).toThrowError(/more than 16 API keys/)
  })

  it('refuses an unknown key policy through the schema', () => {
    expect(() => group({ apiKeys: ['PROTOCOM_A_KEY'], keyPolicy: 'random' }))
      .toThrowError(/keyPolicy/)
  })
})
