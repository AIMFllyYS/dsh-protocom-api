import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProtocomAdapter } from '../src/adapter.ts'
import { resolveAdapterOptions } from '../src/config.ts'
import { modelIdentities, REGISTRY } from '../src/model-registry.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

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

  it('still honours a group-wide contextLengths as the fallback', async () => {
    const listed = await offlineAdapter({
      groups: {
        aggregate: {
          enabled: true,
          apiKey: 'PROTOCOM_AGGREGATE_API_KEY',
          contextLengths: [204_800, 262_144],
        },
      },
    }).listModels('protocom-aggregate')
    expect(listed.filter(model => model.id.startsWith('kimi-k3')).map(model => model.id))
      .toEqual(['kimi-k3::ctx@204800', 'kimi-k3::ctx@262144'])
  })

  it('lists one entry per model until context variants are asked for', async () => {
    const listed = await offlineAdapter(ENABLED).listModels('protocom-aggregate')
    const kimi = listed.filter(model => model.id === 'kimi-k3')
    expect(kimi.map(model => model.name)).toEqual(['Kimi K3 [256K]'])
    expect(kimi[0]?.inputModalities).toEqual(['text', 'image'])

    const glm = listed.filter(model => model.id === 'glm-5.3')
    expect(glm[0]?.inputModalities).toEqual(['text'])
  })

  it('expands one model into a context variant per chosen length', async () => {
    // The per-model choice is what the settings picker writes.
    const listed = await offlineAdapter({
      ...ENABLED,
      modelContexts: { 'kimi-k3': [204_800, 262_144] },
    }).listModels('protocom-aggregate')
    const kimi = listed.filter(model => model.id.startsWith('kimi-k3'))
    expect(kimi.map(model => model.name)).toEqual(['Kimi K3 [200K]', 'Kimi K3 [256K]'])
    expect(kimi.map(model => model.id)).toEqual(['kimi-k3::ctx@204800', 'kimi-k3::ctx@262144'])
  })

  it('drops a chosen length the model cannot honour', async () => {
    // 1M on a 256K model would be a menu entry that cannot be served.
    const listed = await offlineAdapter({
      ...ENABLED,
      modelContexts: { 'kimi-k3': [262_144, 1_048_576] },
    }).listModels('protocom-aggregate')
    expect(listed.filter(model => model.id.startsWith('kimi-k3')).map(model => model.name))
      .toEqual(['Kimi K3 [256K]'])
  })

  it('applies a per-model choice made against an alias', async () => {
    const listed = await offlineAdapter({
      ...ENABLED,
      modelContexts: { 'zai-org/GLM-5.2': [204_800, 262_144] },
    }).listModels('protocom-aggregate')
    expect(listed.filter(model => model.id.startsWith('glm-5.2')).map(model => model.name))
      .toEqual(['GLM-5.2 [200K]', 'GLM-5.2 [256K]'])
  })

  it('refuses an empty or malformed per-model context choice', () => {
    expect(() => resolveAdapterOptions({ ...ENABLED, modelContexts: { 'kimi-k3': [] } }))
      .toThrowError(/must list at least one length/)
    expect(() => resolveAdapterOptions({ ...ENABLED, modelContexts: { 'kimi-k3': [0] } }))
      .toThrowError(/must be positive integers/)
    expect(() => resolveAdapterOptions({ ...ENABLED, modelContexts: { 'kimi-k3': [262_144, 262_144] } }))
      .toThrowError(/must not repeat/)
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

  it('leads with the configured recommendation and keeps the rest selectable', async () => {
    const listed = await offlineAdapter({
      ...ENABLED,
      recommendedModels: ['glm-5.3', 'kimi-k3'],
    }).listModels('protocom-aggregate')
    expect(listed.slice(0, 2).map(model => model.id)).toEqual(['glm-5.3', 'kimi-k3'])
    // Recommendation orders; it never hides.
    expect(listed).toHaveLength(modelIdentities().length)
  })

  it('collapses an alias used as the recommendation', async () => {
    // Recommending either spelling must order the one identity.
    const listed = await offlineAdapter({
      ...ENABLED,
      recommendedModels: ['zai-org/GLM-5.2'],
    }).listModels('protocom-aggregate')
    expect(listed[0]?.id).toBe('glm-5.2')
  })

  it('refuses an empty recommended id', () => {
    expect(() => resolveAdapterOptions({ ...ENABLED, recommendedModels: [''] }))
      .toThrowError(/recommendedModels entries must be non-empty/)
  })

  it('refuses an empty or non-string hidden id', () => {
    expect(() => resolveAdapterOptions({ ...ENABLED, hiddenModels: [''] }))
      .toThrowError(/hiddenModels entries must be non-empty/)
    expect(() => resolveAdapterOptions({ ...ENABLED, hiddenModels: [7 as unknown as string] }))
      .toThrowError(/hiddenModels entries must be non-empty/)
  })
})

