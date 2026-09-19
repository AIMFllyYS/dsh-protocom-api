import { describe, expect, it } from 'vitest'
import { decodeVariantId, encodeVariantId, stripVariantId, variantLengths } from '../src/context-variants.ts'

describe('context-variants', () => {
  it('round-trips an encoded variant id', () => {
    const id = encodeVariantId('deepseek/deepseek-v4.1-flash', 262_144)
    expect(id).toBe('deepseek/deepseek-v4.1-flash::ctx@262144')
    expect(decodeVariantId(id)).toEqual({ upstreamId: 'deepseek/deepseek-v4.1-flash', contextWindow: 262_144 })
    expect(stripVariantId(id)).toBe('deepseek/deepseek-v4.1-flash')
  })

  it('treats an unsuffixed id as the upstream id itself', () => {
    expect(decodeVariantId('kimi-k3')).toEqual({ upstreamId: 'kimi-k3' })
    expect(stripVariantId('kimi-k3')).toBe('kimi-k3')
  })

  it('treats a malformed suffix as part of the upstream id', () => {
    expect(decodeVariantId('weird::ctx@abc')).toEqual({ upstreamId: 'weird::ctx@abc' })
    expect(decodeVariantId('weird::ctx@-5')).toEqual({ upstreamId: 'weird::ctx@-5' })
    expect(decodeVariantId('weird::ctx@')).toEqual({ upstreamId: 'weird::ctx@' })
  })

  it('keeps single-entry behavior when no variants are configured', () => {
    expect(variantLengths([204_800, 262_144], undefined)).toBeUndefined()
    expect(variantLengths([204_800], [])).toBeUndefined()
    expect(variantLengths(undefined, undefined)).toBeUndefined()
  })

  it('intersects configured lengths with registry options', () => {
    expect(variantLengths([204_800, 262_144, 1_048_576], [262_144, 1_048_576, 128_000]))
      .toEqual([262_144, 1_048_576])
  })

  it('accepts configured lengths directly for unregistered models', () => {
    expect(variantLengths(undefined, [400_000, 200_000, 200_000])).toEqual([200_000, 400_000])
  })

  it('degrades to the default entry when the intersection is empty', () => {
    expect(variantLengths([204_800], [128_000])).toBeUndefined()
  })
})
