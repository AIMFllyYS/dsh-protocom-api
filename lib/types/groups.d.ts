/**
 * The four Protocom official API groups and their shipped defaults. Pure
 * metadata with zero imports: the Host config schema and the browser client
 * both read from here.
 *
 * @module dsh-protocom-api/groups
 */
/**
 * Wire protocol a group's models speak.
 *
 * `messages` is the Anthropic Messages wire. It exists because some gateways
 * serve a model on that surface ONLY — Command Code's Claude models declare
 * `/messages` alone and answer 400 if asked on chat-completions — so a family
 * whose registry cannot name this wire would be unable to serve them at all.
 */
export type Protocol = 'chat-completions' | 'responses' | 'messages';
/** Protocom official API endpoint base. */
export declare const DEFAULT_BASE_URL = "https://relay.protocom.org";
/** 1M-token context, the ceiling most current flagships publish. */
export declare const CONTEXT_1M = 1048576;
/** 400K-token context. */
export declare const CONTEXT_400K = 409600;
/** 256K-token context. */
export declare const CONTEXT_256K = 262144;
/** 200K-token context: the floor every model this plugin serves clears. */
export declare const CONTEXT_200K = 204800;
/**
 * The context ladder the picker offers, smallest first: 200K is the floor every
 * model clears, then the two common steps, then the 1M ceiling. A model is only
 * ever offered the steps at or below its own window, so the choice a user makes
 * is always one the model can actually honour.
 */
export declare const CONTEXT_LADDER: readonly number[];
/**
 * Origin of {@link DEFAULT_BASE_URL}: the only origin a stored API key is sent
 * to unless the deployment explicitly confirms a custom endpoint. Lives here,
 * beside the group metadata, so the browser half can read it without pulling in
 * the Host config's dependencies.
 */
export declare const DEFAULT_BASE_URL_ORIGIN: string;
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
    /**
     * Context lengths this group ships with, used when the deployment does not
     * choose its own. Only set where the vendor publishes a fixed ladder: leaving
     * it unset keeps the historical behaviour (one entry at the model's window).
     */
    contextLengths?: readonly number[];
}>>;
/** The provider route one group registers under. */
export declare function providerOf(key: GroupKey): string;
/** The group behind one provider route, or `undefined` for a foreign route. */
export declare function groupOf(provider: string): GroupKey | undefined;
/** The conventional credential reference one group's API key is stored under. */
export declare function defaultKeyRef(key: GroupKey): string;
