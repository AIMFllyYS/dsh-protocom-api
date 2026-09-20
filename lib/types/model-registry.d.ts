/**
 * The hand-maintained model registry: display names, context capacities,
 * vision support, and reasoning vocabularies for the models the Protocom
 * official API serves, keyed by upstream model id. The registry — not the
 * endpoint's listing — is the catalog of record: every entry is offered even
 * while the listing omits it, so a shrinking or flaky listing cannot silently
 * empty the model menu. Ids the registry does not know still ride along from
 * the listing, with the endpoint's own display name and the fallback context
 * window.
 *
 * The endpoint discloses only `id`, `object`, `created`, `owned_by`, `type`,
 * and `display_name` — no context, modality, or reasoning metadata exists on
 * the wire — so every fact below is hand-maintained from the serving model's
 * own published specification and verified against the endpoint.
 *
 * @module dsh-protocom-api/model-registry
 */
import type { GroupKey, GroupReasoning } from './groups.ts';
export { CONTEXT_LADDER } from './groups.ts';
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
    /** Exact upstream model id. */
    id: string;
    displayName: string;
    family: string;
    /** Combined request/response context capacity in tokens. */
    contextWindow: number;
    reasoning?: RegistryReasoning;
    /**
     * Whether this model accepts image input through the endpoint. Verified by
     * request, not inferred from the model family.
     */
    vision?: boolean;
    /**
     * Provider groups this entry is a *membership source* for. Absent means the
     * entry is metadata only: it is offered wherever the endpoint's own listing
     * names it, and nowhere else. Grouping membership this way is what keeps one
     * group's menu from advertising every other group's models.
     */
    groups?: readonly GroupKey[];
    /**
     * Menu priority: lower sorts earlier. Assigned to the models whose reasoning
     * content actually streams, so the picker leads with readable thinking.
     */
    rank?: number;
    pricing?: RegistryPricing;
}
/**
 * Context capacity assumed for a model neither the registry nor the endpoint
 * sizes. It is the ladder floor, not a smaller "safe" number: assuming less
 * than the floor produced a single 128K entry for every unknown model — a
 * choice no model served by this endpoint can honour, and a residue of the
 * registry's original global-catalog design.
 */
export declare const FALLBACK_CONTEXT_WINDOW = 204800;
/**
 * The ladder steps one model can offer. A window below the whole ladder still
 * offers itself, so no model is left without a choice.
 * @param contextWindow - the model's declared capacity.
 * @returns the offered lengths, smallest first.
 */
export declare function contextChoicesFor(contextWindow: number): number[];
/**
 * The initial registry. Order is presentation order, but the adapter re-sorts
 * by {@link RegistryEntry.rank} so the recommended models lead the menu.
 */
export declare const REGISTRY: readonly RegistryEntry[];
/** Find the registry entry for one upstream id. */
export declare function matchRegistry(id: string): RegistryEntry | undefined;
/** Whether one registry entry is a membership source for a group. */
export declare function servesGroup(entry: RegistryEntry, key: GroupKey): boolean;
/**
 * One selectable model identity: a display name and every upstream id that
 * serves it. The endpoint lists some models under both an organization- and a
 * bare-prefixed id, which would otherwise present the same model twice in the
 * menu and twice in the visibility list.
 */
export interface ModelIdentity {
    displayName: string;
    /** Every upstream id for this identity, in registry order. */
    ids: readonly string[];
    /** The entry whose facts describe the identity. */
    entry: RegistryEntry;
}
/**
 * The models the plugin recommends out of the box: the ones whose reasoning
 * content actually streams from this endpoint, in preference order. A
 * deployment overrides the list through the `recommendedModels` setting; it
 * only ever orders the menu, so a model left off it stays fully selectable.
 */
export declare const DEFAULT_RECOMMENDED: readonly string[];
/**
 * The identity key of one upstream id: the first registry id of the model it
 * belongs to. Aliases of one model share a key, so a recommendation or a
 * visibility choice made against either id applies to both.
 */
export declare function identityKey(id: string): string;
/** Collapse the registry into one identity per display name, in registry order. */
export declare function modelIdentities(): ModelIdentity[];
/** Short capacity label: 128K, 256K, 512K, 1M. */
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
    /** Whether the model accepts image input. */
    vision: boolean;
    /** Menu priority; lower sorts earlier. */
    rank: number;
}
/**
 * Project one discovered upstream model into catalog form. Registry entries
 * win on every field they declare; unknown ids keep the endpoint's own
 * display name when it adds information over the raw id. Reasoning metadata
 * resolves registry first, then endpoint-disclosed effort lists, then the
 * group's own default vocabulary.
 */
export declare function catalogEntry(upstream: UpstreamModel, groupReasoning?: GroupReasoning): CatalogModel;
