/**
 * Quota queries against the OpenCode Go subscription's usage endpoint, with a
 * 60-second cache and a fenced Fetch surface the settings page polls. The
 * reply is subscription quota — three rate windows (`rolling`, `weekly`,
 * `monthly`) with fill percentage and reset time — not a money balance, so it
 * normalizes into {@link GoUsageView} instead of the Protocom balance shape.
 *
 * The HTTP surface is a Host `connection.fetch` route for the same reason the
 * balance route is: reachability is entirely the active carrier's policy, and
 * this handler implements no authorization of its own.
 *
 * @module dsh-protocom-api/go-usage
 */
import type { GoUsageView } from './usage-view.ts';
import type { ResolvedProtocomOptions } from './config.ts';
import type { ResolvedGroup } from './config.ts';
export { parseGoUsage } from './usage-view.ts';
export type { GoQuotaWindow, GoUsageView } from './usage-view.ts';
/**
 * How long one failure keeps the next caller from hitting the upstream again.
 * Same rule as the balance service: successes cache, failures back off.
 */
export declare const GO_USAGE_FAILURE_BACKOFF_MS = 5000;
/** Inputs the usage service reads from the owning plugin. */
export interface GoUsageHooks {
    /** Current validated connection facts, re-read per query. */
    options: () => ResolvedProtocomOptions;
    /** Resolve the `go` group's bearer token. */
    resolveApiKey: (group: ResolvedGroup) => Promise<string>;
    /** Local sink for failure detail deliberately kept out of HTTP responses. */
    log?: (message: string) => void;
}
/**
 * The subscription's quota, served from cache while fresh. The key is the
 * family's single `go` group; a disabled or keyless group answers the failure
 * the strip displays.
 */
export declare class GoUsageService {
    private readonly hooks;
    /** Cache lifetime for one quota reply. */
    static readonly TTL_MS = 60000;
    private cached;
    private failedAt;
    constructor(hooks: GoUsageHooks);
    /** Forget the cached reply (a configuration change may alter the group). */
    invalidate(): void;
    /** The whole account's quota windows. */
    usage(): Promise<GoUsageView>;
    private fetchUsage;
}
/**
 * Build the `GET /api/opencode-go/usage` Fetch handler for the Host's shared
 * `/api` channel. Authorization belongs to the carrier, which applies its
 * trust policy before dispatch (the `connection.fetch.register` contract), so
 * this handler never inspects the peer address or the Host header. A disabled
 * or missing `go` group answers 404; an upstream failure answers a fixed
 * `{error}` row — the message names neither the credential reference nor any
 * caller-supplied input, and the detail goes to the local log instead.
 */
export declare function goUsageFetchHandler(service: GoUsageService, hooks: GoUsageHooks): (request: Request) => Promise<Response>;
