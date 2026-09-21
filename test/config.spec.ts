import { describe, expect, it } from 'vitest'
import { DEFAULT_STREAM_IDLE_TIMEOUT_MS, resolveAdapterOptions, resolveBaseURL } from '../src/config.ts'
import { GROUP_DEFAULTS } from '../src/groups.ts'

describe('shipped group defaults (issue 2a)', () => {
  it('sends StepFun through the responses protocol', () => {
    // Verified by request: this relay's chat-completions surface translates to
    // StepFun's Responses API and renders a replayed assistant message in a
    // shape the upstream refuses (HTTP 400), so every second turn and tool
    // round failed there. The same conversation on /v1/responses answers 200.
    expect(GROUP_DEFAULTS.stepfun.protocol).toBe('responses')
    const resolved = resolveAdapterOptions({})
    expect(resolved.groups.get('stepfun')?.protocol).toBe('responses')
    // The other three groups keep the protocol their models were verified on.
    expect(resolved.groups.get('aggregate')?.protocol).toBe('chat-completions')
    expect(resolved.groups.get('codex')?.protocol).toBe('responses')
    expect(resolved.groups.get('grok')?.protocol).toBe('chat-completions')
  })

  it('keeps reasoning out of a chat-completions replay unless a group opts in', () => {
    const byDefault = resolveAdapterOptions({})
    expect(byDefault.groups.get('aggregate')?.replayReasoning).toBe(false)
    const optedIn = resolveAdapterOptions({ groups: { aggregate: { replayReasoning: true } } })
    expect(optedIn.groups.get('aggregate')?.replayReasoning).toBe(true)
    // An explicit protocol still wins over the shipped one.
    expect(resolveAdapterOptions({ groups: { stepfun: { protocol: 'chat-completions' } } })
      .groups.get('stepfun')?.protocol).toBe('chat-completions')
  })

  it('keeps the spec-correct assistant text replay unless a route needs the compromise', () => {
    // 'keep' is what the protocol says; the two compromise modes exist only
    // for a chat surface that cannot carry an assistant text item at all.
    expect(resolveAdapterOptions({}).groups.get('aggregate')?.assistantTextReplay).toBe('keep')
    expect(resolveAdapterOptions({ groups: { aggregate: { assistantTextReplay: 'drop' } } })
      .groups.get('aggregate')?.assistantTextReplay).toBe('drop')
    expect(resolveAdapterOptions({ groups: { aggregate: { assistantTextReplay: 'user' } } })
      .groups.get('aggregate')?.assistantTextReplay).toBe('user')
  })
})

describe('baseURL validation (P1-1)', () => {
  it('refuses plain http on a non-loopback host', () => {
    expect(() => resolveAdapterOptions({ baseURL: 'http://192.168.1.10:8080' }))
      .toThrowError(/must use https/)
    expect(() => resolveAdapterOptions({ baseURL: 'http://relay.protocom.org' }))
      .toThrowError(/must use https/)
  })

  it('allows plain http for loopback hosts, including normalized spellings', () => {
    const custom = { allowCustomBaseURL: true } as const
    expect(resolveAdapterOptions({ baseURL: 'http://127.0.0.1:8080', ...custom }).baseURL).toBe('http://127.0.0.1:8080')
    expect(resolveAdapterOptions({ baseURL: 'http://localhost:3080', ...custom }).baseURL).toBe('http://localhost:3080')
    expect(resolveAdapterOptions({ baseURL: 'http://[::1]:3080', ...custom }).baseURL).toBe('http://[::1]:3080')
    // WHATWG rewrites these to 127.0.0.1, so a parsed judgement admits them.
    expect(resolveAdapterOptions({ baseURL: 'http://2130706433', ...custom }).baseURL).toBe('http://2130706433')
    expect(resolveAdapterOptions({ baseURL: 'http://0x7f000001', ...custom }).baseURL).toBe('http://0x7f000001')
  })

  it('refuses userinfo, query strings and fragments that disguise the host', () => {
    expect(() => resolveAdapterOptions({ baseURL: 'https://relay.protocom.org@evil.test' }))
      .toThrowError(/userinfo/)
    expect(() => resolveAdapterOptions({ baseURL: 'https://evil.test?x=relay.protocom.org' }))
      .toThrowError(/query string/)
    expect(() => resolveAdapterOptions({ baseURL: 'https://evil.test#relay.protocom.org' }))
      .toThrowError(/fragment/)
    expect(() => resolveAdapterOptions({ baseURL: 'relay.protocom.org' }))
      .toThrowError(/absolute http\(s\) URL/)
    expect(() => resolveAdapterOptions({ baseURL: 'ftp://relay.protocom.org' }))
      .toThrowError(/must use https/)
  })

  it('accepts a trusted https endpoint and normalizes suffix and case', () => {
    expect(resolveBaseURL('HTTPS://Relay.Protocom.org')).toBe('HTTPS://Relay.Protocom.org')
    expect(resolveAdapterOptions({ baseURL: 'https://relay.protocom.org/' }).baseURL).toBe('https://relay.protocom.org')
    expect(resolveAdapterOptions({ baseURL: 'https://relay.protocom.org/v1' }).baseURL).toBe('https://relay.protocom.org')
  })
})

