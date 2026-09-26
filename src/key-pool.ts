/**
 * Credential-pool selection for one provider group.
 *
 * A group may be configured with several API keys. How those keys are chosen is
 * a real trade-off, and the trade-off is cache locality:
 *
 * - **sticky** (default) pins one key per Session. Every step of a conversation
 *   then reaches the same account, so the upstream prefix cache stays warm. This
 *   is what the harness's own request reconstruction assumes: each step re-sends
 *   the same growing prefix, and a cache miss on every step multiplies the
 *   input-token bill for the whole run.
 * - **round-robin** rotates the key on every request. That spreads load and
 *   spend evenly across keys, at the cost of that prefix cache: consecutive
 *   steps land on different accounts, so each one re-reads the conversation
 *   from cold. Choose it when quota exhaustion matters more than cache hit rate.
 *
 * A key that has just failed authentication or been rate-limited is parked for a
 * cooldown, so a pool with one bad key does not keep handing it out.
 *
 * Deliberately import-free, like `retry.ts` and `family.ts`: the browser client
 * names the same policy vocabulary, and importing anything Host-side would drag
 * schemastery and the credentials seam into the browser bundle.
 *
 * @module dsh-protocom-api/key-pool
 */

/** How a group picks one key out of its configured pool. */
export type KeyPolicy = 'sticky' | 'round-robin'

/** Every policy this plugin accepts, in display order. */
export const KEY_POLICIES: readonly KeyPolicy[] = ['sticky', 'round-robin']

/**
 * How long a key that failed admission is skipped, in milliseconds.
 *
 * Long enough to step over a transiently rejected key for the rest of a run,
 * short enough that a key recovered by topping up the account comes back
 * without restarting anything. Deliberately not configurable: it is a
 * safety net for the pool, not a policy an operator tunes.
 */
export const KEY_COOLDOWN_MS = 60_000

/**
 * Largest number of Session affinities retained.
 *
 * Sticky selection needs one entry per live conversation. The cap keeps a
 * long-lived process from growing without bound as Sessions come and go; when
 * it is exceeded the oldest affinity is dropped, which costs at most one cold
 * cache read for a conversation that had already gone quiet.
 */
export const KEY_AFFINITY_LIMIT = 512

/** One pool member as the selector sees it. */
export interface PoolKey {
  /** Credential reference this member resolves through. */
  ref: string
}

/** Selection facts the pool needs from the caller. */
export interface KeyRequest {
  /** Session the request belongs to; absent for non-conversational traffic. */
  sessionId?: string
  /** Monotonic request ordinal, used to rotate in round-robin mode. */
  ordinal: number
}

/**
 * Upper bound on the number of configured keys per group.
 *
 * A pool is for spreading load across a handful of accounts, not for storing an
 * arbitrary list; the bound also keeps a malformed settings write from turning
 * into a very large fan-out of credential resolutions.
 */
export const MAX_KEYS_PER_GROUP = 16

/**
 * Bookkeeping key for traffic with no Session: a model listing, a probe, a
 * title generated before any conversation exists. Those requests share one
 * attribution slot because they share the property that no prefix cache
 * depends on which key served them.
 */
const NON_SESSION = '\u0000no-session'

/**
 * Deterministic hash of a Session id, used to spread sessions across a pool in
 * sticky mode instead of piling every conversation onto the first key.
 * @param value - the Session id.
 * @returns a non-negative integer.
 */
