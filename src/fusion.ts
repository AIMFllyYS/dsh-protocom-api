/**
 * Fusion dual-model routing — the browser-safe core.
 *
 * One settings section names two seats: the LEADER that plans and reviews the
 * main conversation, and the CODER that every delegated subagent request is
 * pinned to. This module owns the namespace, the stored shape, and the
 * resolution both halves agree on; `fusion-host.ts` turns a resolved value
 * into the Host-side request rewrite, and the client section edits it.
 *
 * Deliberately import-free, like `family.ts` and `model-registry.ts`: the
 * browser client reads the same descriptors as the Host.
 *
 * @module dsh-protocom-api/fusion
 */

/**
 * Diagnostic label for this feature, and the settings-page cell key.
 *
 * It is NOT a settings namespace: 1.7 keys a form by Loader entry, and this
 * section is the `fusion` field of the plugin's single Config. The name
 * survives because log lines and the sidebar cell still need a stable word for
 * it.
 */
export const FUSION_NS = 'model-fusion'

/**
 * One seat's stored route. `reasoningEffort` is an adapter-owned effort id:
 * an absent value means the model resolves its own default, and which ids are
 * legal is a property of the chosen model, so the editor restricts the list
 * from the live catalog rather than this schema.
 */
export interface FusionSeatConfig {
  provider: string
  model: string
  reasoningEffort?: string
}

/** Stored section shape; every field is optional because Schemastery supplies the defaults. */
export interface FusionConfig {
  /** Whether the routing applies at all (default `false`). */
  enabled?: boolean
  /** Main-conversation seat, soft-applied to the default model and the current Session. */
  leader?: FusionSeatConfig
  /** Delegated-request seat, forced onto every subagent request. */
  coder?: FusionSeatConfig
  /** Whether fork-type subagents (seeded children) are pinned too (default `true`). */
  includeForks?: boolean
  /** Whether enabling also installs the leader seat as the default and current model (default `true`). */
  applyLeader?: boolean
}

/** One seat after validation: both route fields are present and non-empty. */
export interface ResolvedFusionSeat {
  provider: string
  model: string
  reasoningEffort?: string
}

/**
 * The section as the Host acts on it. A seat stays absent only while the
 * routing is disabled and that seat is unset; enabling requires both, so the
 * rewrite can never run with half a route.
 */
export interface ResolvedFusion {
  enabled: boolean
  leader?: ResolvedFusionSeat
  coder?: ResolvedFusionSeat
  includeForks: boolean
  applyLeader: boolean
}

/** Reject an empty or untrimmed effort id, which no adapter vocabulary carries. */
function resolveEffort(name: string, raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  if (raw.length === 0 || raw.trim() !== raw) {
    throw new Error(`${FUSION_NS}: the ${name} seat reasoningEffort must be a non-empty effort id`)
  }
  return raw
}

/**
 * Validate one seat. A seat with no provider, model, and effort is "unset"
 * rather than invalid, because Schemastery normalizes an absent seat to an
 * empty object; naming only one half of a route is always a mistake.
 * @param name - which seat this is, for the refusal message.
 * @param seat - the stored seat, if any.
 * @returns the validated seat, or undefined when the seat is unset.
 */
export function resolveFusionSeat(name: string, seat: FusionSeatConfig | undefined): ResolvedFusionSeat | undefined {
  const provider = seat?.provider ?? ''
  const model = seat?.model ?? ''
  const effort = resolveEffort(name, seat?.reasoningEffort)
  if (provider === '' && model === '' && effort === undefined) return undefined
  if (provider === '' || model === '') {
    throw new Error(`${FUSION_NS}: the ${name} seat needs both a provider and a model`)
  }
  return { provider, model, ...effort === undefined ? {} : { reasoningEffort: effort } }
}

/**
 * The one explicit resolve step from a stored section to the facts the Host
 * routes on. Enabling without both seats is refused here rather than at
 * request time, so an unusable configuration fails at its write.
 * @param config - raw section or resolved settings snapshot.
 * @returns the validated routing facts.
 */
export function resolveFusion(config: FusionConfig): ResolvedFusion {
  const enabled = config.enabled ?? false
  const leader = resolveFusionSeat('leader', config.leader)
  const coder = resolveFusionSeat('coder', config.coder)
  if (enabled && leader === undefined) throw new Error(`${FUSION_NS}: enabled Fusion requires a leader seat`)
  if (enabled && coder === undefined) throw new Error(`${FUSION_NS}: enabled Fusion requires a coder seat`)
  return {
    enabled,
    ...leader === undefined ? {} : { leader },
    ...coder === undefined ? {} : { coder },
    includeForks: config.includeForks ?? true,
    applyLeader: config.applyLeader ?? true,
  }
}

/**
 * Whether two seats name the same route and effort — the editor's dirty check,
 * where an absent effort and an empty one are the same "model default".
 * @param left - one seat, if any.
 * @param right - the other seat, if any.
 * @returns whether both seats are interchangeable.
 */
export function sameFusionSeat(left: FusionSeatConfig | undefined, right: FusionSeatConfig | undefined): boolean {
  if (left === undefined || right === undefined) return left === right
  return left.provider === right.provider
    && left.model === right.model
    && (left.reasoningEffort ?? undefined) === (right.reasoningEffort ?? undefined)
}
