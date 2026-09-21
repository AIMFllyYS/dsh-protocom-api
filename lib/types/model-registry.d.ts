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
import type { GroupReasoning, Protocol } from './groups.ts';
import type { ProviderFamily } from './family.ts';
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
     * group's menu from advertising every other group's models. Group keys are
     * family-scoped (e.g. `codex` for Protocom, `go` for OpenCode Go).
     */
    groups?: readonly string[];
    /**
     * Wire protocol this model must use on its family's endpoint, overriding the
     * group's default. OpenCode Go routes a per-model set to the Responses
     * surface only (grok-4.6, muse-spark-*, gpt-5.6-luna answer 503/ModelError
     * on chat-completions), while the rest only answer on chat-completions.
     */
    protocol?: Protocol;
    /**
     * Whether this model emits its thinking inline in the `content` stream as a
     * `<think>...</think>` segment rather than in a reasoning channel. The
     * chat-completions translator lifts that segment into a reasoning block so
     * the harness still sees a thinking stream (MiniMax M3 on OpenCode Go).
     */
    inlineReasoning?: boolean;
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
export declare function matchRegistry(id: string, registry?: readonly RegistryEntry[]): RegistryEntry | undefined;
/** Whether one registry entry is a membership source for a group. */
export declare function servesGroup(entry: RegistryEntry, key: string): boolean;
/**
 * Ids the endpoint's listing advertises but its chat route refuses, verified by
 * request against `GET /v1/models` and `POST /v1/chat/completions` with the
 * same StepFun credential: the audio and image-editing models answer 404 "the
 * model ... does not exist or you do not have access to it", and the two
 * Step-3.5 snapshots answer 400 "this model is not enabled for the Responses
 * API".
 *
 * A listing is an advertisement, not a promise: eight of the eleven ids one
 * StepFun key lists cannot serve a chat turn at all, and a menu entry whose
 * every use ends in an error is the defect this catalog exists to remove. They
 * are listed here rather than dropped silently — the settings panel names them
 * — and a model the endpoint starts serving again is one line away from the
 * menu.
 */
export declare const REFUSED_CHAT_MODEL_IDS: readonly string[];
/** Whether the endpoint's chat route answers for one upstream id. */
export declare function servesChat(id: string, refused?: readonly string[]): boolean;
/**
 * Whether one model accepts image input, after the deployment's own choice.
 *
 * Resolution order is explicit setting, then the registry's verified verdict,
 * then permissive: the endpoint — not this registry — is the authority on a
 * model's modality and discloses none, so the registry can only ever be
 * incomplete. A wrong "no" makes a documented capability unreachable for every
 * deployment at once; a wrong "yes" costs one upstream error that names the
 * model. `vision: false` stays the way to say "verified text-only".
 * @param id - upstream model id, alias resolved through {@link identityKey}.
 * @param declared - the deployment's per-model choices.
 */
export declare function acceptsImages(id: string, declared?: ReadonlyMap<string, boolean>, registry?: readonly RegistryEntry[]): boolean;
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
export declare function identityKey(id: string, registry?: readonly RegistryEntry[]): string;
/** Collapse the registry into one identity per display name, in registry order. */
export declare function modelIdentities(registry?: readonly RegistryEntry[]): ModelIdentity[];
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
    /** Whether the model accepts image input, after the deployment's override. */
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
 * @param upstream - one listing row, or a hand-built row for a registry entry.
 * @param groupReasoning - the group's own vocabulary, used when nothing else declares one.
 * @param declaredVision - the deployment's per-model image capability.
 * @returns the model as the menu presents it.
 */
export declare function catalogEntry(upstream: UpstreamModel, groupReasoning?: GroupReasoning, declaredVision?: ReadonlyMap<string, boolean>, registry?: readonly RegistryEntry[]): CatalogModel;
/** One model as a group's own model menu presents it. */
export interface GroupCatalogModel {
    /** The upstream id this row's menu entries dispatch. */
    upstreamId: string;
    /**
     * Every upstream id that presents this identity, in listing then registry
     * order. Hiding or starring the identity covers all of them, so no alias can
     * survive as a second row carrying the same model's name.
     */
    ids: readonly string[];
    displayName: string;
    contextWindow: number;
    /** Ladder steps the registry allows this model, when it sizes the model. */
    contextOptions?: readonly number[];
    reasoning?: RegistryReasoning;
    /** Whether the model accepts image input, after the deployment's override. */
    vision: boolean;
    rank: number;
}
/** Deployment choices a group's catalog projection honours. */
export interface GroupCatalogOptions {
    /** Upstream ids the menu must not offer. */
    hidden?: ReadonlySet<string>;
    /** Upstream ids that lead the menu, most preferred first. */
    recommended?: readonly string[];
    /** Explicit per-model image capability, keyed by model identity. */
    vision?: ReadonlyMap<string, boolean>;
    /**
     * Whether a group with no rows at all falls back to the whole registry
     * (default true). The adapter leaves this on, because an unreachable listing
     * must not empty the model menu. A configuration surface turns it off until
     * it has actually interrogated the group, so a group nobody has probed does
     * not advertise every other group's models.
     */
    registryFallback?: boolean;
    /**
     * The provider family this catalog is for. Absent means Protocom — the
     * historical caller — so the shipped registry, refusal list, and group
     * reasoning defaults apply. A family scopes every lookup (registry, refused
     * ids, and the group's own reasoning vocabulary) to its own endpoint.
     */
    family?: ProviderFamily;
}
/**
 * One group's own model menu: the models that group's menu offers, in the
 * order the menu renders them. Membership is the group's live listing — the
 * credential scopes what the route serves — plus the registry entries tagged
 * for that group, so a group's menu holds its own models instead of every
 * group's and a model the endpoint starts listing appears without a plugin
 * release. Ids the endpoint refuses on its chat route never appear
 * ({`link servesChat}). A missing or empty listing falls back to the whole
 * registry, so a degraded endpoint cannot empty the menu.
 *
 * The adapter's `listModels` and the settings panel's per-group model editor
 * both project through here, so the list a user configures cannot drift from
 * the list the picker shows.
 * `param key - the group whose catalog is projected.
 * `param listing - that group's live listing, or `undefined` when unreachable.
 * `param options - the deployment's visibility, ordering, and modality choices.
 * `returns one row per model identity, in menu order.
 */
export declare function groupCatalog(key: string, listing: readonly UpstreamModel[] | undefined, options?: GroupCatalogOptions): GroupCatalogModel[];
/**
 * The OpenCode Go registry. Every entry is a membership source for the single
 * `go` group, so the menu holds the whole catalog even while the live listing
 * is unreachable. `contextWindow` follows the model's published window
 * (models.dev); reasoning vocabularies are the live-verified accept sets.
 */
export declare const GO_REGISTRY: readonly RegistryEntry[];
/**
 * Ids the Go endpoint lists but cannot serve a chat turn for on any wire
 * protocol, verified by request: `minimax-m2.7` answers 503 on both
 * chat-completions and responses, and `hy3-preview` answers 400
 * "Model is unavailable". They stay listed (the probe table names them) but
 * never reach the menu.
 */
export declare const GO_REFUSED_MODEL_IDS: readonly string[];
/** Go menu leads: the models whose thinking actually streams, in preference order. */
export declare const GO_DEFAULT_RECOMMENDED: readonly string[];
