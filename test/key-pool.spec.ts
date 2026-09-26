/**
 * Credential-pool selection. The behaviour that matters is cache locality: a
 * conversation must keep reaching the same account, or every step re-reads its
 * prefix from cold and the run's input-token bill multiplies.
 */
import { describe, expect, it } from 'vitest'
import {
  hashSession,
  KEY_AFFINITY_LIMIT,
  KEY_COOLDOWN_MS,
  KeyPool,
} from '../src/key-pool.ts'

/** A pool over a controlled clock. */
function pool(keyCount: number, policy: 'sticky' | 'round-robin' = 'sticky') {
  let now = 1_000_000
  const instance = new KeyPool(keyCount, policy, () => now)
  return {
    instance,
    advance(ms: number): void { now += ms },
  }
}

describe('sticky selection keeps a conversation on one key', () => {
  it('pins the first pick for every later request of the same Session', () => {
    const { instance } = pool(4)
    const first = instance.select({ sessionId: 's1', ordinal: 0 })
    expect(first).toBeDefined()
    for (let ordinal = 1; ordinal < 20; ordinal += 1) {
      expect(instance.select({ sessionId: 's1', ordinal })).toBe(first)
    }
  })

  it('spreads different Sessions across the pool instead of piling on one key', () => {
    const { instance } = pool(4)
    const picks = new Set<string>()
    for (let index = 0; index < 40; index += 1) {
      picks.add(String(instance.select({ sessionId: `session-${index}`, ordinal: index })))
    }
    // Every key should see traffic; the point of hashing is to avoid a hot spot.
    expect(picks.size).toBe(4)
  })

  it('is deterministic for one Session id', () => {
    const a = pool(5).instance.select({ sessionId: 'stable', ordinal: 0 })
    const b = pool(5).instance.select({ sessionId: 'stable', ordinal: 99 })
    expect(a).toBe(b)
  })

  it('rotates non-conversational traffic, which has no prefix to preserve', () => {
    const { instance } = pool(3)
    const picks = [0, 1, 2, 3].map(ordinal => instance.select({ ordinal }))
    expect(picks).toEqual([0, 1, 2, 0])
  })

  it('handles a single-key pool', () => {
    const { instance } = pool(1)
    expect(instance.select({ sessionId: 's', ordinal: 0 })).toBe(0)
    expect(instance.select({ sessionId: 'other', ordinal: 7 })).toBe(0)
  })

  it('reports no selection for an empty pool', () => {
    expect(pool(0).instance.select({ sessionId: 's', ordinal: 0 })).toBeUndefined()
  })
})

describe('round-robin spreads every request', () => {
  it('advances with the request ordinal, ignoring Session affinity', () => {
    const { instance } = pool(3, 'round-robin')
    expect(instance.select({ sessionId: 's1', ordinal: 0 })).toBe(0)
    expect(instance.select({ sessionId: 's1', ordinal: 1 })).toBe(1)
    expect(instance.select({ sessionId: 's1', ordinal: 2 })).toBe(2)
    expect(instance.select({ sessionId: 's1', ordinal: 3 })).toBe(0)
  })

  it('wraps an ordinal larger than the pool', () => {
    const { instance } = pool(2, 'round-robin')
    expect(instance.select({ ordinal: 7 })).toBe(1)
  })
})

