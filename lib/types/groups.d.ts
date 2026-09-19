/**
 * The four Protocom official API groups and their shipped defaults. Pure
 * metadata with zero imports: the Host config schema and the browser client
 * both read from here.
 *
 * @module dsh-protocom-api/groups
 */
/** Wire protocol a group's models speak. */
export type Protocol = 'chat-completions' | 'responses';
/** The four groups this plugin serves; the config dict key IS the group. */
export declare const GROUP_KEYS: readonly ["aggregate", "codex", "stepfun", "grok"];
/** One of {@link GROUP_KEYS}. */
export type GroupKey = (typeof GROUP_KEYS)[number];
/** Group-owned reasoning vocabulary used when a model declares none of its own. */
export interface GroupReasoning {
    efforts: readonly string[];
    defaultEffort?: string;
}
/** Per-group shipped defaults. */
export declare const GROUP_DEFAULTS: Readonly<Record<GroupKey, {
    displayName: string;
    protocol: Protocol;
    reasoning?: GroupReasoning;
}>>;
/** The provider route one group registers under. */
export declare function providerOf(key: GroupKey): string;
/** The group behind one provider route, or `undefined` for a foreign route. */
export declare function groupOf(provider: string): GroupKey | undefined;
/** The conventional credential reference one group's API key is stored under. */
export declare function defaultKeyRef(key: GroupKey): string;