const AGGREGATE = { groups: { aggregate: { enabled: true, apiKey: 'PROTOCOM_AGGREGATE_API_KEY' } } }
const STEPFUN = { groups: { stepfun: { enabled: true, apiKey: 'PROTOCOM_STEPFUN_API_KEY' } } }
const CODEX = { groups: { codex: { enabled: true, apiKey: 'PROTOCOM_CODEX_API_KEY' } } }

/** An adapter whose route lists exactly these models. */
function listingAdapter(
  config: Parameters<typeof resolveAdapterOptions>[0],
  models: readonly Record<string, unknown>[],
): ProtocomAdapter {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: models }), { status: 200 })))
  const options = resolveAdapterOptions(config)
  return new ProtocomAdapter({ options: () => options, resolveApiKey: async () => 'listing-key' })
}

describe('per-group catalog membership (issues 1a/1b)', () => {
  it('offers a route its own listed models and no foreign registry rows', async () => {
    const listed = await listingAdapter(AGGREGATE, [{ id: 'step-5' }]).listModels('protocom-aggregate')
    expect(listed.map(model => model.id)).toEqual(['step-5'])
    expect(listed.some(model => model.id.startsWith('kimi'))).toBe(false)
  })

  it('still offers a registry entry tagged for the group when the listing omits it', async () => {
    const listed = await listingAdapter(CODEX, [{ id: 'something-else' }]).listModels('protocom-codex')
    expect(listed.map(model => model.id).sort()).toEqual(['gpt-5.6-luna', 'gpt-5.6-sol', 'something-else'])
  })

  it('assumes the ladder floor, never 128K, for a model nothing sizes', async () => {
    const listed = await listingAdapter(AGGREGATE, [{ id: 'mystery-model' }]).listModels('protocom-aggregate')
    expect(listed).toHaveLength(1)
    expect(listed[0]?.name).toBe('mystery-model [200K]')
    expect(listed[0]?.name).not.toContain('128K')
  })

  it('ships StepFun its published four-step ladder', async () => {
    const listed = await listingAdapter(STEPFUN, [{ id: 'step-5', display_name: 'Step-5' }])
      .listModels('protocom-stepfun')
    expect(listed.map(model => model.id)).toEqual([
      'step-5::ctx@204800',
      'step-5::ctx@262144',
      'step-5::ctx@409600',
      'step-5::ctx@1048576',
    ])
    expect(listed.map(model => model.name)).toEqual([
      'Step-5 [200K]', 'Step-5 [256K]', 'Step-5 [400K]', 'Step-5 [1M]',
    ])
    expect(listed.every(model => !model.name.includes('128K'))).toBe(true)
  })

  it('lets a deployment override the shipped ladder', async () => {
    const listed = await listingAdapter({
      groups: {
        stepfun: { enabled: true, apiKey: 'PROTOCOM_STEPFUN_API_KEY', contextLengths: [262_144] },
      },
    }, [{ id: 'step-5', display_name: 'Step-5' }]).listModels('protocom-stepfun')
    expect(listed.map(model => model.id)).toEqual(['step-5::ctx@262144'])
  })

  it('offers the whole registry only when the listing carries no information', async () => {
    // The safety net survives: a missing listing must not empty the menu.
    const listed = await listingAdapter(AGGREGATE, []).listModels('protocom-aggregate')
    expect(listed).toHaveLength(modelIdentities().length)
  })
})
