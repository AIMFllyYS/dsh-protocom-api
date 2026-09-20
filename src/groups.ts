/**
 * The four Protocom official API groups and their shipped defaults. Pure
 * metadata with zero imports: the Host config schema and the browser client
 * both read from here.
 *
 * @module dsh-protocom-api/groups
 */

/** Wire protocol a group's models speak. */
export type Protocol = 'chat-completions' | 'responses'

/** Protocom official API endpoint base. */
export const DEFAULT_BASE_URL = 'https://relay.protocom.org'

/** 1M-token context, the ceiling most current flagships publish. */
export const CONTEXT_1M = 1_048_576

/** 400K-token context. */
export const CONTEXT_400K = 409_600

/** 256K-token context. */
export const CONTEXT_256K = 262_144

/** 200K-token context: the floor every model this plugin serves clears. */
export const CONTEXT_200K = 204_800

/**
 * The context ladder the picker offers, smallest first: 200K is the floor every
 * model clears, then the two common steps, then the 1M ceiling. A model is only
 * ever offered the steps at or below its own window, so the choice a user makes
 * is always one the model can actually honour.
 */
export const CONTEXT_LADDER: readonly number[] = [CONTEXT_200K, CONTEXT_256K, CONTEXT_400K, CONTEXT_1M]

/**
 * Origin of {@link DEFAULT_BASE_URL}: the only origin a stored API key is sent
 * to unless the deployment explicitly confirms a custom endpoint. Lives here,
 * beside the group metadata, so the browser half can read it without pulling in
 * the Host config's dependencies.
 */
export const DEFAULT_BASE_URL_ORIGIN = new URL(DEFAULT_BASE_URL).origin

/** The four groups this plugin serves; the config dict key IS the group. */
export const GROUP_KEYS = ['aggregate', 'codex', 'stepfun', 'grok'] as const

/** One of {@link GROUP_KEYS}. */
export type GroupKey = (typeof GROUP_KEYS)[number]

/** Group-owned reasoning vocabulary used when a model declares none of its own. */
export interface GroupReasoning {
  efforts: readonly string[]
  defaultEffort?: string
}

/** Per-group shipped defaults. */
export const GROUP_DEFAULTS: Readonly<Record<GroupKey, {
  displayName: string
  protocol: Protocol
  reasoning?: GroupReasoning
  /**
   * Context lengths this group ships with, used when the deployment does not
   * choose its own. Only set where the vendor publishes a fixed ladder: leaving
   * it unset keeps the historical behaviour (one entry at the model's window).
   */
  contextLengths?: readonly number[]
}>> = {
  aggregate: { displayName: 'Protocom Aggregate', protocol: 'chat-completions' },
  codex: {
    displayName: 'Protocom Codex',
    protocol: 'responses',
    reasoning: { efforts: ['minimal', 'low', 'medium', 'high', 'xhigh'], defaultEffort: 'medium' },
  },
  // StepFun: the relay's chat-completions surface is a translation onto
  // StepFun's own Responses API, and that translation is unusable — a replayed
  // assistant message is rendered as a content-part item the upstream refuses
  // ("210 validation errors", loc (..., 'EasyInputMessageParam', 'content',
  // 'str')), so every second turn and every tool round fails with HTTP 400.
  // Verified by request: the same conversation on /v1/responses answers 200,
  // tool calls and inline images included, which is why this group ships that
  // protocol. StepFun also publishes every model at the same four lengths
  // (200K/256K/400K/1M), so the group ships that ladder rather than one entry
  // at a fallback window.
  stepfun: {
    displayName: 'Protocom StepFun',
    protocol: 'responses',
    contextLengths: CONTEXT_LADDER,
  },
  grok: {
    displayName: 'Protocom Grok',
    protocol: 'chat-completions',
    reasoning: { efforts: ['low', 'high'], defaultEffort: 'high' },
  },
}

/** The provider route one group registers under. */
export function providerOf(key: GroupKey): string {
  return `protocom-${key}`
}

/** The group behind one provider route, or `undefined` for a foreign route. */
export function groupOf(provider: string): GroupKey | undefined {
  if (!provider.startsWith('protocom-')) return undefined
  const key = provider.slice('protocom-'.length) as GroupKey
  return (GROUP_KEYS as readonly string[]).includes(key) ? key : undefined
}

/** The conventional credential reference one group's API key is stored under. */
export function defaultKeyRef(key: GroupKey): string {
  return `PROTOCOM_${key.toUpperCase()}_API_KEY`
}
