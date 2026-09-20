/**
 * Plugin config, validated by the same-named schemastery schema and doubling
 * as the `protocom-api` settings-section shape. The `groups` dict is keyed by
 * the four fixed group keys; each group becomes one provider route
 * (`protocom-<key>`) when enabled, with its own credential reference.
 *
 * @module dsh-protocom-api/config
 */
import z from '@deepseek-ai/schemastery';
import type { CredentialRef } from '@deepseek-ai/dsh-credentials';
export { GROUP_DEFAULTS, GROUP_KEYS, groupOf, providerOf } from './groups.ts';
export type { GroupKey, GroupReasoning, Protocol } from './groups.ts';
import type { GroupKey, Protocol } from './groups.ts';
/** Protocom official API endpoint base. */
export declare const DEFAULT_BASE_URL = "https://relay.protocom.org";
/** Configuration for one group; every field is optional in yml. */
export interface GroupConfig {
    /** Whether this group's provider route is active (default `false`). */
    enabled?: boolean;
    /** Credential reference (environment-variable name) resolved per request. */
    apiKey?: string;
    /** Wire protocol override; defaults to the group's shipped protocol. */
    protocol?: Protocol;
    /** Context lengths offered as selectable variants, in tokens. Omission serves one default entry per model. */
    contextLengths?: number[];
    /** Whether this group appears on the balance endpoint (default `true`). */
    showBalance?: boolean;
}
/** Plugin configuration: the endpoint base plus the four group profiles. */
export interface Config {
    /** Endpoint base; `/v1` suffix and trailing slashes are normalized away. */
    baseURL?: string;
    /** Group profiles keyed by group key; unknown keys are refused. */
    groups?: Record<string, GroupConfig>;
    /**
     * Upstream model ids the model menu must not offer, across every group.
     * Absent or empty shows the whole catalog, so the default is every known
     * model and hiding is the explicit act.
     */
    hiddenModels?: string[];
}
/** Runtime schema for {@link Config}. */
export declare const Config: z<Config>;
/** Validated per-group facts with every adapter-owned default resolved. */
export interface ResolvedGroup {
    /** Group key and the `groups` dict key. */
    key: GroupKey;
    /** Provider route this group registers under when enabled. */
    provider: string;
    /** Resolved display name for selectors and configuration surfaces. */
    displayName: string;
    enabled: boolean;
    protocol: Protocol;
    /** Validated credential reference, when one is configured. */
    apiKeyRef?: CredentialRef;
    /** Configured context-variant lengths, when offered. */
    contextLengths?: number[];
    showBalance: boolean;
}
/**
 * One resolution's complete connection facts. The base URL and every group
 * resolve together, so a rejected snapshot never pairs a new endpoint with an
 * older generation's group state.
 */
export interface ResolvedProtocomOptions {
    /** Endpoint root without trailing slashes or a `/v1` suffix. */
    baseURL: string;
    /** All four groups in fixed order; `enabled` gates route registration. */
    groups: ReadonlyMap<GroupKey, ResolvedGroup>;
    /** Upstream ids the model menu must not offer. Empty means the whole catalog. */
    hiddenModels: ReadonlySet<string>;
}
/**
 * The one explicit resolve step from raw config to validated connection
 * facts. Programmatic construction may bypass Schemastery normalization, so
 * every bound is re-judged here.
 * @param config - raw plugin config or resolved settings snapshot.
 * @returns validated connection facts for all four groups.
 */
export declare function resolveAdapterOptions(config: Config): ResolvedProtocomOptions;
