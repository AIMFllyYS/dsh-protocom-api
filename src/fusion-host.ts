/**
 * Fusion dual-model routing — the Host half.
 *
 * Mounts the `model-fusion` settings section and turns its live value into one
 * request rule: a request whose Agent belongs to a subagent Session is pinned
 * to the coder seat. The main conversation is deliberately NOT rewritten here —
 * the leader seat is soft-applied by the editor through the ordinary
 * `agent-default-model`/session selection surfaces, so a composer choice can
 * still override it, which is what "Fusion is a chosen pair, not a lock" means.
 *
 * The rewrite rides `agent/request`, the waterfall that runs BEFORE
 * `llm.prepareCall()`: the replacement therefore goes through capability
 * validation for the coder route and is what the durable `request/header`
 * records. That single property is why auxiliary calls need no separate rule —
 * compaction resolves its target as configured pair, then the last logged
 * header, then agent options, so a child's summary follows the coder route that
 * this rule logged. Rewriting at `llm/stream` instead would dispatch to one
 * route while the logged header named another, and the context window would
 * have been computed for the wrong model.
 *
 * @module dsh-protocom-api/fusion-host
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-agent'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'
import { FUSION_NS, resolveFusion } from './fusion.ts'
import type { FusionConfig, ResolvedFusion } from './fusion.ts'
import { FusionSection } from './config.ts'

/** The two durable lineage facts the request rule reads from one Agent's Session. */
export interface SubagentSessionFacts {
  /** Coarse product classification; `'subagent'` marks a delegated child. */
  origin: 'subagent' | undefined
  /** Whether this child inherited a parent-log prefix (a fork rather than a spawn). */
  isSeeded: boolean
}

/**
 * Read the lineage facts a rewrite needs. Typed structurally — the rule only
 * ever reads these two header fields — so it stays testable against a plain
 * object and independent of the Agent class.
 * @param session - the Agent's Session, or anything exposing its header.
 * @returns the durable lineage facts; an unknown shape reads as a root session.
 */
export function subagentFacts(
  session: { readonly header?: { readonly origin?: 'subagent'; readonly isSeeded?: boolean } } | undefined,
): SubagentSessionFacts {
  return { origin: session?.header?.origin, isSeeded: session?.header?.isSeeded ?? false }
}

/**
 * Apply the Fusion coder pin to one resolved call configuration.
 *
 * A seat's absent effort CLEARS the inherited one rather than leaving it: the
 * parent's effort id belongs to the parent's own model vocabulary, and the
 * harness makes the same choice when a delegation changes the route
 * (`resolveChildAgentOptions` deletes it). Every other field — notably
 * `maxTokens`, `temperature`, and `stop` — is preserved, because those are
 * properties of the call rather than of the route.
 * @param resolved - the configuration the loop resolved.
 * @param fusion - the live section value.
 * @param facts - the requesting Agent's lineage.
 * @returns the configuration to use; `resolved` itself when no rule applies.
 */
export function fuseCallConfig(
  resolved: LlmCallConfig,
  fusion: ResolvedFusion,
  facts: SubagentSessionFacts,
): LlmCallConfig {
  if (!fusion.enabled) return resolved
  if (facts.origin !== 'subagent') return resolved
  // A fork inherits its parent's prefix, so the harness deliberately keeps its
  // route for KV-cache reuse; pinning it trades that reuse for uniformity, and
  // the switch makes the trade the deployment's own choice.
  if (facts.isSeeded && !fusion.includeForks) return resolved
  const coder = fusion.coder
  if (coder === undefined) return resolved
  const effort = coder.reasoningEffort === undefined ? undefined : ReasoningEffortId(coder.reasoningEffort)
  if (resolved.provider === coder.provider
    && resolved.model === coder.model
    && resolved.reasoningEffort === effort) return resolved
  const { reasoningEffort: _inherited, ...rest } = resolved
  return {
    ...rest,
    provider: coder.provider,
    model: coder.model,
    ...effort === undefined ? {} : { reasoningEffort: effort },
  }
}

/** Live, memoized access to the section one mount owns. */
export interface FusionSource {
  /** The current resolved value, re-resolved only when the snapshot identity moved. */
  current(): ResolvedFusion
  /** The live stored section, as an editor would read it back. */
  raw(): FusionConfig
}

/**
 * Mount Fusion on one Host context: install the section, then apply its rule to
 * every agent's request.
 *
 * The listener is `global` so it sees agents created in any scope — subagent
 * children run in their own scope, and an ancestor listener is the only place
 * all of them pass through — and `prepend` so it sits at the outside of the
 * chain: its `await next()` therefore observes every other listener's decision
 * and takes the final word. A listener registered later with `prepend` would
 * wrap this one; no shipped component performs a competing `agent/request`
 * route rewrite (model selection resolves through agent options, which this
 * rule intentionally overrides).
 * @param ctx - the plugin's Host context.
 * @param base - the composition entry used before settings resolve.
 * @returns the live source, for tests and for the client-facing helpers.
 */
export function mountFusion(ctx: Context, base: FusionConfig): FusionSource {
  let source: () => FusionConfig = () => base
  let lastRaw: FusionConfig | undefined
  let lastGood: ResolvedFusion | undefined
  const current = (): ResolvedFusion => {
    const raw = source()
    if (raw === lastRaw && lastGood !== undefined) return lastGood
    try {
      const next = resolveFusion(raw)
      lastRaw = raw
      lastGood = next
      return next
    } catch (error) {
      // Static composition resolves before anything registers, so this branch
      // only sees a live document failing a beyond-schema bound: keep serving
      // the last good rule and say so once per bad snapshot.
      if (lastGood === undefined) throw error
      lastRaw = raw
      ctx.logger.error(`${FUSION_NS}: keeping the last good configuration after an invalid settings section`)
      ctx.logger.error(error)
      return lastGood
    }
  }
  current()

  ctx.on('agent/request', async ({ agent }, next): Promise<LlmCallConfig> => {
    const resolved = await next()
    return fuseCallConfig(resolved, current(), subagentFacts(agent.session))
  }, { global: true, prepend: true })

  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, FUSION_NS, FusionSection, base, {
      setSource: (next) => { source = next },
      // Every consumer reads through `current()`, so its memoization is the
      // only work a committed change needs; no registration-level fact to rebuild.
      onChange: () => {},
      // The cross-field rule — enabling needs BOTH seats — is not expressible in
      // the schema, so it is enforced here, at the write that would store it.
      // Without this hook the section would commit and the rule would only fail
      // later, inside a request, where the deployment reads as silently unused.
      validate: (value) => { resolveFusion(value) },
    })
  })

  return { current, raw: () => source() }
}
