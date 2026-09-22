/**
 * Plugin config, validated by the same-named schemastery schema and doubling
 * as the `protocom-api` settings-section shape. The `groups` dict is keyed by
 * the four fixed group keys; each group becomes one provider route
 * (`protocom-<key>`) when enabled, with its own credential reference.
 *
 * @module dsh-protocom-api/config
 */

import z from '@deepseek-ai/schemastery'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { DEFAULT_BASE_URL } from './groups.ts'
import { DEFAULT_RECOMMENDED, GO_DEFAULT_RECOMMENDED, identityKey } from './model-registry.ts'
import { GO_DEFAULT_BASE_URL, PROTOCOM } from './family.ts'
import type { FamilyGroupDefaults, ProviderFamily } from './family.ts'
import type { FusionConfig, FusionSeatConfig } from './fusion.ts'

export { DEFAULT_BASE_URL, DEFAULT_BASE_URL_ORIGIN, GROUP_DEFAULTS, GROUP_KEYS, groupOf, providerOf } from './groups.ts'
export type { GroupKey, GroupReasoning, Protocol } from './groups.ts'
export { FAMILIES, GO_CREDENTIAL_REF, GO_DEFAULT_BASE_URL, GO_DEFAULT_BASE_URL_ORIGIN, GO_PROVIDER, OPENCODE_GO, PROTOCOM } from './family.ts'
export type { FamilyGroupDefaults, ProviderFamily } from './family.ts'
import type { Protocol } from './groups.ts'

/**
 * Idle interval after which one provider stream is aborted. Mirrors the
 * first-party adapters' watchdog default so a stalled endpoint cannot pin a
 * request — and its socket and agent step — open forever.
 */
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000

/**
 * The only credential references the Protocom family resolves: its own
 * namespaced environment-variable names. An open shape let a rewritten
 * `baseURL` pair any `process.env` name with an arbitrary endpoint, turning
 * the environment fallback into an exfiltration primitive. The Go family's
 * own namespace is `OPENCODE_` (see `family.ts`).
 */
export const PROTOCOM_CREDENTIAL_REF = /^PROTOCOM_[A-Z0-9_]+$/

/** Configuration for one group; every field is optional in yml. */
export interface GroupConfig {
  /** Whether this group's provider route is active (default `false`). */
  enabled?: boolean
  /** Credential reference (environment-variable name) resolved per request. */
  apiKey?: string
  /** Wire protocol override; defaults to the group's shipped protocol. */
  protocol?: Protocol
  /** Context lengths offered as selectable variants, in tokens. Omission serves one default entry per model. */
  contextLengths?: number[]
  /** Whether this group appears on the balance endpoint (default `true`). */
  showBalance?: boolean
  /**
   * Whether a chat-completions request replays the assistant's
   * `reasoning_content` (default `false`). Routes disagree: this relay
   * answers 400 for a replayed assistant turn that carries it, and DeepSeek's
   * API documents the same. An interleaved-thinking provider that needs its
   * thinking back turns this on.
   */
  replayReasoning?: boolean
  /**
   * How a chat-completions request replays an assistant message's own text
   * (default `keep`): `keep` sends it as the protocol says, `drop` omits it
   * while keeping the turn's tool calls, and `user` re-attributes it to a user
   * item named `assistant`.
   *
   * This relay's chat surface translates to an upstream Responses API that
   * refuses an assistant text item in every chat-side shape — string, `text`
   * part and `output_text` part all answer 400 — while accepting the same
   * words on a user item, so a route with that defect is unusable on this
   * protocol until one of the two compromise modes is chosen. Prefer
   * `protocol: responses` where the route has one; these modes are for a route
   * that does not.
   */
  assistantTextReplay?: 'keep' | 'drop' | 'user'
}

/**
 * One family's settings-section shape: the endpoint base plus its group
 * profiles. The Protocom section lives under the `protocom-api` namespace and
 * the OpenCode Go section under `opencode-go`; both share this shape, with
 * only the shipped defaults (endpoint, group keys, recommended list) differing
 * per family.
 */
