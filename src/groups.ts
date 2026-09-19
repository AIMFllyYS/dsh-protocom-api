/**
 * The four Protocom official API groups and their shipped defaults. Pure
 * metadata with zero imports: the Host config schema and the browser client
 * both read from here.
 *
 * @module dsh-protocom-api/groups
 */

/** Wire protocol a group's models speak. */
export type Protocol = 'chat-completions' | 'responses'

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
}>> = {
  aggregate: { displayName: 'Protocom Aggregate', protocol: 'chat-completions' },
  codex: {
    displayName: 'Protocom Codex',
    protocol: 'responses',
    reasoning: { efforts: ['minimal', 'low', 'medium', 'high', 'xhigh'], defaultEffort: 'medium' },
  },
  stepfun: { displayName: 'Protocom StepFun', protocol: 'chat-completions' },
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