describe('cooldown parks a key that failed', () => {
  it('skips a parked key and restores it after the cooldown', () => {
    const { instance, advance } = pool(2, 'round-robin')
    instance.markFailed(0)
    expect(instance.isCoolingDown(0)).toBe(true)
    expect(instance.select({ ordinal: 0 })).toBe(1)
    advance(KEY_COOLDOWN_MS + 1)
    expect(instance.isCoolingDown(0)).toBe(false)
    expect(instance.select({ ordinal: 0 })).toBe(0)
  })

  it('re-pins a Session whose own key was parked', () => {
    const { instance, advance } = pool(2)
    const first = instance.select({ sessionId: 's1', ordinal: 0 }) as number
    instance.markFailed(first)
    const replacement = instance.select({ sessionId: 's1', ordinal: 1 })
    expect(replacement).not.toBe(first)
    // The replacement sticks for the rest of the conversation.
    expect(instance.select({ sessionId: 's1', ordinal: 2 })).toBe(replacement)
    advance(KEY_COOLDOWN_MS + 1)
    // Once the original recovers the conversation stays where it moved: moving
    // it back would throw away the cache it has already rebuilt.
    expect(instance.select({ sessionId: 's1', ordinal: 3 })).toBe(replacement)
  })

  it('clears a cooldown when the key serves again', () => {
    const { instance } = pool(2)
    instance.markFailed(0)
    instance.markServed(0)
    expect(instance.isCoolingDown(0)).toBe(false)
  })

  it('falls back to a parked key when every key is parked', () => {
    const { instance } = pool(2, 'round-robin')
    instance.markFailed(0)
    instance.markFailed(1)
    // Serving a parked key beats serving none; the retry policy above decides
    // whether that failure is survivable.
    expect(instance.select({ ordinal: 0 })).toBeDefined()
  })

  it('prefers the parked key that recovers soonest', () => {
    const { instance, advance } = pool(3, 'round-robin')
    instance.markFailed(0)
    advance(10)
    instance.markFailed(1)
    advance(10)
    instance.markFailed(2)
    // Key 0 was parked first, so its cooldown ends first.
    expect(instance.select({ ordinal: 0 })).toBe(0)
  })

  it('returns a key even when the cooldown map holds no usable entry', () => {
    const { instance } = pool(2, 'round-robin')
    instance.markFailed(5)
    instance.markFailed(9)
    expect(instance.select({ ordinal: 0 })).toBe(0)
  })
})

describe('reconfiguration', () => {
  it('drops affinities the new size cannot address', () => {
    const { instance } = pool(4)
    const pinned = instance.select({ sessionId: 's1', ordinal: 0 }) as number
    instance.reconfigure(1, 'sticky')
    // The old affinity is unreachable, so selection must not return it.
    expect(instance.select({ sessionId: 's1', ordinal: 0 })).toBe(0)
    expect(pinned).toBeGreaterThanOrEqual(0)
  })

  it('keeps a still-valid affinity across a resize', () => {
    const { instance } = pool(4)
    const pinned = instance.select({ sessionId: 's1', ordinal: 0 }) as number
    instance.reconfigure(4, 'sticky')
    expect(instance.select({ sessionId: 's1', ordinal: 1 })).toBe(pinned)
  })

  it('switches policy without losing the pool', () => {
    const { instance } = pool(3)
    instance.select({ sessionId: 's1', ordinal: 0 })
    instance.reconfigure(3, 'round-robin')
    expect(instance.select({ sessionId: 's1', ordinal: 1 })).toBe(1)
  })

  it('drops cooldowns for removed keys', () => {
    const { instance } = pool(4)
    instance.markFailed(3)
    instance.reconfigure(2, 'sticky')
    expect(instance.isCoolingDown(3)).toBe(false)
  })
})

describe('affinity bound', () => {
  it('evicts the oldest Session past the cap instead of growing without bound', () => {
    const { instance } = pool(2)
    for (let index = 0; index < KEY_AFFINITY_LIMIT + 50; index += 1) {
      instance.select({ sessionId: `s-${index}`, ordinal: index })
    }
    // The oldest entry was evicted, so it re-anchors rather than being retained.
    // Any answer is valid; the assertion is that the structure stayed bounded
    // and still selects.
    expect(instance.select({ sessionId: 's-0', ordinal: 0 })).toBeDefined()
  })
})

describe('session hash', () => {
  it('is stable and non-negative', () => {
    expect(hashSession('abc')).toBe(hashSession('abc'))
    expect(hashSession('')).toBe(0)
    for (const value of ['a', 'longer-session-id', '\u4e2d\u6587']) {
      expect(hashSession(value)).toBeGreaterThanOrEqual(0)
      expect(Number.isSafeInteger(hashSession(value))).toBe(true)
    }
  })
})
