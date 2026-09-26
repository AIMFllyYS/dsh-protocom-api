/**
 * The Host reads and writes the Fusion section performs, plus the catalog and
 * session facts its editor renders from. The section receives these callbacks
 * instead of a context, so failure codes and Remote namespaces stay in the
 * apply world — the same split `operations.ts` uses for the provider panels.
 *
 * Both namespaces are reached through the shared settings scope rather than
 * `remote.settings` directly: the scope carries the revision fence, folds its
 * answer back into the describe mirror every other surface reads, and queues
 * writes in order, which is exactly the concurrency behavior a two-namespace
 * save needs.
 *
 * The model catalog's shape is declared here rather than imported. The
 * session-controller client package publishes it as an ambient augmentation of
 * `ctx.remote`, and depending on that package pulls a second copy of the
 * harness type graph into this standalone plugin (it re-declares `ClientRemote`
 * and broke the settings/credentials namespaces when tried). These are
 * structural declarations of what the wire schema fixes, not a reimplementation.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
import type { en } from './locale.ts'

/** Translate one locale key. Mirrors the `Translator` the sections declare. */
type Translator = (key: keyof typeof en) => string

/** One adapter-owned reasoning effort a model route offers. */
export interface FusionEffort {
  readonly id: string
  readonly name: string
}

/** One model inside its provider group, as the Host catalog reports it. */
export interface FusionCatalogModel {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly reasoning?: { readonly efforts: readonly FusionEffort[]; readonly defaultEffort?: string }
}

/** One provider and its routable models. */
export interface FusionProviderGroup {
  readonly id: string
  readonly name: string
  readonly models: readonly FusionCatalogModel[]
}

/** One provider whose catalog lookup failed; its other groups stay usable. */
export interface FusionCatalogFailure {
  readonly id: string
  readonly name: string
  readonly message: string
}

/** The Host-generation model catalog an editor picks from. */
export interface FusionCatalog {
  readonly groups: readonly FusionProviderGroup[]
  readonly failures: readonly FusionCatalogFailure[]
  readonly routableProviders: readonly string[]
}

/** What one catalog load answered. */
export type FusionCatalogOutcome =
  | { readonly kind: 'found'; readonly catalog: FusionCatalog }
  | { readonly kind: 'refused'; readonly message: string }

/** What one settings write answered. */
export type FusionWriteOutcome =
  | { readonly kind: 'written' }
  | { readonly kind: 'conflict'; readonly message: string }
  | { readonly kind: 'refused'; readonly message: string }

/** One seat's route, in the shape every surface here passes around. */
export interface FusionSeat {
  provider: string
  model: string
  reasoningEffort?: string
}

/** A seat as the stored (and possibly redacted) section carries it. */
export interface FusionStoredSeat {
  provider?: string
  model?: string
  reasoningEffort?: string
}

/** The stored section value; every field is optional before the first save. */
export interface FusionStoredValue {
  enabled?: boolean
  leader?: FusionStoredSeat
  coder?: FusionStoredSeat
  includeForks?: boolean
  applyLeader?: boolean
}

/**
 * The editor's staged state: the stored section with defaults resolved. A seat
 * is `| undefined` rather than merely optional because clearing a seat is a
 * real edit — picking "Not set" must be expressible, not silently ignored.
 */
export interface FusionDraft {
  enabled: boolean
  leader: FusionSeat | undefined
  coder: FusionSeat | undefined
  includeForks: boolean
  applyLeader: boolean
}

/** The live view of the section the editor renders and fences against. */
export interface FusionSectionState {
  /** `loading` until the first accepted section arrives. */
  status: 'loading' | 'ready' | 'unavailable'
  value: FusionStoredValue | undefined
  revision: number | undefined
  /** Whether the Host document accepts writes; a memory-mode page does not. */
  writable: boolean
}

/** One Session row, as much of it as the leader soft-apply reads. */
export interface FusionSessionRow {
  readonly sessionId: string
  readonly origin?: 'subagent'
}

