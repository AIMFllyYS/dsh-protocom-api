// @vitest-environment node
/**
 * The OpenCode Go menu entries the adapter actually mints.
 *
 * The unit tests cover the budget matching; this covers the whole path, because
 * the defect was invisible at the unit level: every model was offered a set of
 * steps, it was simply the wrong set, and only the minted entry ids show it.
 *
 * OpenCode Go publishes no context metadata, so models are sized by the
 * registry. Most declare a DECIMAL million (1,000,000) while the shipped ladder
 * is BINARY (1,048,576), and the intersection matched by exact integer -- so the
 * 1M entry was never minted and the models were capped at 400K.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProtocomAdapter } from '../src/adapter.ts'
import { resolveAdapterOptions } from '../src/config.ts'
import { GO_PROVIDER, OPENCODE_GO } from '../src/family.ts'

afterEach(() => { vi.unstubAllGlobals() })

/** A Go adapter with no reachable listing, so the registry supplies the rows. */
function goAdapter(config: Record<string, unknown> = {}): ProtocomAdapter {
  const options = resolveAdapterOptions({
    groups: { go: { enabled: true, apiKey: 'OPENCODE_GO_API_KEY' } },
    ...config,
  } as never, OPENCODE_GO)
  return new ProtocomAdapter({
    options: () => options,
    resolveApiKey: () => Promise.reject(new Error('no credential in this test')),
  })
}

describe('opencode go context entries (R3)', () => {
  it('mints the 1M entry for a model that declares a decimal million', async () => {
    // The reported defect. glm-5.3 declares 1,000,000 and used to top out at
    // 409600 because 1,000,000 never equals the 1,048,576 rung.
    const listed = await goAdapter().listModels(GO_PROVIDER)
    const ids = listed.map(model => model.id)
    expect(ids).toContain('glm-5.3::ctx@1000000')
    // And the model's own figure, never the rung it matched.
    expect(ids).not.toContain('glm-5.3::ctx@1048576')
  })

  it('mints the same entries for a binary million', async () => {
    // Kimi K3 declares 1,048,576, which matched the rung exactly all along.
    // It is the control: this model was never affected, which is exactly why
    // the failure looked like it depended on the model rather than the code.
    const ids = (await goAdapter().listModels(GO_PROVIDER)).map(model => model.id)
    expect(ids).toContain('kimi-k3::ctx@1048576')
  })

  it('mints a window that falls between two rungs', async () => {
    // grok-4.7 declares 500,000: no rung names it, but the ladder's ceiling is
    // 1M, so its capacity is within what the deployment allows.
    const ids = (await goAdapter().listModels(GO_PROVIDER)).map(model => model.id)
    expect(ids).toContain('grok-4.7::ctx@500000')
  })

  it('honours a per-model choice that deliberately caps the model', async () => {
    // Capping is a real choice. A stored choice still replaces the ladder, so
    // the 1M entry is absent by request rather than by accident.
    const ids = (await goAdapter({ modelContexts: { 'glm-5.3': [262_144, 409_600] } })
      .listModels(GO_PROVIDER)).map(model => model.id)
    expect(ids).toContain('glm-5.3::ctx@262144')
    expect(ids).toContain('glm-5.3::ctx@409600')
    expect(ids).not.toContain('glm-5.3::ctx@1000000')
  })

  it('honours a group ladder that deliberately stops lower', async () => {
    const ids = (await goAdapter({ groups: { go: { enabled: true, apiKey: 'OPENCODE_GO_API_KEY', contextLengths: [262_144] } } })
      .listModels(GO_PROVIDER)).map(model => model.id)
    expect(ids).toContain('glm-5.3::ctx@262144')
    expect(ids).not.toContain('glm-5.3::ctx@1000000')
    expect(ids).not.toContain('grok-4.7::ctx@500000')
    // A model whose own window is BELOW the cap keeps its window: the ladder
    // caps what may be offered, it does not raise a small model's ceiling.
    expect(ids).toContain('deepseek-flash::ctx@204800')
  })
})
