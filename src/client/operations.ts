/**
 * The Host reads and writes the Protocom section performs, as callbacks built
 * in the plugin body. The section receives these instead of a context: the
 * outcomes name what a card renders, so failure codes and Remote namespaces
 * stay in the apply world.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {
  CredentialInfo,
  LlmDiscoveredModel,
  LlmModelDiscoveryRequest,
  SettingsNamespaceView,
  SettingsPathOpView,
} from '@deepseek-ai/dsh-api-remotes/client'

/** What one namespace write answered. */
export type SettingsWriteOutcome =
  | { readonly kind: 'written'; readonly view: SettingsNamespaceView }
  | { readonly kind: 'conflict'; readonly message: string }
  | { readonly kind: 'refused'; readonly message: string }

/** What one endpoint interrogation answered. */
export type ModelDiscoveryOutcome =
  | { readonly kind: 'found'; readonly models: readonly LlmDiscoveredModel[] }
  | { readonly kind: 'refused'; readonly message: string }

/** The Host operations one provider section invokes (Protocom or OpenCode Go). */
export interface ProtocomOperations {
  /** Read this plugin's redacted settings namespace view. */
  describeSettings(): Promise<SettingsNamespaceView | undefined>
  /** Read credential states for the given references (values never ride). */
  describeCredentials(refs: readonly string[]): Promise<Record<string, CredentialInfo>>
  /**
   * Store one credential literal under its reference, then point the group's
   * `apiKey` field at that reference and enable the group: a saved key means
   * the user intends to use the route, and leaving it disabled strands the
   * next discovery click on a refusal.
   * @returns the refusal message, or undefined once both writes landed.
   */
  storeApiKey(group: string, ref: string, value: string, expectedRevision: number | undefined): Promise<string | undefined>
  /** Apply path operations to this plugin's namespace. */
  writeSettings(ops: SettingsPathOpView[], expectedRevision: number | undefined): Promise<SettingsWriteOutcome>
  /** Ask one group's endpoint what models it serves. */
  discoverModels(request: LlmModelDiscoveryRequest): Promise<ModelDiscoveryOutcome>
}

/** The settings namespace the Protocom family owns (`'opencode-go'` is the Go family's). */
export const SETTINGS_NS = 'protocom-api'

/**
 * Bind one section's Host operations to the plugin's own Remote namespaces.
 * @param ctx - the plugin's context, which declares `remote.credentials`,
 * `remote.llm`, and `remote.settings` in its own `inject`.
 * @param settingsNs - the family's settings namespace: every read, write, and
 * discovery request is scoped to it, so the two families' sections never
 * share state.
 */
export function createProtocomOperations(ctx: ClientContext, settingsNs: string = SETTINGS_NS): ProtocomOperations {
  return {
    describeSettings: async () => {
      const response = await ctx.remote.settings.describe()
      if (!response.ok) return undefined
      return response.value.namespaces.find((ns: SettingsNamespaceView) => ns.ns === settingsNs)
    },
    describeCredentials: async (refs) => {
      const response = await ctx.remote.credentials.describe([...refs])
      return response.ok ? response.value : {}
    },
    storeApiKey: async (group, ref, value, expectedRevision) => {
      const stored = await ctx.remote.credentials.set(ref, value)
      if (!stored.ok) return stored.error.message
      // The settings write is revision-guarded like every other write: without
      // it, a concurrent settings change could be silently overwritten while a
      // security-relevant field (the credential reference) is being set.
      const pointed = await ctx.remote.settings.mutate(settingsNs, [
        { op: 'set', path: ['groups', group, 'apiKey'], value: ref },
        { op: 'set', path: ['groups', group, 'enabled'], value: true },
      ], expectedRevision)
      return pointed.ok ? undefined : pointed.error.message
    },
    writeSettings: async (ops, expectedRevision) => {
      const response = await ctx.remote.settings.mutate(settingsNs, ops, expectedRevision)
      if (response.ok) return { kind: 'written', view: response.value }
      const { code, message } = response.error
      return code === 'settings/conflict' ? { kind: 'conflict', message } : { kind: 'refused', message }
    },
    discoverModels: async (request) => {
      const response = await ctx.remote.llm.discoverModels(settingsNs, request)
      return response.ok
        ? { kind: 'found', models: response.value }
        : { kind: 'refused', message: response.error.message }
    },
  }
}