/** The Host operations the Fusion section invokes. */
export interface FusionOperations {
  /**
   * Read the live model catalog: every registered provider and the models it
   * can currently serve. This is the same directory the composer's own model
   * picker uses, so a route nobody enabled never appears here.
   */
  loadCatalog(): Promise<FusionCatalogOutcome>
  /** The live `model-fusion` view, revision fence included. */
  section(): FusionSectionState
  /** Observe section changes (local drafts, committed writes, reconnects). */
  subscribe(listener: () => void): () => void
  /** Commit one complete draft as a single revision-fenced mutation. */
  saveFusion(draft: FusionDraft, expectedRevision: number | undefined): Promise<FusionWriteOutcome>
  /**
   * Soft-apply the leader seat: write it as the deployment default for new
   * Sessions, then select it on the current top-level Session. Each half is
   * attempted independently and reported separately, so one failing does not
   * hide the other and neither rolls back the routing that was already saved.
   * @returns the failures that occurred, if any.
   */
  applyLeader(seat: FusionSeat): Promise<string[]>
}

/**
 * The Loader entry id this plugin's settings form is keyed by; mirrors
 * `PROTOCOM_NS` on the Host.
 *
 * 1.7 keys a form by profile row rather than by a namespace the plugin
 * registers, and one entry has exactly one Config. All four sections therefore
 * share this id and are addressed by their path prefix within it — see
 * {@link FUSION_SECTION_PATH}.
 */
export const PROTOCOM_ENTRY_ID = 'protocom-api'

/** Where the Fusion section sits inside that one Config. */
export const FUSION_SECTION_PATH = 'fusion' as const

/**
 * The browser Session service's read face, as far as this section needs it.
 *
 * Declared structurally on purpose. The same `Context.sessions` name is merged
 * by the HOST session package (`SessionStore`, whose `list()` returns an
 * array), so in a project compiling both halves the host declaration wins and
 * the client's real shape cannot be named without the session-controller client
 * package. Reading the one field actually used keeps the faithful part (the id
 * is the shell's current selection, absent in the no-session view) and confines
 * the cast to this accessor.
 */
interface FusionSessionsFace {
  list: { getSnapshot(): { current?: string } }
}

/** Read the shell's current Session id, or undefined in the no-session view. */
function currentSessionId(ctx: ClientContext): string | undefined {
  return (ctx as unknown as { sessions?: FusionSessionsFace }).sessions?.list.getSnapshot().current
}

/**
 * Pick the Session a leader change should apply to: the current one, and only
 * when it is a top-level conversation. A subagent Session is deliberately
 * excluded — addressing one through this Host API activates persisted history
 * outside the parent-continuation path, which the harness refuses, and a
 * subagent belongs on the coder seat anyway.
 * @param rows - the client Session list.
 * @param current - the id the shell currently shows, when any.
 * @returns the id to select a model on, or undefined when none qualifies.
 */
export function leaderTargetSession(
  rows: readonly FusionSessionRow[],
  current: string | undefined,
): string | undefined {
  if (current === undefined) return undefined
  const row = rows.find(candidate => candidate.sessionId === current)
  if (row === undefined) return undefined
  return row.origin === 'subagent' ? undefined : current
}

/**
 * The path operations that write one draft as a complete section.
 *
 * Every path is rooted at the section name because 1.7 addresses fields from
 * the Config root: the form belongs to the entry, and `fusion` is the section
 * inside it rather than a namespace of its own.
 */
export function fusionOps(draft: FusionDraft): SettingsPathOpView[] {
  const path = (...rest: string[]): string[] => [FUSION_SECTION_PATH, ...rest]
  return [
    { op: 'set', path: path('enabled'), value: draft.enabled },
    { op: 'set', path: path('leader'), value: seatValue(draft.leader) },
    { op: 'set', path: path('coder'), value: seatValue(draft.coder) },
    { op: 'set', path: path('includeForks'), value: draft.includeForks },
    { op: 'set', path: path('applyLeader'), value: draft.applyLeader },
  ]
}