export interface SectionConfig {
  /** Endpoint base; `/v1` suffix and trailing slashes are normalized away. */
  baseURL?: string
  /**
   * Explicit confirmation that this deployment really sends its stored API key
   * to a non-default endpoint. Absent or false pins `baseURL` to the shipped
   * family origin, so a single settings write cannot redirect the key.
   * Deliberately has no schema default: opting in must be a deliberate act.
   */
  allowCustomBaseURL?: boolean
  /** Idle interval, in milliseconds, after which one provider stream is aborted (default 300000). */
  streamIdleTimeoutMs?: number
  /** Group profiles keyed by group key; unknown keys are refused. */
  groups?: Record<string, GroupConfig>
  /**
   * Upstream model ids the model menu must not offer, across every group.
   * Absent or empty shows the whole catalog, so the default is every known
   * model and hiding is the explicit act.
   */
  hiddenModels?: string[]
  /**
   * Upstream model ids that lead the model menu, most preferred first. Absent
   * uses the family's shipped recommendation. This orders the menu and nothing
   * else: a model left off the list stays fully selectable below the picks.
   */
  recommendedModels?: string[]
  /**
   * Context lengths to offer per upstream model id. Each listed length becomes
   * its own model-menu entry (`Name [256K]`, `Name [1M]`), so a user picks the
   * context by picking the entry. An absent model offers one entry at its full
   * window; a length above the model's window is ignored.
   */
  modelContexts?: Record<string, number[]>
  /**
   * Per-model image-input capability, keyed by upstream model id (aliases
   * collapse to one key). The endpoints disclose no modality for any model, so
   * the plugin's own default is permissive: an id nobody has judged accepts
   * images, because a wrong "no" makes a documented capability unreachable
   * while a wrong "yes" costs one upstream error that names the model. `false`
   * is the explicit "this model is text-only" that removes the image modality
   * from that model's menu entries.
   */
  visionModels?: Record<string, boolean>
}

/**
 * Plugin configuration: the Protocom section inline plus the OpenCode Go
 * section under `opencode`. The `opencode` field keeps the second family's
 * yml profile out of the `protocom-api` settings namespace it does not belong
 * to; its shape is the same section shape.
 */
export interface Config extends SectionConfig {
  /** OpenCode Go family profile; same section shape under its own namespace. */
  opencode?: SectionConfig
  /** Fusion dual-model routing profile; the same shape as its own settings section. */
  fusion?: FusionConfig
}

const group: z<GroupConfig> = z.object({
  enabled: z.boolean().default(false),
  apiKey: z.string().role('credential-ref'),
  protocol: z.union(['chat-completions', 'responses']),
  contextLengths: z.array(z.number().step(1).min(1)),
  showBalance: z.boolean().default(true),
  replayReasoning: z.boolean().default(false),
  assistantTextReplay: z.union(['keep', 'drop', 'user']).default('keep'),
})

/**
 * The settings-section schema for one family: every field shares its shape
 * across families, while `baseURL` and `recommendedModels` default to the
 * family's own shipped values.
 */
function sectionSchema(baseURL: string, recommended: readonly string[]): z<SectionConfig> {
  return z.object({
    baseURL: z.string().default(baseURL),
    allowCustomBaseURL: z.boolean(),
    streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
    groups: z.dict(group).default({}),
    hiddenModels: z.array(z.string()).default([]),
    recommendedModels: z.array(z.string()).default([...recommended]),
    modelContexts: z.dict(z.array(z.number().step(1).min(1))).default({}),
    visionModels: z.dict(z.boolean()).default({}),
  })
}

/** Settings-section schema for the `protocom-api` namespace. */
export const ProtocomSection: z<SectionConfig> = sectionSchema(DEFAULT_BASE_URL, DEFAULT_RECOMMENDED)

/** Settings-section schema for the `opencode-go` namespace. */
export const GoSection: z<SectionConfig> = sectionSchema(GO_DEFAULT_BASE_URL, GO_DEFAULT_RECOMMENDED)

/**
 * One Fusion seat. No field carries a schema default: Schemastery normalizes
 * an absent seat to an empty object, and `resolveFusionSeat` reads that empty
 * object as "this seat is unset" — a defaulted `provider: ''` would make the
 * two indistinguishable.
 */
const fusionSeat: z<FusionSeatConfig> = z.object({
  provider: z.string(),
  model: z.string(),
  reasoningEffort: z.string(),
})

/**
 * Settings-section schema for the `model-fusion` namespace, and the shape of
 * the plugin's own `fusion` config slice. Only `enabled` defaults here; the
 * seat-required-when-enabled rule is a cross-field constraint Schemastery
 * cannot express, so `resolveFusion` is the authority and runs on every write.
 */
export const FusionSection: z<FusionConfig> = z.object({
  enabled: z.boolean().default(false),
  leader: fusionSeat,
  coder: fusionSeat,
  includeForks: z.boolean().default(true),
  applyLeader: z.boolean().default(true),
})

/** Runtime schema for the plugin's yml configuration. */
export const Config: z<Config> = z.object({
  baseURL: z.string().default(DEFAULT_BASE_URL),
  allowCustomBaseURL: z.boolean(),
  streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
  groups: z.dict(group).default({}),
  hiddenModels: z.array(z.string()).default([]),
  recommendedModels: z.array(z.string()).default([...DEFAULT_RECOMMENDED]),
  modelContexts: z.dict(z.array(z.number().step(1).min(1))).default({}),
  visionModels: z.dict(z.boolean()).default({}),
  opencode: GoSection,
  fusion: FusionSection,
})

