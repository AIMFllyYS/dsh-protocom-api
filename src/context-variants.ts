/**
 * Context-variant id codec. A variant entry's model id is
 * `<upstreamId>::ctx@<tokens>`; the suffix rides through the harness as an
 * opaque model id and is stripped back to the upstream id at dispatch.
 *
 * @module dsh-protocom-api/context-variants
 */

const MARKER = '::ctx@'

/** Encode one upstream id and context length into a variant model id. */
export function encodeVariantId(upstreamId: string, tokens: number): string {
  return `${upstreamId}${MARKER}${tokens}`
}

/**
 * Split one model id into its upstream id and variant length. An absent or
 * malformed suffix (non-numeric, non-positive) means "no variant": the whole
 * id is the upstream id, so a literal marker inside an upstream id cannot
 * corrupt dispatch.
 */
export function decodeVariantId(id: string): { upstreamId: string; contextWindow?: number } {
  const at = id.lastIndexOf(MARKER)
  if (at === -1) return { upstreamId: id }
  const tokens = Number(id.slice(at + MARKER.length))
  if (!Number.isSafeInteger(tokens) || tokens <= 0) return { upstreamId: id }
  return { upstreamId: id.slice(0, at), contextWindow: tokens }
}

/** The upstream id a request must name, whatever variant suffix arrived. */
export function stripVariantId(id: string): string {
  return decodeVariantId(id).upstreamId
}

/**
 * How far apart two lengths may be and still name the same budget.
 *
 * Providers publish the same capacity in two bases -- 200K is 204800 binary or
 * 200000 decimal, 1M is 1048576 or 1000000 -- and the gap grows with the
 * square of the radix ratio: 1024/1000 = 2.4% at the K scale, (1024/1000)^2 =
 * 4.86% at the M scale. Eight percent covers both with margin.
 *
 * The band is unambiguous because every shipped ladder spaces its rungs far
 * wider: 200K to 256K is 28%, 256K to 400K is 56%, 400K to 1M is 156%. There is
 * no value that could match two rungs.
 */
const SAME_BUDGET_TOLERANCE = 0.08

/**
 * Whether a model's capacity falls within the ceiling a ladder sets.
 *
 * The ladder's top rung is the deployment's ceiling for that group. A model may
 * always be used at its own capacity while that capacity is at or below the
 * ceiling; a ladder that deliberately stops BELOW a model's window is how a
 * deployment caps a group, and is not overridden.
 *
 * This is what separates the two cases that look alike. A group offering up to
 * 1M must be able to use a 1M model at 1M, whatever base the model states it
 * in. A group offering only 256K has said so on purpose, and a 1M model there
 * stays at 256K.
 * @param contextWindow - the model's own declared capacity.
 * @param configured - the group's ladder.
 * @returns whether the window is within what the ladder allows.
 */
export function withinLadderCeiling(
  contextWindow: number,
  configured: readonly number[] | undefined,
): boolean {
  if (configured === undefined || configured.length === 0) return true
  return contextWindow <= Math.max(...configured) * (1 + SAME_BUDGET_TOLERANCE)
}

/** Whether two lengths name the same budget, allowing for the two bases. */
export function sameBudget(left: number, right: number): boolean {
  const smaller = Math.min(left, right)
  if (smaller <= 0) return left === right
  return Math.abs(left - right) / smaller <= SAME_BUDGET_TOLERANCE
}

/**
 * The variant lengths to advertise for one model, or `undefined` for the
 * single default entry with a bare id. Configuration is the switch: without
 * `contextLengths` the model lists exactly as before variants existed. With
 * it, registry-known models are matched against the configured rungs (an empty
 * match degrades to the default entry rather than hiding the model); unknown
 * models take the configured lengths directly.
 *
 * Two things about the matching are deliberate:
 *
 *  - **By budget, not by exact integer.** Matching `configured.includes(length)`
 *    meant a model declaring 1,000,000 could never match a 1,048,576 rung, so
 *    its own window was silently dropped and it was offered only the rungs
 *    below it. Every OpenCode Go model with a decimal window was capped that
 *    way while the binary ones -- Kimi K3 at 1,048,576 -- kept their 1M, which
 *    is precisely how the menu looked broken for some models and not others.
 *
 *  - **The MODEL's figure is emitted, not the configured one.** They can differ
 *    by up to the tolerance, and the model's own number is the only one it can
 *    actually honour. Advertising the rung instead is how a model ends up
 *    promised a window it does not have.
 */
export function variantLengths(
  contextOptions: readonly number[] | undefined,
  configured: readonly number[] | undefined,
): number[] | undefined {
  if (configured === undefined || configured.length === 0) return undefined
  if (contextOptions === undefined) return [...new Set(configured)].sort((a, b) => a - b)
  const matched = contextOptions.filter(option => configured.some(rung => sameBudget(rung, option)))
  return matched.length === 0 ? undefined : [...new Set(matched)].sort((a, b) => a - b)
}
