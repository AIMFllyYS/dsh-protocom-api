/**
 * The Command Code family and the endpoint-driven routing it depends on.
 *
 * The endpoint facts asserted here were confirmed by request against
 * `https://api.commandcode.ai/provider/v1/models` on 2026-09-23 (82 rows;
 * the snapshot is archived under `.agents/`). The shapes below are the ones
 * that listing actually returned, not the shapes its absence of documentation
 * might suggest.
 */
import { describe, expect, it } from 'vitest'
import {
  COMMANDCODE,
  COMMANDCODE_BASE_URL,
  COMMANDCODE_BASE_URL_ORIGIN,
  COMMANDCODE_CONTEXT_LADDER,
  COMMANDCODE_CREDENTIAL_REF,
  COMMANDCODE_PROVIDER,
} from '../src/commandcode.ts'
import {
  groupCatalog,
  protocolForEndpoints,
  servesDeclaredEndpoints,
} from '../src/model-registry.ts'
import { tierFromPlanId, tierRank, withinTier } from '../src/commandcode-catalog.ts'
import { resolveAdapterOptions } from '../src/config.ts'
import { parseModelsListing } from '../src/discovery.ts'

describe('Command Code family descriptor', () => {
  it('owns one route with a namespaced credential reference', () => {
    expect(COMMANDCODE.ns).toBe('commandcode')
    expect(COMMANDCODE.keys).toEqual(['cc'])
    expect(COMMANDCODE.providerOf('cc')).toBe(COMMANDCODE_PROVIDER)
    expect(COMMANDCODE.groupOf(COMMANDCODE_PROVIDER)).toBe('cc')
    expect(COMMANDCODE.groupOf('protocom-aggregate')).toBeUndefined()
    expect(COMMANDCODE.keyRef('cc')).toBe('COMMANDCODE_API_KEY')
  })

  it('pins its endpoint origin so a stored key cannot be redirected', () => {
    // The same origin pin every other family has: without it a single settings
    // write could point the bearer token at another host.
    expect(COMMANDCODE.baseURL).toBe(COMMANDCODE_BASE_URL)
    expect(COMMANDCODE.origin).toBe(COMMANDCODE_BASE_URL_ORIGIN)
    expect(new URL(COMMANDCODE.baseURL).origin).toBe('https://api.commandcode.ai')
    expect(() => resolveAdapterOptions({
      baseURL: 'https://evil.example',
      groups: { cc: { enabled: true, apiKey: 'COMMANDCODE_API_KEY' } },
    }, COMMANDCODE)).toThrowError(/allowCustomBaseURL/)
  })

  it('accepts only its own credential namespace', () => {
    expect(COMMANDCODE_CREDENTIAL_REF.test('COMMANDCODE_API_KEY')).toBe(true)
    expect(COMMANDCODE_CREDENTIAL_REF.test('COMMANDCODE_KEY_2')).toBe(true)
    expect(COMMANDCODE_CREDENTIAL_REF.test('PROTOCOM_AGGREGATE_API_KEY')).toBe(false)
    expect(COMMANDCODE_CREDENTIAL_REF.test('COMMANDCODE_lower')).toBe(false)
    expect(() => resolveAdapterOptions({
      groups: { cc: { enabled: true, apiKey: 'PROTOCOM_AGGREGATE_API_KEY' } },
    }, COMMANDCODE)).toThrowError(/must match/)
  })

  it('ships no hand-maintained registry, because the listing discloses everything', () => {
    // The endpoint publishes context length AND routing on every row, so a
    // hand-written copy could only ever go stale.
    expect(COMMANDCODE.registry).toEqual([])
    expect(COMMANDCODE.recommended).toEqual([])
  })

  it('ships no account surface until its response shape has been observed', () => {
    // /alpha/whoami exists (it answers 401 to a bogus bearer) but no key for
    // this service exists in this environment, so its response shape is
    // unverified and this plugin renders only confirmed fields.
    expect(COMMANDCODE.telemetryPath).toBeUndefined()
    expect(COMMANDCODE.telemetryKind).toBeUndefined()
  })

  it('offers a four-step context ladder from the nine lengths the listing used', () => {
    expect(COMMANDCODE_CONTEXT_LADDER).toEqual([200_000, 256_000, 400_000, 1_000_000])
    expect(COMMANDCODE.defaults['cc']?.contextLengths).toEqual(COMMANDCODE_CONTEXT_LADDER)
  })
})

