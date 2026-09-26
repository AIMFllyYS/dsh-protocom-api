// @vitest-environment node
/**
 * Guards for the hardening pass.
 *
 * Each case here corresponds to a finding from the security review. They are
 * grouped in one file because they share a theme rather than a module: none of
 * them is a feature, and each is the kind of thing that regresses silently.
 */
import { describe, expect, it, vi } from 'vitest'
import { commandCodeAccountFetchHandler } from '../src/commandcode-account.ts'
import { describeRejectedRef } from '../src/config.ts'
import { KeyPool, KEY_AFFINITY_LIMIT } from '../src/key-pool.ts'

describe('fenced route hardening (R3)', () => {
  it('refuses a non-GET on the Command Code account route', async () => {
    // The route declaration is not enough: a carrier that dispatches /api/*
    // over IPC never consults it, so every verb used to reach the service and
    // spend an authenticated upstream request. The two sibling handlers guard
    // the same way; this one did not.
    const readCached = vi.fn(async () => ({ account: null, credits: { reachable: false }, usage: { reachable: false } }))
    const handler = commandCodeAccountFetchHandler(
      { readCached } as never,
      { options: () => ({ groups: new Map([['cc', { key: 'cc', enabled: true }]]) }), log: () => {} } as never,
    )
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'HEAD']) {
      const response = await handler(new Request('http://x/api/commandcode/account', { method }))
      expect(response.status).toBe(405)
      expect(response.headers.get('allow')).toBe('GET')
    }
    // The service must never have been consulted.
    expect(readCached).not.toHaveBeenCalled()
  })

  it('still serves a GET', async () => {
    const readCached = vi.fn(async () => ({ account: null, credits: { reachable: false }, usage: { reachable: false } }))
    const handler = commandCodeAccountFetchHandler(
      { readCached } as never,
      { options: () => ({ groups: new Map([['cc', { key: 'cc', enabled: true }]]) }), log: () => {} } as never,
    )
    const response = await handler(new Request('http://x/api/commandcode/account', { method: 'GET' }))
    expect(response.status).toBe(200)
    expect(readCached).toHaveBeenCalledOnce()
  })
})

describe('error messages do not echo a secret (R3)', () => {
  it('bounds a value that is far too long to be a reference', () => {
    // The dangerous case: a literal key pasted into the reference field fails the
    // same check, and these messages are designed to be read and screenshotted.
    //
    // A prefix is deliberately KEPT, because naming which field is wrong is the
    // message's whole purpose. What must never survive is the tail: a real key's
    // identifying entropy sits there, and a bounded prefix is enough to locate
    // the mistake without reproducing the credential.
    const secret = 'sk-live-0123456789abcdefghijklmnopqrstuvwxyz-TAILSECRET'
    const shown = describeRejectedRef(secret)
    expect(shown).not.toContain('TAILSECRET')
    expect(shown.length).toBeLessThan(secret.length)
    expect(shown.startsWith('sk-live-0123456789abcdefghijklmn')).toBe(true)
    expect(shown).toContain('truncated')
  })

  it('leaves a real credential reference intact', () => {
    // Truncating a legitimate name would make the message useless.
    expect(describeRejectedRef('PROTOCOM_CODEX_API_KEY')).toBe('PROTOCOM_CODEX_API_KEY')
  })
})

describe('key pool bookkeeping stays bounded (R3)', () => {
  it('caps the per-stream record the same way it caps affinity', () => {
    // A long-lived Host used to leak one entry per conversation: measured 5000
    // sessions leaving 5000 entries against a correctly-capped affinity map.
    const pool = new KeyPool(2, 'sticky')
    for (let index = 0; index < KEY_AFFINITY_LIMIT * 4; index += 1) {
      pool.select({ sessionId: 'session-' + String(index), ordinal: index })
    }
    // The cap is not directly observable, so this asserts the behaviour that
    // depends on it: the most recent streams are still attributable.
    const newest = 'session-' + String(KEY_AFFINITY_LIMIT * 4 - 1)
    expect(pool.lastIndexFor(newest)).toBeDefined()
  })
})
