/**
 * Plugin config, validated by the same-named schemastery schema and doubling
 * as the `protocom-api` settings-section shape. The `groups` dict is keyed by
 * the four fixed group keys; each group becomes one provider route
 * (`protocom-<key>`) when enabled, with its own credential reference.
 *
 * @module dsh-protocom-api/config
 */

import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { GROUP_DEFAULTS, GROUP_KEYS, providerOf } from './groups.ts'
import { DEFAULT_RECOMMENDED, identityKey } from './model-registry.ts'

export { GROUP_DEFAULTS, GROUP_KEYS, groupOf, providerOf } from './groups.ts'
export type { GroupKey, GroupReasoning, Protocol } from './groups.ts'
import type { GroupKey, Protocol } from './groups.ts'

/** Protocom official API endpoint base. */
export const DEFAULT_BASE_URL = 'https://relay.protocom.org'

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
}

/** Plugin configuration: the endpoint base plus the four group profiles. */
export interface Config {
  /** Endpoint base; `/v1` suffix and trailing slashes are normalized away. */
  baseURL?: string
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
   * uses the plugin's shipped recommendation. This orders the menu and nothing
   * else: a model left off the list stays fully selectable below the picks.
   */
  recommendedModels?: string[]
}

const group: z<GroupConfig> = z.object({
  enabled: z.boolean().default(false),
  apiKey: z.string().role('credential-ref'),
  protocol: z.union(['chat-completions', 'responses']),
  contextLengths: z.array(z.number().step(1).min(1)),
  showBalance: z.boolean().default(true),
})

/** Runtime schema for {@link Config}. */
export const Config: z<Config> = z.object({
  baseURL: z.string().default(DEFAULT_BASE_URL),
  groups: z.dict(group).default({}),
  hiddenModels: z.array(z.string()).default([]),
  recommendedModels: z.array(z.string()).default([...DEFAULT_RECOMMENDED]),
})

/** Validated per-group facts with every adapter-owned default resolved. */
export interface ResolvedGroup {
  /** Group key and the `groups` dict key. */
  key: GroupKey
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
}

/**
 * One resolution's complete connection facts. The base URL and every group
 * resolve together, so a rejected snapshot never pairs a new endpoint with an
 * older generation's group state.
 */
export interface ResolvedProtocomOptions {
  /** Endpoint root without trailing slashes or a `/v1` suffix. */
  baseURL: string
  /** All four groups in fixed order; `enabled` gates route registration. */
  groups: ReadonlyMap<GroupKey, ResolvedGroup>
  /** Upstream ids the model menu must not offer. Empty means the whole catalog. */
  hiddenModels: ReadonlySet<string>
  /** Upstream ids that lead the model menu, most preferred first. */
  recommendedModels: readonly string[]
}

/**
 * The one explicit resolve step from raw config to validated connection
 * facts. Programmatic construction may bypass Schemastery normalization, so
 * every bound is re-judged here.
 * @param config - raw plugin config or resolved settings snapshot.
 * @returns validated connection facts for all four groups.
 */
export function resolveAdapterOptions(config: Config): ResolvedProtocomOptions {
  const baseURL = (config.baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, '').replace(/\/v1$/, '')
  if (!/^https?:\/\//.test(baseURL)) {
    throw new Error('protocom-api: baseURL must be an http(s) URL')
  }
  const supplied = config.groups ?? {}
  for (const key of Object.keys(supplied)) {
    if (!(GROUP_KEYS as readonly string[]).includes(key)) {
      throw new Error(`protocom-api: unknown group "${key}"; expected one of ${GROUP_KEYS.join(', ')}`)
    }
  }
  const groups = new Map<GroupKey, ResolvedGroup>()
  for (const key of GROUP_KEYS) {
    const source: GroupConfig = supplied[key] ?? {}
    const defaults = GROUP_DEFAULTS[key]
    if (source.contextLengths !== undefined) {
      if (source.contextLengths.some(length => !Number.isSafeInteger(length) || length <= 0)) {
        throw new Error(`protocom-api: group "${key}" contextLengths must be positive integers`)
      }
      if (new Set(source.contextLengths).size !== source.contextLengths.length) {
        throw new Error(`protocom-api: group "${key}" contextLengths must not contain duplicates`)
      }
    }
    let apiKeyRef: CredentialRef | undefined
    if (source.apiKey !== undefined) {
      try {
        apiKeyRef = credentialRef(source.apiKey)
      } catch (error) {
        throw new Error(`protocom-api: group "${key}" apiKey is not a valid credential reference`, { cause: error })
      }
    }
    groups.set(key, {
      key,
      provider: providerOf(key),
      displayName: defaults.displayName,
      enabled: source.enabled ?? false,
      protocol: source.protocol ?? defaults.protocol,
      ...apiKeyRef === undefined ? {} : { apiKeyRef },
      ...source.contextLengths === undefined ? {} : { contextLengths: [...source.contextLengths] },
      showBalance: source.showBalance ?? true,
    })
  }
  const hidden = config.hiddenModels ?? []
  for (const id of hidden) {
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('protocom-api: hiddenModels entries must be non-empty model ids')
    }
  }
  const recommended = config.recommendedModels ?? DEFAULT_RECOMMENDED
  for (const id of recommended) {
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('protocom-api: recommendedModels entries must be non-empty model ids')
    }
  }
  return {
    baseURL,
    groups,
    hiddenModels: new Set(hidden),
    // Aliases collapse to one key, so picking either id recommends the model
    // once and the ordering cannot depend on which spelling was stored.
    recommendedModels: [...new Set(recommended.map(identityKey))],
  }
}
