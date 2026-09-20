import { describe, expect, it } from 'vitest'
import { DEFAULT_STREAM_IDLE_TIMEOUT_MS, resolveAdapterOptions, resolveBaseURL } from '../src/config.ts'

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
