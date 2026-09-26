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

/**
 * The Loader entry id this plugin's settings form is keyed by; mirrors
 * `PROTOCOM_NS` on the Host and the `id` in `cordis.patch.yml`.
 *
 * Every family addresses this ONE entry. 1.7 keys a form by profile row, and a
 * plugin has exactly one Config, so the four sections cannot each own a
 * namespace — a family that still asked for `'opencode-go'` would be told
 * `settings namespace unavailable`, and one that wrote an unrooted path into
 * the shared entry would be refused for addressing a non-volatile field.
 */
export const PROTOCOM_ENTRY_ID = 'protocom-api'

/** The family facts a settings read or write needs. */
export interface OperationsScope {
  /** Model-discovery registration key; the family's own key space. */
  readonly ns: string
  /** Field of the shared Config this family occupies. */
  readonly sectionKey: string
}

/**
 * Bind one section's Host operations to the plugin's Remote surface.
 *
 * Reads and writes go to the single Loader entry, with the family's
 * `sectionKey` as the path root; model discovery keeps using `ns`, because
 * discovery keys live in their own map and are registered per family. The
 * section component above this boundary keeps working in section-relative
 * paths, so the 1.7 nesting stays in exactly one place.
 * @param ctx - the plugin's context, which declares `remote.credentials`,
 * `remote.llm`, and `remote.settings` in its own `inject`.
 * @param scope - the family's discovery key and Config section.
 * @returns the operations one provider section invokes.
 */
export function createProtocomOperations(
  ctx: ClientContext,
  scope: OperationsScope = { ns: PROTOCOM_ENTRY_ID, sectionKey: 'protocom' },
): ProtocomOperations {
  const { ns: discoveryNs, sectionKey } = scope
  /** Root a section-relative path at this family's field of the shared entry. */
  const rooted = (path: readonly string[]): string[] => [sectionKey, ...path]
  return {
    describeSettings: async () => {
      const response = await ctx.remote.settings.describe()
      if (!response.ok) return undefined
      const entry = response.value.namespaces.find((ns: SettingsNamespaceView) => ns.ns === PROTOCOM_ENTRY_ID)
      if (entry === undefined) return undefined
      // The view carries the WHOLE Config, so hand the caller only its own
      // section. Without this the section reads `value.groups` off a root that
      // holds `value.protocom.groups` and silently renders every default --
      // which looks like a working panel showing a disabled group.
      const value = entry.value
      const section = value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)[sectionKey]
        : undefined
      return { ...entry, value: section ?? {} }
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
      const pointed = await ctx.remote.settings.mutate(PROTOCOM_ENTRY_ID, [
        { op: 'set', path: rooted(['groups', group, 'apiKey']), value: ref },
        { op: 'set', path: rooted(['groups', group, 'enabled']), value: true },
      ], expectedRevision)
      return pointed.ok ? undefined : pointed.error.message
    },
    writeSettings: async (ops, expectedRevision) => {
      // The caller builds section-relative paths; rooting them here is what
      // keeps the section component unaware that its fields moved one level
      // down into a shared Config.
      const rootedOps = ops.map(op => ({ ...op, path: rooted(op.path) }))
      const response = await ctx.remote.settings.mutate(PROTOCOM_ENTRY_ID, rootedOps, expectedRevision)
      if (response.ok) return { kind: 'written', view: response.value }
      const { code, message } = response.error
      return code === 'settings/conflict' ? { kind: 'conflict', message } : { kind: 'refused', message }
    },
    discoverModels: async (request) => {
      // Discovery keys are their own map on the Host, registered per family, so
      // this one still names the family rather than the shared entry. Using the
      // entry id here would collide all four families on one registration.
      const response = await ctx.remote.llm.discoverModels(discoveryNs, request)
      return response.ok
        ? { kind: 'found', models: response.value }
        : { kind: 'refused', message: response.error.message }
    },
  }
}
