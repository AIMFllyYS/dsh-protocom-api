/**
 * The hand-maintained model registry: display names, context capacities, and
 * reasoning vocabularies for the models the Protocom official API is known to
 * serve, keyed by upstream model id. Discovery output is projected through
 * this registry; ids it does not know fall through with the endpoint's own
 * display name (or the raw id) and the fallback context window.
 *
 * @module dsh-protocom-api/model-registry
 */
import type { GroupReasoning } from './groups.ts';
/** Reasoning vocabulary one registry model supports. */
export interface RegistryReasoning {
    efforts: readonly string[];
    defaultEffort?: string;
}
/** Per-million-token USD prices, when published. */
export interface RegistryPricing {
    input: number;
    output: number;
    cacheRead?: number;
}
/** One known model: how to recognize it and what to say about it. */
export interface RegistryEntry {
    /** Exact upstream id, or a pattern tested against it. */
    match: string | RegExp;
    displayName: string;
    family: string;
    /** Combined request/response context capacity in tokens. */
    contextWindow: number;
    /** Selectable context lengths; absence offers only {@link contextWindow} itself. */
    contextOptions?: number[];
    reasoning?: RegistryReasoning;
    pricing?: RegistryPricing;
}
/** Context capacity assumed for a model the registry does not size. */
export declare const FALLBACK_CONTEXT_WINDOW = 131072;
/** The initial registry, built from the observed model listing. */
export declare const REGISTRY: readonly RegistryEntry[];
/** Find the registry entry for one upstream id. */
export declare function matchRegistry(id: string): RegistryEntry | undefined;
/** Short capacity label: 200K, 256K, 400K, 1M. */
export declare function contextLabel(tokens: number): string;
/** Selector name for one entry at one context length: `{displayName} [{label}]`. */
export declare function displayNameWithContext(displayName: string, tokens: number): string;
/** One upstream listing row, as much of it as this plugin reads. */
export interface UpstreamModel {
    id: string;
    /** Endpoint-supplied human name; may equal {@link id}. */
    displayName?: string;
    contextWindow?: number;
    maxTokens?: number;
    /** Gateway capability flags some listings disclose. */
    supportsReasoningEffort?: boolean;
    reasoningEfforts?: string[];
}
/** One catalog model after registry projection, before variant expansion. */
export interface CatalogModel {
    upstreamId: string;
    displayName: string;
    contextWindow: number;
    contextOptions?: number[];
    reasoning?: RegistryReasoning;
}
/**
 * Project one discovered upstream model into catalog form. Registry entries
 * win on every field they declare; unknown ids keep the endpoint's own
 * display name when it adds information over the raw id. Reasoning metadata
 * resolves registry first, then endpoint-disclosed effort lists, then the
 * group's own default vocabulary.
 */
export declare function catalogEntry(upstream: UpstreamModel, groupReasoning?: GroupReasoning): CatalogModel;
