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
 * package.
 *
 * Two details here are load-bearing. The reach is `ctx.get`, not
 * `ctx.sessions`: an undeclared property read throws even once the service is
 * active, and `sessions` is deliberately not among this section's declared
 * dependencies, because a deployment without it must still get a working Fusion
 * editor -- only the soft-apply needs a Session at all. And the current session
 * is the row the shell retains for its main view; the snapshot has no `current`
 * field, only `ids`, `byId`, `phase` and `projectionsBySession`.
 */
interface FusionSessionsFace {
  list: { getSnapshot(): { byId?: Record<string, FusionSessionListRow> } }
}

/** One row of the client Session list, as much as the shell selection reads. */
interface FusionSessionListRow {
  readonly id?: string
  /** Which surfaces retain this Session; the shell's own view is `mainView`. */
  readonly retainedBy?: { readonly mainView?: number }
}

/** Read the shell's current Session id, or undefined in the no-session view. */
function currentSessionId(ctx: ClientContext): string | undefined {
  const sessions = (ctx as unknown as { get(name: string): unknown }).get('sessions') as
    FusionSessionsFace | undefined
  const byId = sessions?.list.getSnapshot().byId
  if (byId === undefined) return undefined
  // `retainedBy` counts live viewers, and the main view's count is what marks
  // the conversation currently on screen. Reading a `current` field instead --
  // a field this snapshot does not have -- made the cast above yield undefined
  // on every page, so `applyLeader` reported "no session" no matter what was
  // open and the leader seat was never soft-applied.
  return Object.values(byId).find(row => (row.retainedBy?.mainView ?? 0) > 0)?.id
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

/** The config-form face this section writes the Fusion path through. */
interface FusionConfigFormsFace {
  get<T>(entryId: string): {
    getSnapshot(): { status: FusionSectionState['status']; value?: T; revision?: number; writable: boolean }
    subscribe(listener: () => void): () => void
    /**
     * Resolves `false` when the Host REFUSED the mutation (validation, a stale
     * revision, or a page whose persistence is memory-only) — it does not
     * reject for those. Awaiting it and discarding the result therefore reports
     * a refused write as a successful one.
     */
    mutate(ops: SettingsPathOpView[], expectedRevision: number | undefined): Promise<boolean>
  }
}

/** The `remote.session` namespace, as much of it as the soft-apply reads. */
interface FusionRemoteSessionFace {
  modelCatalog(): Promise<{ ok: true; value: FusionCatalog } | { ok: false; error: { message: string } }>
  list(request?: Record<string, never>): Promise<{ ok: true; value: { items: FusionSessionRow[] } } | { ok: false; error: { message: string } }>
  selectModel(request: { sessionId: string; provider: string; model: string; reasoningEffort?: string }):
  Promise<{ ok: true } | { ok: false; error: { message: string } }>
}

/**
 * Bind the Fusion section's Host operations.
 * @param ctx - the Fusion section's context. It must have DECLARED both
 * `remote.session` and `configForms` in its own `inject` (the caller in
 * `index.ts` does this on a scoped fiber): cordis throws
 * `cannot get property "…" without inject` for an undeclared read, even once
 * the service is fully active, and a Remote namespace is mounted late by an
 * async Host handshake, so a probe taken before that mount both reads
 * `undefined` and is illegal. Declaring the dependency is what makes these two
 * reads legal, and is also why this factory must be constructed only from
 * inside that scoped callback.
 * @param t - the section's translator. The `applyLeader` outcomes that are not
 * failures but still need saying -- "there is no session to apply this to" --
 * are prose, so the wording stays with the locale rather than here.
 */
export function createFusionOperations(ctx: ClientContext, t: Translator): FusionOperations {
  // 1.7 names a form after its Loader entry, and this plugin has one entry
  // holding all four sections. The Fusion fields are therefore a PATH into that
  // form rather than a namespace of their own, which is why every op below is
  // rooted at FUSION_SECTION_PATH.
  const forms = (ctx as unknown as { get(name: string): unknown }).get('configForms') as
    FusionConfigFormsFace
  const scope = forms.get<FusionStoredValue>(PROTOCOM_ENTRY_ID)
  const session = (ctx.remote as { session: FusionRemoteSessionFace }).session

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
        // The refusal path RESOLVES `false` rather than rejecting, so the
        // result must be inspected: discarding it made every refused write --
        // including each save on a memory-persistence page -- report success
        // while the stored section was unchanged.
        const ok = await scope.mutate(fusionOps(draft), expectedRevision)
        if (ok) return { kind: 'written' }
        // A refusal does not say WHICH refusal it was. Comparing the revision
        // the write was fenced against with the one the scope holds after its
        // recovery read separates "this section moved on elsewhere" -- which
        // has a remedy the operator can act on -- from an outright rejection.
        const now = scope.getSnapshot().revision
        return expectedRevision !== undefined && now !== undefined && now !== expectedRevision
          ? { kind: 'conflict', message: t('conflict') }
          : { kind: 'refused', message: t('saveFailed') }
      } catch (error) {
        // Only a thrown transport failure reaches here; a stale revision was
        // already converted to `false` by the scope, so a thrown error is a
        // refusal to report, not a conflict.
        const message = error instanceof Error ? error.message : String(error)
        return { kind: 'refused', message }
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
        // Three unrelated causes used to share one message. Telling an operator
        // their session "is a subagent" when the list simply had not refreshed
        // yet is a wrong diagnosis pointing at the wrong remedy, so each cause
        // now names itself.
        const row = listed.value.items.find(candidate => candidate.sessionId === current)
        failures.push(row === undefined ? t('applyLeaderNotListed') : t('applyLeaderSubagent'))
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
