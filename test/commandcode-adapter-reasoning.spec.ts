// @vitest-environment node
/**
 * Command Code reasoning, end to end through the adapter.
 *
 * The unit tests prove the tier table is right. This one proves the adapter
 * actually USES it: the resolution chain has four sources and a model reaches
 * the menu with an Effort submenu only if the family hook is consulted in the
 * right order. A table that is correct but never read would pass every other
 * test in the suite.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProtocomAdapter } from '../src/adapter.ts'
import { resolveAdapterOptions } from '../src/config.ts'
import type { Config } from '../src/config.ts'

/** A Command Code config: one enabled group pointing at the live listing. */
const CC: Config = {
  commandcode: {
    groups: { cc: { enabled: true, apiKey: 'COMMANDCODE_API_KEY' } },
  },
} as never;

/** The listing rows the endpoint answers, in its real 7-field shape. */
const LISTING = {
  object: 'list',
  data: [
    { id: 'deepseek/deepseek-v4-pro', object: 'model', created: 1, owned_by: 'command-code', name: 'DeepSeek V4 Pro', context_length: 1_000_000, supported_endpoints: ['/chat/completions', '/responses'] },
    { id: 'moonshotai/Kimi-K2.6', object: 'model', created: 1, owned_by: 'command-code', name: 'Kimi K2.6', context_length: 262_144, supported_endpoints: ['/chat/completions'] },
  ],
}

function adapter(): ProtocomAdapter {
  const options = resolveAdapterOptions(CC.commandcode!, {
    ns: 'commandcode',
    sectionKey: 'commandcode',
    label: 'Command Code',
    baseURL: 'https://api.commandcode.ai/provider',
    origin: 'https://api.commandcode.ai',
    credentialRef: /^COMMANDCODE_[A-Z0-9_]+$/,
    keys: ['cc'],
    defaults: { cc: { displayName: 'Command Code', protocol: 'chat-completions', contextLengths: [200_000, 256_000, 400_000, 1_000_000] } },
    providerOf: () => 'commandcode',
    groupOf: p => (p === 'commandcode' ? 'cc' : undefined),
    keyRef: () => 'COMMANDCODE_API_KEY',
    recommended: [],
    registry: [],
    refused: [],
    reasoningFor: (id: string) => COMMANDCODE_REASONING(id),
  } as never)
  return new ProtocomAdapter({ options: () => options, resolveApiKey: async () => 'k' })
}

import { commandCodeReasoning as COMMANDCODE_REASONING } from '../src/commandcode-tiers.ts'

afterEach(() => { vi.unstubAllGlobals() })

describe('Command Code reasoning through the adapter (R3)', () => {
  it('gives a model its own tier, not a group-wide guess', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(LISTING), { status: 200, headers: { 'content-type': 'application/json' } })))
    const info = await adapter().resolveModel('commandcode', 'deepseek/deepseek-v4-pro')
    // The gateway's own CLI catalog lists high/max for this model. `off` and
    // `low` belong to other models and would be refused here.
    expect(info.reasoning?.efforts?.map(e => e.id)).toEqual(['high', 'max'])
  })

  it('omits the Effort list for a model the vendor accepts none for', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(LISTING), { status: 200, headers: { 'content-type': 'application/json' } })))
    const info = await adapter().resolveModel('commandcode', 'moonshotai/Kimi-K2.6')
    // No control is the honest rendering: the CLI sends no effort for it.
    expect(info.reasoning).toBeUndefined()
  })
})