/** One seat as a plain JSON object; an unset seat writes as `{}`. */
function seatValue(seat: FusionSeat | undefined): Record<string, string> {
  if (seat === undefined) return {}
  return {
    provider: seat.provider,
    model: seat.model,
    ...seat.reasoningEffort === undefined ? {} : { reasoningEffort: seat.reasoningEffort },
  }
}

/**
 * Bind the Fusion section's Host operations.
 * @param ctx - the plugin's context, which declares `remote.session` and
 * `configForms` in its own `inject`.
 * @param t - the section's translator. The `applyLeader` outcomes that are not
 * failures but still need saying -- "there is no session to apply this to" --
 * are prose, so the wording stays with the locale rather than here.
 */
export function createFusionOperations(ctx: ClientContext, t: Translator): FusionOperations {
  // 1.7 names a form after its Loader entry, and this plugin has one entry
  // holding all four sections. The Fusion fields are therefore a PATH into that
  // form rather than a namespace of their own, which is why every op below is
  // rooted at FUSION_SECTION_PATH.
  const scope = ctx.configForms.get<FusionStoredValue>(PROTOCOM_ENTRY_ID)
  const session = (ctx.remote as { session: {
    modelCatalog(): Promise<{ ok: true; value: FusionCatalog } | { ok: false; error: { message: string } }>
    list(request?: Record<string, never>): Promise<{ ok: true; value: { items: FusionSessionRow[] } } | { ok: false; error: { message: string } }>
    selectModel(request: { sessionId: string; provider: string; model: string; reasoningEffort?: string }):
    Promise<{ ok: true } | { ok: false; error: { message: string } }>
  } }).session

  return {
    loadCatalog: async () => {
      const response = await session.modelCatalog()
      return response.ok
        ? { kind: 'found', catalog: response.value }
        : { kind: 'refused', message: response.error.message }
    },
    section: () => {
      const snapshot = scope.getSnapshot()
      return {
        status: snapshot.status,
        value: snapshot.value,
        revision: snapshot.revision,
        writable: snapshot.writable,
      }
    },
    subscribe: listener => scope.subscribe(listener),
    saveFusion: async (draft, expectedRevision) => {
      try {
        await scope.mutate(fusionOps(draft), expectedRevision)
        return { kind: 'written' }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        // The scope rejects a stale fence without a wire call; every other
        // refusal (validation, persistence) is the Host's own diagnosis.
        return /conflict/i.test(message) ? { kind: 'conflict', message } : { kind: 'refused', message }
      }
    },
    applyLeader: async (seat) => {
      const failures: string[] = []
      // No separate write to the deployment default: since 1.7
      // `session.selectModel` persists the deployment default itself, in the
      // background, through the harness's own service. Writing a settings
      // namespace for it is not merely redundant -- that namespace no longer
      // exists, because the default model became a service rather than a
      // section an extension could address.
      const current = currentSessionId(ctx)
      if (current === undefined) {
        // Reporting beats a silent pass. The reasoning above explains why no
        // separate default write happens -- it would be redundant when
        // selectModel runs -- but that argument only holds if selectModel runs,
        // and from a page with no session open it never does. Returning success
        // here told the operator the leader seat was applied when nothing had
        // been touched, in the one screen where they are most likely to set it.
        failures.push(t('applyLeaderNoSession'))
        return failures
      }
      const listed = await session.list({})
      if (!listed.ok) {
        failures.push(listed.error.message)
        return failures
      }
      const target = leaderTargetSession(listed.value.items, current)
      if (target === undefined) {
        // The current session is a subagent, which this deliberately skips so
        // persisted history is not activated outside the parent-continuation
        // path. Saying so beats reporting a success that did not happen.
        failures.push(t('applyLeaderSubagent'))
        return failures
      }
      const selected = await session.selectModel({
        sessionId: target,
        provider: seat.provider,
        model: seat.model,
        ...seat.reasoningEffort === undefined ? {} : { reasoningEffort: seat.reasoningEffort },
      })
      if (!selected.ok) failures.push(selected.error.message)
      return failures
    },
  }
}
