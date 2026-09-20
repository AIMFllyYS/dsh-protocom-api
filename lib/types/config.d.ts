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
export { DEFAULT_BASE_URL, DEFAULT_BASE_URL_ORIGIN, GROUP_DEFAULTS, GROUP_KEYS, groupOf, providerOf } from './groups.ts';
export type { GroupKey, GroupReasoning, Protocol } from './groups.ts';
import type { GroupKey, Protocol } from './groups.ts';
/**
 * Idle interval after which one provider stream is aborted. Mirrors the
 * first-party adapters' watchdog default so a stalled endpoint cannot pin a
 * request — and its socket and agent step — open forever.
 */
export declare const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300000;
/**
 * The only credential references this plugin resolves: its own namespaced
 * environment-variable names. An open shape let a rewritten `baseURL` pair any
 * `process.env` name with an arbitrary endpoint, turning the environment
 * fallback into an exfiltration primitive.
 */
export declare const PROTOCOM_CREDENTIAL_REF: RegExp;
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
    /**
     * Explicit confirmation that this deployment really sends its stored API key
     * to a non-default endpoint. Absent or false pins `baseURL` to the shipped
     * Protocom origin, so a single settings write cannot redirect the key.
     * Deliberately has no schema default: opting in must be a deliberate act.
     */
    allowCustomBaseURL?: boolean;
    /** Idle interval, in milliseconds, after which one provider stream is aborted (default 300000). */
    streamIdleTimeoutMs?: number;
    /** Group profiles keyed by group key; unknown keys are refused. */
    groups?: Record<string, GroupConfig>;
    /**
     * Upstream model ids the model menu must not offer, across every group.
     * Absent or empty shows the whole catalog, so the default is every known
     * model and hiding is the explicit act.
     */
    hiddenModels?: string[];
    /**
     * Upstream model ids that lead the model menu, most preferred first. Absent
     * uses the plugin's shipped recommendation. This orders the menu and nothing
     * else: a model left off the list stays fully selectable below the picks.
     */
    recommendedModels?: string[];
    /**
     * Context lengths to offer per upstream model id. Each listed length becomes
     * its own model-menu entry (`Name [256K]`, `Name [1M]`), so a user picks the
     * context by picking the entry. An absent model offers one entry at its full
     * window; a length above the model's window is ignored.
     */
    modelContexts?: Record<string, number[]>;
    /**
     * Per-model image-input capability, keyed by upstream model id (aliases
     * collapse to one key). The endpoint discloses no modality for any model, so
     * the plugin's own default is permissive: an id nobody has judged accepts
     * images, because a wrong "no" makes a documented capability unreachable
     * while a wrong "yes" costs one upstream error that names the model. `false`
     * is the explicit "this model is text-only" that removes the image modality
     * from that model's menu entries.
     */
    visionModels?: Record<string, boolean>;
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
    /** Resolved idle watchdog interval for one provider stream, in milliseconds. */
    streamIdleTimeoutMs: number;
    /** All four groups in fixed order; `enabled` gates route registration. */
    groups: ReadonlyMap<GroupKey, ResolvedGroup>;
    /** Upstream ids the model menu must not offer. Empty means the whole catalog. */
    hiddenModels: ReadonlySet<string>;
    /** Upstream ids that lead the model menu, most preferred first. */
    recommendedModels: readonly string[];
    /** Context lengths to offer per upstream id, keyed by model identity. */
    modelContexts: ReadonlyMap<string, readonly number[]>;
    /** Image-input capability per upstream id, keyed by model identity. */
    visionModels: ReadonlyMap<string, boolean>;
}
/**
 * The one explicit resolve step from raw config to validated connection
 * facts. Programmatic construction may bypass Schemastery normalization, so
 * every bound is re-judged here.
 * @param config - raw plugin config or resolved settings snapshot.
 * @returns validated connection facts for all four groups.
 */
export declare function resolveAdapterOptions(config: Config): ResolvedProtocomOptions;
/**
 * Validate one endpoint root. Plain http is allowed only for a loopback host,
 * so the stored bearer token can never be sent in the clear to a remote
 * endpoint; userinfo, query strings, and fragments are refused because they
 * let a value that reads as one endpoint actually resolve to another.
 * @param raw - endpoint root, already stripped of trailing slashes and `/v1`.
 * @returns the same string once every bound passes.
 */
export declare function resolveBaseURL(raw: string): string;
