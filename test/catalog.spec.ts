import { describe, expect, it } from 'vitest'
import { ProtocomAdapter } from '../src/adapter.ts'
import { resolveAdapterOptions } from '../src/config.ts'
import { matchRegistry, modelIdentities, REGISTRY, RETIRED_MODELS } from '../src/model-registry.ts'

/** An adapter whose credential always fails, so no listing is ever reachable. */
function offlineAdapter(config: Parameters<typeof resolveAdapterOptions>[0]): ProtocomAdapter {
  const options = resolveAdapterOptions(config)
  return new ProtocomAdapter({
    options: () => options,
    resolveApiKey: () => Promise.reject(new Error('no credential in this test')),
  })
}

const ENABLED = { groups: { aggregate: { enabled: true, apiKey: 'PROTOCOM_AGGREGATE_API_KEY' } } }

describe('catalog composition', () => {
  it('offers the whole registry when the endpoint listing is unreachable', async () => {
    // The listing only ever adds. A shrunk, degraded, or failed listing must
    // not be able to empty the model menu.
    const listed = await offlineAdapter(ENABLED).listModels('protocom-aggregate')
    expect(listed).toHaveLength(modelIdentities().length)
    for (const identity of modelIdentities()) {
      expect(listed.some(model => model.id === identity.ids[0]), identity.displayName).toBe(true)
    }
  })

  it('leads with the models whose reasoning content streams', async () => {
    const listed = await offlineAdapter(ENABLED).listModels('protocom-aggregate')
    expect(listed.slice(0, 3).map(model => model.id)).toEqual(['kimi-k3', 'glm-5.2', 'mimo-v2.5'])
  })

  it('removes exactly the hidden models from the menu', async () => {
    const hidden = ['kimi-k3', 'gpt-5.6-sol']
    const listed = await offlineAdapter({
      ...ENABLED,
      hiddenModels: hidden,
    }).listModels('protocom-aggregate')
    const ids = new Set(listed.map(model => model.id))
    for (const id of hidden) expect(ids.has(id), id).toBe(false)
    expect(listed).toHaveLength(modelIdentities().length - hidden.length)
  })

  it('hides a model whose alias alone was hidden', async () => {
    // Hiding writes every id of one identity, so no alias can survive as a
    // second row carrying the hidden model's name.
    const listed = await offlineAdapter({
      ...ENABLED,
      hiddenModels: ['deepseek/deepseek-v4.1-flash', 'deepseek-v4.1-flash'],
    }).listModels('protocom-aggregate')
    expect(listed.some(model => model.name.startsWith('DeepSeek V4.1 Flash'))).toBe(false)
  })

  it('lists one entry per model until context variants are asked for', async () => {
    const listed = await offlineAdapter(ENABLED).listModels('protocom-aggregate')
    const kimi = listed.filter(model => model.id === 'kimi-k3')
    expect(kimi.map(model => model.name)).toEqual(['Kimi K3 [256K]'])
    expect(kimi[0]?.inputModalities).toEqual(['text', 'image'])

    const glm = listed.filter(model => model.id === 'glm-5.3')
    expect(glm[0]?.inputModalities).toEqual(['text'])
  })

  it('expands one model into a context variant per selected length', async () => {
    const listed = await offlineAdapter({
      groups: {
        aggregate: {
          enabled: true,
          apiKey: 'PROTOCOM_AGGREGATE_API_KEY',
          contextLengths: [131_072, 262_144],
        },
      },
    }).listModels('protocom-aggregate')
    const kimi = listed.filter(model => model.id.startsWith('kimi-k3'))
    expect(kimi.map(model => model.name)).toEqual(['Kimi K3 [128K]', 'Kimi K3 [256K]'])
    expect(kimi.map(model => model.id)).toEqual(['kimi-k3::ctx@131072', 'kimi-k3::ctx@262144'])
  })

  it('shows one menu row per model identity, not per upstream id', async () => {
    // The endpoint serves the flash model under an organization-prefixed and a
    // bare id; two identical rows would be the same model twice.
    const listed = await offlineAdapter(ENABLED).listModels('protocom-aggregate')
    const flash = listed.filter(model => model.name.startsWith('DeepSeek V4.1 Flash'))
    expect(flash).toHaveLength(1)
    // The first registry id is the one dispatched.
    expect(flash[0]?.id).toBe('deepseek/deepseek-v4.1-flash')
    const names = listed.map(model => model.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('groups every alias of one model under a single identity', () => {
    const flash = modelIdentities().find(identity => identity.displayName === 'DeepSeek V4.1 Flash')
    expect(flash?.ids).toEqual(['deepseek/deepseek-v4.1-flash', 'deepseek-v4.1-flash'])
    expect(flash?.entry.contextWindow).toBe(1_048_576)
    expect(modelIdentities()).toHaveLength(new Set(REGISTRY.map(entry => entry.displayName)).size)
  })

  it('never offers a model the endpoint refuses to serve', async () => {
    // These stay in the endpoint's listing but answer 400 on the chat route.
    expect(RETIRED_MODELS.length).toBe(4)
    for (const id of RETIRED_MODELS) {
      expect(matchRegistry(id), id).toBeUndefined()
      const listed = await offlineAdapter(ENABLED).listModels('protocom-aggregate')
      expect(listed.some(model => model.id.includes(id)), id).toBe(false)
    }
  })

  it('refuses an empty or non-string hidden id', () => {
    expect(() => resolveAdapterOptions({ ...ENABLED, hiddenModels: [''] }))
      .toThrowError(/hiddenModels entries must be non-empty/)
    expect(() => resolveAdapterOptions({ ...ENABLED, hiddenModels: [7 as unknown as string] }))
      .toThrowError(/hiddenModels entries must be non-empty/)
  })
})