export function hashSession(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

/**
 * The pool's selection state: one affinity per Session, plus per-key cooldowns.
 * Kept as a class so a caller owns exactly one and can dispose it.
 */
export class KeyPool {
  /** Session id to key index. Insertion order is the eviction order. */
  private readonly affinity = new Map<string, number>()
  /** Key index to the instant its cooldown ends, in epoch milliseconds. */
  private readonly cooldownUntil = new Map<number, number>()
  /**
   * The key each traffic stream most recently received. Sticky mode already
   * knows this through {@link affinity}; recording it for every mode is what
   * lets a failure report name the key that actually failed, without the
   * adapter having to know anything about pools or credentials.
   */
  private readonly lastPicked = new Map<string, number>()

  /**
   * Record which key a stream received, evicting the oldest past the cap.
   *
   * Insertion order is the recency order, so re-inserting refreshes a stream's
   * position exactly as the affinity map already does. Without the cap this grew
   * once per (session, group) for the life of the Host: measured 5000 distinct
   * session ids leaving 5000 entries, against an affinity map correctly held at
   * 512. A long-lived process would leak one small entry per conversation.
   * @param stream - the Session id, or the non-session sentinel.
   * @param index - the key it was served.
   */
  private remember(stream: string, index: number): void {
    this.lastPicked.delete(stream)
    this.lastPicked.set(stream, index)
    while (this.lastPicked.size > KEY_AFFINITY_LIMIT) {
      const oldest = this.lastPicked.keys().next()
      if (oldest.done === true) break
      this.lastPicked.delete(oldest.value)
    }
  }

  /**
   * @param keyCount - how many keys this pool holds.
   * @param policy - how to choose among them.
   * @param now - clock, injectable so cooldown behaviour is testable.
   */
  constructor(
    private keyCount: number,
    private policy: KeyPolicy,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Resize after a settings change, dropping affinities the new size cannot address. */
  reconfigure(keyCount: number, policy: KeyPolicy): void {
    this.keyCount = keyCount
    this.policy = policy
    for (const [session, index] of this.affinity) {
      if (index >= keyCount) this.affinity.delete(session)
    }
    for (const index of [...this.cooldownUntil.keys()]) {
      if (index >= keyCount) this.cooldownUntil.delete(index)
    }
    for (const [stream, index] of this.lastPicked) {
      if (index >= keyCount) this.lastPicked.delete(stream)
    }
  }

  /** Whether one key is currently parked after a failure. */
  isCoolingDown(index: number): boolean {
    const until = this.cooldownUntil.get(index)
    if (until === undefined) return false
    if (until <= this.now()) {
      this.cooldownUntil.delete(index)
      return false
    }
    return true
  }

  /** Park one key so later selections step over it. */
  markFailed(index: number): void {
    this.cooldownUntil.set(index, this.now() + KEY_COOLDOWN_MS)
  }

  /** Clear one key's cooldown, after it served a request successfully. */
  markServed(index: number): void {
    this.cooldownUntil.delete(index)
  }

  /**
   * The key a given traffic stream last received, for failure attribution.
   * @param sessionId - the conversation, or undefined for non-Session traffic.
   * @returns the last selected index, or undefined when this stream is new.
   */
  lastIndexFor(sessionId: string | undefined): number | undefined {
    const index = this.lastPicked.get(sessionId ?? NON_SESSION)
    return index !== undefined && index < this.keyCount ? index : undefined
  }

  /**
   * Choose one key index for a request.
   *
   * Sticky mode reuses the Session's affinity; round-robin advances with the
   * ordinal. Both skip keys in cooldown, and a Session whose pinned key is
   * parked is re-pinned to the replacement so the rest of its run stays warm.
   * @param request - the Session (when any) and the request ordinal.
   * @returns the chosen index, or undefined when every key is parked.
   */
  select(request: KeyRequest): number | undefined {
    if (this.keyCount === 0) return undefined
    const start = this.policy === 'sticky' ? this.anchor(request) : request.ordinal
    for (let step = 0; step < this.keyCount; step += 1) {
      const index = (start + step) % this.keyCount
      if (this.isCoolingDown(index)) continue
      if (this.policy === 'sticky' && request.sessionId !== undefined) this.pin(request.sessionId, index)
      this.remember(request.sessionId ?? NON_SESSION, index)
      return index
    }
    // Every key is parked. Serving one is better than serving none: a cooldown
    // is this plugin's own local heuristic, not the provider's verdict, and the
    // retry policy above decides whether the resulting failure is survivable.
    // The soonest-recovering key is the best guess at one already back.
    const fallback = this.soonestRecovering()
    this.remember(request.sessionId ?? NON_SESSION, fallback)
    return fallback
  }

  /** The parked key whose cooldown ends first, or 0 when none is on record. */
  private soonestRecovering(): number {
    let best: number | undefined
    let bestUntil = Number.POSITIVE_INFINITY
    for (const [index, until] of this.cooldownUntil) {
      if (index >= this.keyCount) continue
      if (until < bestUntil) {
        best = index
        bestUntil = until
      }
    }
    return best ?? 0
  }

  /** The index a sticky selection should start from. */
  private anchor(request: KeyRequest): number {
    if (request.sessionId !== undefined) {
      const pinned = this.affinity.get(request.sessionId)
      if (pinned !== undefined && pinned < this.keyCount) return pinned
      if (pinned === undefined) {
        // First request of a conversation: spread new sessions across the pool
        // so a single busy run cannot drain one account before the others are
        // touched. The choice then sticks for the conversation's whole life.
        return hashSession(request.sessionId) % this.keyCount
      }
    }
    // Non-conversational traffic (title generation, compaction of an unknown
    // Session) has no prefix worth preserving, so it rotates.
    return request.ordinal
  }

  /** Record one Session's affinity, evicting the oldest entry past the cap. */
  private pin(sessionId: string, index: number): void {
    this.affinity.delete(sessionId)
    this.affinity.set(sessionId, index)
    while (this.affinity.size > KEY_AFFINITY_LIMIT) {
      const oldest = this.affinity.keys().next()
      if (oldest.done === true) break
      this.affinity.delete(oldest.value)
    }
  }
}