/** Validated per-group facts with every adapter-owned default resolved. */
export interface ResolvedGroup {
  /** Group key and the `groups` dict key (family-scoped). */
  key: string
  /** Provider route this group registers under when enabled. */
  provider: string
  /** Resolved display name for selectors and configuration surfaces. */
  displayName: string
  enabled: boolean
  protocol: Protocol
  /** Validated credential reference, when one is configured. */
  apiKeyRef?: CredentialRef
  /** Configured context-variant lengths, when offered. */
  contextLengths?: number[]
  showBalance: boolean
  /** Whether a chat-completions replay carries the assistant's reasoning. */
  replayReasoning: boolean
  /** How a chat-completions replay carries an assistant message's own text. */
  assistantTextReplay: 'keep' | 'drop' | 'user'
}

/**
 * One resolution's complete connection facts. The base URL and every group
 * resolve together, so a rejected snapshot never pairs a new endpoint with an
 * older generation's group state.
 */
export interface ResolvedProtocomOptions {
  /** The family these facts were resolved for. */
  family: ProviderFamily
  /** Endpoint root without trailing slashes or a `/v1` suffix. */
  baseURL: string
  /** Resolved idle watchdog interval for one provider stream, in milliseconds. */
  streamIdleTimeoutMs: number
  /** The family's groups in fixed order; `enabled` gates route registration. */
  groups: ReadonlyMap<string, ResolvedGroup>
  /** Upstream ids the model menu must not offer. Empty means the whole catalog. */
  hiddenModels: ReadonlySet<string>
  /** Upstream ids that lead the model menu, most preferred first. */
  recommendedModels: readonly string[]
  /** Context lengths to offer per upstream id, keyed by model identity. */
  modelContexts: ReadonlyMap<string, readonly number[]>
  /** Image-input capability per upstream id, keyed by model identity. */
  visionModels: ReadonlyMap<string, boolean>
}

/**
 * The one explicit resolve step from raw config to validated connection
 * facts. Programmatic construction may bypass Schemastery normalization, so
 * every bound is re-judged here.
 * @param config - raw plugin config or resolved settings snapshot.
 * @returns validated connection facts for all four groups.
 */
