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

import { attributionHeaders, LlmError } from '@deepseek-ai/dsh-llm'
import { parseGoUsage } from './usage-view.ts'
import type { GoUsageView } from './usage-view.ts'
import type { ResolvedProtocomOptions } from './config.ts'
import type { ResolvedGroup } from './config.ts'

export { parseGoUsage } from './usage-view.ts'
export type { GoQuotaWindow, GoUsageView } from './usage-view.ts'

/**
 * How long one failure keeps the next caller from hitting the upstream again.
 * Same rule as the balance service: successes cache, failures back off.
 */
export const GO_USAGE_FAILURE_BACKOFF_MS = 5_000

/** Inputs the usage service reads from the owning plugin. */
export interface GoUsageHooks {
  /** Current validated connection facts, re-read per query. */
  options: () => ResolvedProtocomOptions
  /** Resolve the `go` group's bearer token. */
  resolveApiKey: (group: ResolvedGroup) => Promise<string>
  /** Local sink for failure detail deliberately kept out of HTTP responses. */
  log?: (message: string) => void
}

/**
 * The subscription's quota, served from cache while fresh. The key is the
 * family's single `go` group; a disabled or keyless group answers the failure
 * the strip displays.
 */
export class GoUsageService {
  /** Cache lifetime for one quota reply. */
  static readonly TTL_MS = 60_000
  private cached: { at: number; value: Promise<GoUsageView> } | undefined
  private failedAt: number | undefined

  constructor(private readonly hooks: GoUsageHooks) {}

  /** Forget the cached reply (a configuration change may alter the group). */
  invalidate(): void {
    this.cached = undefined
    this.failedAt = undefined
  }

  /** The whole account's quota windows. */
  usage(): Promise<GoUsageView> {
    const options = this.hooks.options()
    const group = options.groups.get('go')
    if (group === undefined || !group.enabled) {
      return Promise.reject(new LlmError('opencode-go: group "go" is not enabled', 'USAGE_FAILED'))
    }
    if (this.cached !== undefined && Date.now() - this.cached.at < GoUsageService.TTL_MS) {
      return this.cached.value
    }
    if (this.failedAt !== undefined && Date.now() - this.failedAt < GO_USAGE_FAILURE_BACKOFF_MS) {
      return Promise.reject(new LlmError('opencode-go: the usage query is backing off after a failure', 'USAGE_FAILED'))
    }
    const value = this.fetchUsage(options.baseURL, group)
    value.then(
      () => { this.failedAt = undefined },
      () => {
        this.failedAt = Date.now()
        if (this.cached?.value === value) this.cached = undefined
      },
    )
    this.cached = { at: Date.now(), value }
    return value
  }

  private async fetchUsage(baseURL: string, group: ResolvedGroup): Promise<GoUsageView> {
    const apiKey = await this.hooks.resolveApiKey(group)
    const url = `${baseURL}/v1/usage`
    let response: Response
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'authorization': `Bearer ${apiKey}`,
          ...attributionHeaders(),
        },
      })
    } catch (error: unknown) {
      throw new LlmError(`could not reach ${url}`, 'USAGE_FAILED', { cause: error })
    }
    if (!response.ok) {
      throw new LlmError(
        `${url} answered ${response.status}${response.status === 401 || response.status === 403 ? '; check the API key' : ''}`,
        'USAGE_FAILED',
        { status: response.status },
      )
    }
    const parsed = parseGoUsage(await response.json())
    if (parsed === undefined) {
      throw new LlmError('the usage endpoint did not answer with a usage object', 'USAGE_FAILED')
    }
    return parsed
  }
}

/**
 * Response headers every usage answer carries. Account state is live and
 * sensitive, so it is never cacheable and never sniffable as another type.
 */
const JSON_HEADERS: Readonly<Record<string, string>> = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS } })
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
export function goUsageFetchHandler(
  service: GoUsageService,
  hooks: GoUsageHooks,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== 'GET') {
      return new Response(null, { status: 405, headers: { ...JSON_HEADERS, allow: 'GET' } })
    }
    const group = hooks.options().groups.get('go')
    if (group === undefined || !group.enabled) {
      return json(404, { error: 'the OpenCode Go group is not enabled' })
    }
    try {
      return json(200, await service.usage())
    } catch (error: unknown) {
      hooks.log?.(`opencode-go: usage query failed: ${describeError(error)}`)
      return json(502, { error: 'the usage query failed' })
    }
  }
}
