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
export type KeyPolicy = 'sticky' | 'round-robin';
/** Every policy this plugin accepts, in display order. */
export declare const KEY_POLICIES: readonly KeyPolicy[];
/**
 * How long a key that failed admission is skipped, in milliseconds.
 *
 * Long enough to step over a transiently rejected key for the rest of a run,
 * short enough that a key recovered by topping up the account comes back
 * without restarting anything. Deliberately not configurable: it is a
 * safety net for the pool, not a policy an operator tunes.
 */
export declare const KEY_COOLDOWN_MS = 60000;
/**
 * Largest number of Session affinities retained.
 *
 * Sticky selection needs one entry per live conversation. The cap keeps a
 * long-lived process from growing without bound as Sessions come and go; when
 * it is exceeded the oldest affinity is dropped, which costs at most one cold
 * cache read for a conversation that had already gone quiet.
 */
export declare const KEY_AFFINITY_LIMIT = 512;
/** One pool member as the selector sees it. */
export interface PoolKey {
    /** Credential reference this member resolves through. */
    ref: string;
}
/** Selection facts the pool needs from the caller. */
export interface KeyRequest {
    /** Session the request belongs to; absent for non-conversational traffic. */
    sessionId?: string;
    /** Monotonic request ordinal, used to rotate in round-robin mode. */
    ordinal: number;
}
/**
 * Upper bound on the number of configured keys per group.
 *
 * A pool is for spreading load across a handful of accounts, not for storing an
 * arbitrary list; the bound also keeps a malformed settings write from turning
 * into a very large fan-out of credential resolutions.
 */
export declare const MAX_KEYS_PER_GROUP = 16;
/**
 * Deterministic hash of a Session id, used to spread sessions across a pool in
 * sticky mode instead of piling every conversation onto the first key.
 * @param value - the Session id.
 * @returns a non-negative integer.
 */
export declare function hashSession(value: string): number;
/**
 * The pool's selection state: one affinity per Session, plus per-key cooldowns.
 * Kept as a class so a caller owns exactly one and can dispose it.
 */
export declare class KeyPool {
    private keyCount;
    private policy;
    private readonly now;
    /** Session id to key index. Insertion order is the eviction order. */
    private readonly affinity;
    /** Key index to the instant its cooldown ends, in epoch milliseconds. */
    private readonly cooldownUntil;
    /**
     * The key each traffic stream most recently received. Sticky mode already
     * knows this through {@link affinity}; recording it for every mode is what
     * lets a failure report name the key that actually failed, without the
     * adapter having to know anything about pools or credentials.
     */
    private readonly lastPicked;
    /**
     * @param keyCount - how many keys this pool holds.
     * @param policy - how to choose among them.
     * @param now - clock, injectable so cooldown behaviour is testable.
     */
    constructor(keyCount: number, policy: KeyPolicy, now?: () => number);
    /** Resize after a settings change, dropping affinities the new size cannot address. */
    reconfigure(keyCount: number, policy: KeyPolicy): void;
    /** Whether one key is currently parked after a failure. */
    isCoolingDown(index: number): boolean;
    /** Park one key so later selections step over it. */
    markFailed(index: number): void;
    /** Clear one key's cooldown, after it served a request successfully. */
    markServed(index: number): void;
    /**
     * The key a given traffic stream last received, for failure attribution.
     * @param sessionId - the conversation, or undefined for non-Session traffic.
     * @returns the last selected index, or undefined when this stream is new.
     */
    lastIndexFor(sessionId: string | undefined): number | undefined;
    /**
     * Choose one key index for a request.
     *
     * Sticky mode reuses the Session's affinity; round-robin advances with the
     * ordinal. Both skip keys in cooldown, and a Session whose pinned key is
     * parked is re-pinned to the replacement so the rest of its run stays warm.
     * @param request - the Session (when any) and the request ordinal.
     * @returns the chosen index, or undefined when every key is parked.
     */
    select(request: KeyRequest): number | undefined;
    /** The parked key whose cooldown ends first, or 0 when none is on record. */
    private soonestRecovering;
    /** The index a sticky selection should start from. */
    private anchor;
    /** Record one Session's affinity, evicting the oldest entry past the cap. */
    private pin;
}
