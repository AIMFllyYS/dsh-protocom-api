/**
 * The OpenCode Go `/v1/usage` reply shape, plus its normalizer. This module
 * has no imports on purpose — the Host handler normalizes the upstream reply
 * with it and the browser strip re-validates the same shape with it, the same
 * contract `balance-view.ts` keeps for the Protocom family.
 *
 * Verified against the live endpoint (2026-09): the reply carries no currency
 * fields at all; subscription consumption is reported as three independent
 * windows — `rolling` (the five-hour burst allowance, priced at 20% of the
 * monthly dollar cap), `weekly` (50%), and `monthly` (100%) — each with a
 * fill `percent`, an ISO `resetsAt`, and a `status` that is `"ok"` or
 * `"rate-limited"`.
 *
 * @module dsh-protocom-api/usage-view
 */

/** One quota window's state. */
export interface GoQuotaWindow {
  /** Fill percentage of this window's allowance (0-100, may exceed 100). */
  percent?: number
  /** Whether this window currently accepts requests (`"ok"` or `"rate-limited"`). */
  status?: string
  /** ISO instant this window's allowance resets. */
  resetsAt?: string
}

/** The whole subscription's quota state, all three windows optional. */
export interface GoUsageView {
  rolling?: GoQuotaWindow
  weekly?: GoQuotaWindow
  monthly?: GoQuotaWindow
}

interface WireWindow {
  status?: unknown
  percent?: unknown
  resetsAt?: unknown
}

interface WireUsage {
  usage?: {
    rolling?: WireWindow
    weekly?: WireWindow
    monthly?: WireWindow
  }
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function normalizeWindow(value: WireWindow | undefined): GoQuotaWindow | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const window: GoQuotaWindow = {}
  const percent = numberField(value.percent)
  if (percent !== undefined) window.percent = percent
  const status = stringField(value.status)
  if (status !== undefined) window.status = status
  const resetsAt = stringField(value.resetsAt)
  if (resetsAt !== undefined) window.resetsAt = resetsAt
  return window
}

/**
 * Re-validate one usage reply that crossed a trust boundary. The browser
 * casts the JSON body to {@link GoUsageView}; a malformed or hostile reply
 * must not reach a `toFixed`/`Date.parse` and crash the strip. Unrecognized
 * fields are ignored and a non-object body is refused rather than
 * half-accepted.
 */
export function parseGoUsage(body: unknown): GoUsageView | undefined {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return undefined
  // The fenced route answers the normalized flat view; the upstream endpoint
  // wraps the same windows in a `usage` envelope. Accept either.
  const wrapped = (body as WireUsage).usage
  const usage = (wrapped ?? body) as WireUsage['usage']
  if (usage === null || typeof usage !== 'object') return undefined
  const view: GoUsageView = {}
  const rolling = normalizeWindow(usage.rolling)
  if (rolling !== undefined) view.rolling = rolling
  const weekly = normalizeWindow(usage.weekly)
  if (weekly !== undefined) view.weekly = weekly
  const monthly = normalizeWindow(usage.monthly)
  if (monthly !== undefined) view.monthly = monthly
  return view
}