describe('credential reference whitelist (P1-2)', () => {
  it('refuses a reference outside the PROTOCOM_ namespace', () => {
    expect(() => resolveAdapterOptions({ groups: { aggregate: { apiKey: 'AWS_SECRET_ACCESS_KEY' } } }))
      .toThrowError(/must match/)
    expect(() => resolveAdapterOptions({ groups: { aggregate: { apiKey: 'DEEPSEEK_API_KEY' } } }))
      .toThrowError(/must match/)
    expect(() => resolveAdapterOptions({ groups: { aggregate: { apiKey: 'PROTOCOM_aggregate_key' } } }))
      .toThrowError(/must match/)
  })

  it('accepts this plugin namespace', () => {
    const resolved = resolveAdapterOptions({ groups: { aggregate: { apiKey: 'PROTOCOM_AGGREGATE_API_KEY' } } })
    expect(resolved.groups.get('aggregate')?.apiKeyRef).toBe('PROTOCOM_AGGREGATE_API_KEY')
  })
})

describe('stream idle timeout bound (P1-4)', () => {
  it('defaults to the first-party watchdog interval', () => {
    expect(resolveAdapterOptions({}).streamIdleTimeoutMs).toBe(DEFAULT_STREAM_IDLE_TIMEOUT_MS)
    expect(DEFAULT_STREAM_IDLE_TIMEOUT_MS).toBe(300_000)
  })

  it('refuses a non-positive or non-finite interval', () => {
    expect(() => resolveAdapterOptions({ streamIdleTimeoutMs: 0 })).toThrowError(/streamIdleTimeoutMs/)
    expect(() => resolveAdapterOptions({ streamIdleTimeoutMs: Number.POSITIVE_INFINITY }))
      .toThrowError(/streamIdleTimeoutMs/)
  })
})

describe('stored credential is pinned to the shipped origin (F-2)', () => {
  it('accepts the shipped endpoint and its sub-paths', () => {
    expect(resolveAdapterOptions({}).baseURL).toBe('https://relay.protocom.org')
    expect(resolveAdapterOptions({ baseURL: 'https://relay.protocom.org' }).baseURL).toBe('https://relay.protocom.org')
    expect(resolveAdapterOptions({ baseURL: 'https://relay.protocom.org/v1' }).baseURL).toBe('https://relay.protocom.org')
  })

  it('refuses any other origin until the deployment confirms it', () => {
    // The audit's H1 payload: one settings write, plain http loopback listener.
    expect(() => resolveAdapterOptions({ baseURL: 'http://127.0.0.1:19999' })).toThrowError(/allowCustomBaseURL/)
    expect(() => resolveAdapterOptions({ baseURL: 'https://evil.example' })).toThrowError(/allowCustomBaseURL/)
    expect(() => resolveAdapterOptions({ baseURL: 'https://relay.protocom.org.evil.example' }))
      .toThrowError(/allowCustomBaseURL/)
    expect(() => resolveAdapterOptions({ baseURL: 'https://evil.example', allowCustomBaseURL: false }))
      .toThrowError(/allowCustomBaseURL/)
  })

  it('admits a confirmed custom endpoint', () => {
    expect(resolveAdapterOptions({ baseURL: 'https://evil.example', allowCustomBaseURL: true }).baseURL)
      .toBe('https://evil.example')
    expect(resolveAdapterOptions({ baseURL: 'http://127.0.0.1:19999', allowCustomBaseURL: true }).baseURL)
      .toBe('http://127.0.0.1:19999')
  })
})

describe('StepFun reasoning vocabulary', () => {
  // The relay accepts reasoning.effort on every StepFun model that serves, and
  // the value visibly changes the thinking budget (verified by request). The
  // group has to declare it, or the picker offers no Effort submenu at all and
  // the thinking budget stays uncontrollable.
  it('declares the four verified efforts and a default for the stepfun group', () => {
    expect(GROUP_DEFAULTS.stepfun.reasoning).toEqual({
      efforts: ['minimal', 'low', 'medium', 'high'],
      defaultEffort: 'medium',
    })
  })
})
