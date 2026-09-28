// @vitest-environment node
/**
 * ClinePass must never take menu membership from Cline's `/models` listing.
 *
 * That endpoint answers 200 without a credential and returns 458 rows from
 * Cline's pay-as-you-go catalog -- OpenRouter-style ids such as
 * `z-ai/glm-5.3` and `xai/grok-4.7` -- and not one `cline-pass/*` entry. Every
 * one of those rows would be unroutable on a ClinePass key, so the failure is
 * not a cosmetic one: it is 458 menu entries that each answer 401.
 *
 * The registry is the membership source instead, which is what
 * ProviderFamily.listingIsMembership exists to express.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProtocomAdapter } from '../src/adapter.ts'
import { resolveAdapterOptions } from '../src/config.ts'
import { CLINEPASS, CLINEPASS_PROVIDER, CLINEPASS_REGISTRY } from '../src/clinepass.ts'
import { stripVariantId } from '../src/context-variants.ts'

afterEach(() => { vi.unstubAllGlobals() })

/** The decoy: another product's catalog, served on this family's own /models. */
const DECOY = {
  object: 'list',
  data: [
    { id: 'z-ai/glm-5.3', object: 'model', created: 1, owned_by: 'z-ai' },
    { id: 'xai/grok-4.7', object: 'model', created: 1, owned_by: 'xai' },
    { id: 'anthropic/claude-sonnet-4-6', object: 'model', created: 1, owned_by: 'anthropic' },
  ],
}

function clineAdapter(config: Record<string, unknown> = {}): ProtocomAdapter {
  const options = resolveAdapterOptions({
    groups: { clinepass: { enabled: true, apiKey: 'CLINE_API_KEY' } },
    ...config,
  } as never, CLINEPASS)
  return new ProtocomAdapter({
    options: () => options,
    resolveApiKey: () => Promise.resolve('sk-cline-test'),
  })
}

describe('clinepass menu membership (R3)', () => {
  it('offers its own models and none of the decoy listing', async () => {
    // The listing answers successfully -- this is not a fallback path.
    const seen: string[] = []
    vi.stubGlobal('fetch', async (url: string | URL) => {
      seen.push(String(url))
      return new Response(JSON.stringify(DECOY), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const listed = await clineAdapter().listModels(CLINEPASS_PROVIDER)
    // Each model expands into one entry per context step it can honour, so the
    // menu is longer than the registry; the base ids are what must match.
    const ids = listed.map(model => model.id)
    const base = new Set(ids.map(stripVariantId))
    expect(base.size).toBe(CLINEPASS_REGISTRY.length)
    for (const entry of CLINEPASS_REGISTRY) expect(base.has(entry.id), entry.id).toBe(true)
    // Not one row from the other product's catalog.
    expect([...base].some(id => id.startsWith('z-ai/') || id.startsWith('xai/') || id.startsWith('anthropic/'))).toBe(false)
    // And the window it reports is Cline's own number, not a fallback. This is
    // the sharpest case in the registry: Cline serves it at 128,000 where the
    // third-party consensus says 1,000,000, so a menu built on that consensus
    // would promise eight times the window the gateway actually serves. Its
    // window is below every ladder rung, so it is offered exactly once, at its
    // own ceiling.
    const qwen = listed.filter(model => model.id.startsWith('cline-pass/qwen3.8-max'))
    expect(qwen).toHaveLength(1)
    expect(qwen[0]?.id).toBe('cline-pass/qwen3.8-max::ctx@128000')
    // The window rides the menu label, which is what a reader sees.
    expect(qwen[0]?.name).toBe('Qwen3.8 Max [125K]')
  })

  it('offers a retired model nowhere, even though it is in neither list', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(DECOY), { status: 200 }))
    const ids = (await clineAdapter().listModels(CLINEPASS_PROVIDER)).map(model => model.id)
    expect(ids).not.toContain('cline-pass/deepseek-v4-flash')
  })

  it('still serves the routed ids the registry declares', async () => {
    vi.stubGlobal('fetch', async (url: string | URL) => {
      if (String(url).includes('/chat/completions')) {
        return new Response('data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } })
      }
      return new Response(JSON.stringify(DECOY), { status: 200 });
    })
    const listed = await clineAdapter().listModels(CLINEPASS_PROVIDER)
    // Every offered id names this family's endpoint, so a turn can route.
    expect(listed.every(model => model.provider === CLINEPASS_PROVIDER)).toBe(true)
  })
})