describe('endpoint-driven protocol routing', () => {
  it('maps the three combinations the live listing actually uses', () => {
    // 65 of 82 rows declared both OpenAI surfaces.
    expect(protocolForEndpoints(['/chat/completions', '/responses'])).toBe('chat-completions')
    // 8 declared chat-completions alone.
    expect(protocolForEndpoints(['/chat/completions'])).toBe('chat-completions')
    // 9 (all Claude) declared /messages alone.
    expect(protocolForEndpoints(['/messages'])).toBe('messages')
  })

  it('prefers chat-completions when a model offers several OpenAI wires', () => {
    expect(protocolForEndpoints(['/responses', '/chat/completions'])).toBe('chat-completions')
    expect(protocolForEndpoints(['/messages', '/responses'])).toBe('responses')
  })

  it('reports no protocol for an empty or unknown declaration', () => {
    expect(protocolForEndpoints(undefined)).toBeUndefined()
    expect(protocolForEndpoints([])).toBeUndefined()
    expect(protocolForEndpoints(['/embeddings'])).toBeUndefined()
  })

  it('excludes a model served only on a wire this plugin cannot speak', () => {
    // Listing it would turn every call into a 400 that reads like a plugin bug
    // rather than a missing capability.
    expect(servesDeclaredEndpoints({ id: 'claude-sonnet-5', endpoints: ['/messages'] })).toBe(false)
    expect(servesDeclaredEndpoints({ id: 'gpt-6-astra', endpoints: ['/chat/completions', '/responses'] })).toBe(true)
  })

  it('keeps a model whose endpoints were never disclosed', () => {
    // Absence of the field is "the endpoint said nothing", not "unservable";
    // every other family relies on exactly this fallback.
    expect(servesDeclaredEndpoints({ id: 'mystery-model' })).toBe(true)
    expect(servesDeclaredEndpoints({ id: 'mystery-model', endpoints: [] })).toBe(true)
  })
})

describe('catalog filtering by declared endpoints', () => {
  const listing = [
    { id: 'gpt-6-astra', displayName: 'GPT-6 Astra', contextWindow: 1_050_000, endpoints: ['/chat/completions', '/responses'] },
    { id: 'deepseek-v4-flash-fast', contextWindow: 1_000_000, endpoints: ['/chat/completions'] },
    { id: 'claude-sonnet-5', contextWindow: 1_000_000, endpoints: ['/messages'] },
    { id: 'claude-opus-5', contextWindow: 1_000_000, endpoints: ['/messages'] },
  ]

  it('offers the servable models and hides the Anthropic-only ones', () => {
    const rows = groupCatalog('cc', listing, { family: COMMANDCODE, registryFallback: false })
    const ids = rows.flatMap(row => row.ids)
    expect(ids).toContain('gpt-6-astra')
    expect(ids).toContain('deepseek-v4-flash-fast')
    // Hiding is honesty: these answer 400 on every wire this plugin has.
    expect(ids).not.toContain('claude-sonnet-5')
    expect(ids).not.toContain('claude-opus-5')
  })

  it('keeps an undisclosed model, so an older gateway still works', () => {
    const rows = groupCatalog('cc', [{ id: 'legacy-model' }], { family: COMMANDCODE, registryFallback: false })
    expect(rows.flatMap(row => row.ids)).toContain('legacy-model')
  })
})

