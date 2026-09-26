/**
 * Retry semantics for this plugin's routes: the shipped budget, its bounds, and
 * the one function that turns a resolved budget into the policy the harness
 * retry executor consumes.
 *
 * Deliberately import-free, like `family.ts` and `fusion.ts`: the browser
 * client edits these same numbers, and importing the Host-side config module
 * would drag schemastery, the credentials seam, and the timeout package into
 * the browser bundle. `config.ts` validates against these values and
 * `adapter.ts` builds from them, so the numbers live in exactly one place.
 *
 * @module dsh-protocom-api/retry
 */
/**
 * Retries after the first attempt before a transient request failure closes the
 * step (default 20).
 *
 * This is the setting that keeps an unattended run alive across a relay outage.
 * The harness executor re-runs the failed step in the same open turn, so the
 * budget is what an overnight job spends waiting rather than what it spends
 * asking: with the shipped backoff shape below the ladder spans roughly eight
 * hours before the budget is exhausted.
 */
export declare const DEFAULT_RETRY_MAX_ATTEMPTS = 20;
/**
 * Ceiling for one locally scheduled backoff delay, in milliseconds (default one
 * hour). The delay doubles from {@link RETRY_INITIAL_DELAY_MS} until it reaches
 * this ceiling, then stays there for the remaining attempts.
 */
export declare const DEFAULT_RETRY_MAX_DELAY_MS = 3600000;
/**
 * First locally scheduled backoff delay, in milliseconds.
 *
 * Not configurable on purpose: the early rungs exist to absorb a transient blip
 * quickly, and the ceiling above is what bounds a long outage. Exposing it would
 * only add a way to make the first retry slower than the ones after it.
 */
export declare const RETRY_INITIAL_DELAY_MS = 500;
/** Symmetric jitter around each scheduled delay, matching the harness default. */
export declare const RETRY_JITTER_RATIO = 0.1;
/**
 * Largest retry budget a setting may name. The harness itself allows far more,
 * but every retry is a billed provider request, and a budget past a hundred
 * attempts stops describing an outage and starts describing a runaway. A
 * deployment that genuinely needs more raises this in code, deliberately.
 */
export declare const MAX_RETRY_ATTEMPTS = 100;
/**
 * Largest delay the harness timer layer accepts, mirrored here so a browser
 * editor can bound its own input without importing the timeout package.
 * Kept equal to `MAX_TIMER_DELAY_MS` from `@deepseek-ai/dsh-timeout`; the
 * Host-side resolver asserts the two still agree, so this cannot drift silently.
 */
export declare const MAX_RETRY_DELAY_MS = 2147483647;
/**
 * Failure codes a retry may absorb.
 *
 * These are what an unstable relay produces: a dropped connection, a stalled
 * stream, a 5xx, a rate limit, an answer the model ended without content.
 * Deliberately absent are the permanent ones — a bad key (`AUTH`), a malformed
 * request (`INVALID_REQUEST`), a protocol violation, an unusable context.
 * Retrying those would burn the budget and delay the diagnosis without ever
 * succeeding, so they fail on the first attempt and say why.
 */
export declare const RETRYABLE_FAILURE_CODES: readonly string[];
/** The parts of a resolved configuration the policy depends on. */
export interface RetryBudget {
    /** Retries after the first attempt. */
    retryMaxAttempts: number;
    /** Ceiling for one scheduled delay, in milliseconds. */
    retryMaxDelayMs: number;
}
/** The policy shape the harness retry executor consumes. */
export interface RouteRetryPolicy {
    mode: 'normal';
    /** Retries after the first attempt. */
    maxRetries: number;
    retryableCodes: readonly string[];
    initialDelayMs: number;
    /** Ceiling for one scheduled delay, in milliseconds. */
    maxDelayMs: number;
    jitterRatio: number;
}
/**
 * Build the retry policy for one route from its live budget.
 *
 * Derived per call rather than pinned in a constant because the harness captures
 * a route's policy when that route is REGISTERED — and this plugin re-registers
 * on every committed settings change — so reading the current facts here is
 * exactly what makes both settings reach the next request without a restart.
 *
 * `maxDelayMs` and the transport's Retry-After clamp are the same number on
 * purpose: the executor cancels a retry when a forwarded provider delay exceeds
 * `maxDelayMs` in normal mode, so deriving both from one value is what keeps
 * them from ever disagreeing.
 * @param budget - the resolved attempt count and delay ceiling.
 * @returns the immutable policy for that route.
 */
export declare function retryPolicyFor(budget: RetryBudget): RouteRetryPolicy;
/**
 * The worst-case span one budget covers, in milliseconds: the sum of every
 * scheduled delay from the first rung up to the ceiling.
 * @param budget - the resolved attempt count and delay ceiling.
 * @returns the total time the budget can spend waiting, jitter excluded.
 */
export declare function retryBudgetSpanMs(budget: RetryBudget): number;