export function resolveAdapterOptions(config: SectionConfig, family: ProviderFamily = PROTOCOM): ResolvedProtocomOptions {
  const baseURL = resolveBaseURL((config.baseURL ?? family.baseURL).replace(/\/+$/, '').replace(/\/v1$/, ''))
  // Origin pin: with no explicit confirmation, the stored credential may only
  // travel to the endpoint this adapter ships for. This is the difference
  // between "the key is encrypted in transit" and "the key cannot be
  // redirected by a single settings write at all".
  if (config.allowCustomBaseURL !== true && new URL(baseURL).origin !== family.origin) {
    throw new Error(
      `${family.ns}: baseURL "${baseURL}" points away from the shipped endpoint (${family.origin});`
      + ' set allowCustomBaseURL: true to confirm this deployment really sends its API key there',
    )
  }
  const streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS
  if (!Number.isFinite(streamIdleTimeoutMs) || streamIdleTimeoutMs <= 0 || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(`${family.ns}: streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`)
  }
  const supplied = config.groups ?? {}
  for (const key of Object.keys(supplied)) {
    if (!family.keys.includes(key)) {
      throw new Error(`${family.ns}: unknown group "${key}"; expected one of ${family.keys.join(', ')}`)
    }
  }
  const groups = new Map<string, ResolvedGroup>()
  for (const key of family.keys) {
    const source: GroupConfig = supplied[key] ?? {}
    const defaults: FamilyGroupDefaults = family.defaults[key] ?? { displayName: key, protocol: 'chat-completions' }
    if (source.contextLengths !== undefined) {
      if (source.contextLengths.some(length => !Number.isSafeInteger(length) || length <= 0)) {
        throw new Error(`${family.ns}: group "${key}" contextLengths must be positive integers`)
      }
      if (new Set(source.contextLengths).size !== source.contextLengths.length) {
        throw new Error(`${family.ns}: group "${key}" contextLengths must not contain duplicates`)
      }
    }
    // A group's shipped ladder (StepFun's published 200K/256K/400K/1M) applies
    // when the deployment has not chosen its own. schemastery normalizes a
    // missing `contextLengths` to `[]` in a described document, so the empty
    // array is "unset", not "zero variants" — a group can never serve none.
    const effectiveLengths = source.contextLengths?.length ? source.contextLengths : defaults.contextLengths
    let apiKeyRef: CredentialRef | undefined
    if (source.apiKey !== undefined) {
      // Namespacing is a security bound, not a style rule: the reference is
      // what the `process.env` fallback reads, so an open shape reaches any
      // environment variable the launching process holds.
      if (!family.credentialRef.test(source.apiKey)) {
        throw new Error(`${family.ns}: group "${key}" apiKey must match ${String(family.credentialRef)}`)
      }
      try {
        apiKeyRef = credentialRef(source.apiKey)
      } catch (error) {
        throw new Error(`${family.ns}: group "${key}" apiKey is not a valid credential reference`, { cause: error })
      }
    }
    groups.set(key, {
      key,
      provider: family.providerOf(key),
      displayName: defaults.displayName,
      enabled: source.enabled ?? false,
      protocol: source.protocol ?? defaults.protocol,
      ...apiKeyRef === undefined ? {} : { apiKeyRef },
      ...effectiveLengths === undefined ? {} : { contextLengths: [...effectiveLengths] },
      showBalance: source.showBalance ?? true,
      replayReasoning: source.replayReasoning ?? false,
      assistantTextReplay: source.assistantTextReplay ?? 'keep',
    })
  }
  const hidden = config.hiddenModels ?? []
  for (const id of hidden) {
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error(`${family.ns}: hiddenModels entries must be non-empty model ids`)
    }
  }
  const recommended = config.recommendedModels ?? family.recommended
  for (const id of recommended) {
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error(`${family.ns}: recommendedModels entries must be non-empty model ids`)
    }
  }
  const contexts = new Map<string, readonly number[]>()
  for (const [id, lengths] of Object.entries(config.modelContexts ?? {})) {
    if (id.length === 0) {
      throw new Error(`${family.ns}: modelContexts keys must be non-empty model ids`)
    }
    if (lengths.length === 0) {
      throw new Error(`${family.ns}: modelContexts["${id}"] must list at least one length`)
    }
    if (lengths.some(length => !Number.isSafeInteger(length) || length <= 0)) {
      throw new Error(`${family.ns}: modelContexts["${id}"] lengths must be positive integers`)
    }
    if (new Set(lengths).size !== lengths.length) {
      throw new Error(`${family.ns}: modelContexts["${id}"] lengths must not repeat`)
    }
    // Keyed by identity so an alias spelling configures the same model once.
    contexts.set(identityKey(id, family.registry), [...lengths].sort((left, right) => left - right))
  }
  const vision = new Map<string, boolean>()
  for (const [id, accepts] of Object.entries(config.visionModels ?? {})) {
    if (id.length === 0) {
      throw new Error(`${family.ns}: visionModels keys must be non-empty model ids`)
    }
    if (typeof accepts !== 'boolean') {
      throw new Error(`${family.ns}: visionModels["${id}"] must be a boolean`)
    }
    // Keyed by identity so a choice made against either alias spelling of one
    // model configures it once.
    vision.set(identityKey(id, family.registry), accepts)
  }
  return {
    family,
    baseURL,
    streamIdleTimeoutMs,
    groups,
    modelContexts: contexts,
    visionModels: vision,
    hiddenModels: new Set(hidden),
    // Aliases collapse to one key, so picking either id recommends the model
    // once and the ordering cannot depend on which spelling was stored.
    recommendedModels: [...new Set(recommended.map(id => identityKey(id, family.registry)))],
  }
}

/**
 * Whether a WHATWG-normalized hostname names the local loopback authority.
 * The harness keeps its own copy package-internal, so this mirrors it: the
 * judgement must run on the parsed hostname (WHATWG rewrites `2130706433` and
 * `0x7f000001` to `127.0.0.1`), never on the raw string.
 */
function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

/**
 * Validate one endpoint root. Plain http is allowed only for a loopback host,
 * so the stored bearer token can never be sent in the clear to a remote
 * endpoint; userinfo, query strings, and fragments are refused because they
 * let a value that reads as one endpoint actually resolve to another.
 * @param raw - endpoint root, already stripped of trailing slashes and `/v1`.
 * @returns the same string once every bound passes.
 */
export function resolveBaseURL(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('protocom-api: baseURL must be an absolute http(s) URL')
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error('protocom-api: baseURL must not carry userinfo')
  }
  if (url.search !== '' || url.hash !== '') {
    throw new Error('protocom-api: baseURL must not carry a query string or fragment')
  }
  if (url.protocol === 'http:' ? !isLoopbackHostname(url.hostname) : url.protocol !== 'https:') {
    throw new Error('protocom-api: baseURL must use https; plain http is allowed only for a loopback host')
  }
  return raw
}