describe('subscription tier gating', () => {
  it('ranks the tiers cumulatively, weakest first', () => {
    expect(tierRank('Go')).toBe(0)
    expect(tierRank('goat')).toBe(1)
    expect(tierRank('Pro')).toBe(2)
    expect(tierRank('MAX')).toBe(3)
    expect(tierRank('Enterprise')).toBeUndefined()
    expect(tierRank(undefined)).toBeUndefined()
  })

  it('reads a tier out of a plan id like individual-goat', () => {
    expect(tierFromPlanId('individual-goat')).toBe('goat')
    expect(tierFromPlanId('individual-pro')).toBe('pro')
    expect(tierFromPlanId('individual-max')).toBe('max')
    expect(tierFromPlanId('some-go-plan')).toBe('go')
    expect(tierFromPlanId('unknown-plan')).toBeUndefined()
    expect(tierFromPlanId(undefined)).toBeUndefined()
    // A word-boundary match must not read a hypothetical goatx plan as goat.
    expect(tierFromPlanId('goatx-plan')).toBeUndefined()
  })

  it('includes a model at or below the account tier and excludes the rest', () => {
    // Verified live: an individual-goat account got 200 for Go- and GOAT-tier
    // models and 403 MODEL_NOT_IN_PLAN for Pro- and Max-tier ones.
    expect(withinTier('Go', 'goat')).toBe(true)
    expect(withinTier('GOAT', 'goat')).toBe(true)
    expect(withinTier('Pro', 'goat')).toBe(false)
    expect(withinTier('Max', 'goat')).toBe(false)
    expect(withinTier('go', 'pro')).toBe(true)
    expect(withinTier('goat', 'pro')).toBe(true)
    expect(withinTier('max', 'pro')).toBe(false)
  })

  it('keeps a model when either side is unknown', () => {
    // Hiding a usable model is worse than showing one that fails with a clear
    // provider message, and an unrecognized tier name is a catalog change.
    expect(withinTier(undefined, 'goat')).toBe(true)
    expect(withinTier('Pro', undefined)).toBe(true)
    expect(withinTier('Enterprise', 'goat')).toBe(true)
    expect(withinTier('Pro', 'enterprise')).toBe(true)
  })
})

describe('out-of-plan models stay out of the menu', () => {
  it('drops a model the account cannot call', () => {
    const rows = groupCatalog('cc', [
      { id: 'in-plan', endpoints: ['/chat/completions'] },
      { id: 'too-high', endpoints: ['/chat/completions'], outOfPlan: true },
    ], { family: COMMANDCODE, registryFallback: false })
    const ids = rows.flatMap(row => row.ids)
    expect(ids).toContain('in-plan')
    expect(ids).not.toContain('too-high')
  })

  it('keeps a model when the flag is absent', () => {
    const rows = groupCatalog('cc', [{ id: 'plain', endpoints: ['/chat/completions'] }], {
      family: COMMANDCODE,
      registryFallback: false,
    })
    expect(rows.flatMap(row => row.ids)).toContain('plain')
  })
})

describe('discovery reads the real listing shape', () => {
  it('parses supported_endpoints alongside the fields it already read', () => {
    // The exact row shape the live endpoint returned (2026-09-23).
    const [model] = parseModelsListing({
      object: 'list',
      data: [{
        id: 'claude-sonnet-5',
        object: 'model',
        created: 1_790_414_123,
        owned_by: 'command-code',
        name: 'Claude Sonnet 5',
        context_length: 1_000_000,
        supported_endpoints: ['/messages'],
      }],
    })
    expect(model).toMatchObject({
      id: 'claude-sonnet-5',
      displayName: 'Claude Sonnet 5',
      contextWindow: 1_000_000,
      endpoints: ['/messages'],
    })
  })

  it('accepts a camelCase spelling of the field', () => {
    const [model] = parseModelsListing({ data: [{ id: 'm', supportedEndpoints: ['/responses'] }] })
    expect(model?.endpoints).toEqual(['/responses'])
  })

  it('drops non-string endpoint entries rather than trusting the listing', () => {
    const [model] = parseModelsListing({ data: [{ id: 'm', supported_endpoints: ['/responses', 7, null, ''] }] })
    expect(model?.endpoints).toEqual(['/responses'])
  })

  it('omits the field when the endpoint declares nothing', () => {
    const [model] = parseModelsListing({ data: [{ id: 'm' }] })
    expect(model?.endpoints).toBeUndefined()
  })
})
