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
/**
 * The wire protocol a gateway-declared endpoint list implies, or undefined when
 * the list names none this plugin can speak.
 *
 * Preference order is chat-completions, then responses, then messages: a model
 * offered on several surfaces is served on the first one this plugin has the
 * richest, best-tested support for, and only a model that declares NO OpenAI
 * surface falls through to the Anthropic wire.
 * @param endpoints - the gateway's own `supported_endpoints` list.
 * @returns the protocol to use, or undefined when nothing here can serve it.
 */
export declare function protocolForEndpoints(endpoints: readonly string[] | undefined): Protocol | undefined;
/**
 * Whether a model is servable at all on the endpoint's own declared surfaces.
 *
 * This is the honesty gate for a family whose gateway publishes
 * `supported_endpoints`: a model advertising only a wire this plugin does not
 * implement is EXCLUDED rather than listed. Listing it would be worse than
 * useless — every call fails with a 400 that looks like a plugin bug rather
 * than a missing capability.
 * @param model - the upstream row, endpoints included.
 * @returns whether at least one declared endpoint maps to a supported wire.
 */
export declare function servesDeclaredEndpoints(model: UpstreamModel): boolean;
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
 * The ladder steps one model can offer.
 *
 * A rung is offered when it is no larger than the model's window, and the
 * model's OWN window is always offered as a final rung. Both halves matter:
 *
 *  - Without the second, a model whose window falls between two rungs loses
 *    its ceiling. The ladder is binary (1,048,576) while providers publish
 *    decimal figures, so a 1,000,000-token model used to top out at 400K --
 *    24 of the 41 Go entries could never be offered their own window, and a
 *    500,000-token model could never be offered more than 400K either.
 *
 *  - The window is added once and sorted, so a model that IS a rung does not
 *    list it twice.
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
 * Ids a listing advertises but the endpoint cannot serve a chat turn for,
 * verified by request. Two kinds live here, because both produce the same
 * defect -- a menu entry whose every use ends in an error:
 *
 * - **Refused on this route only.** StepFun's audio and image-editing models
 *   answer 404 "the model ... does not exist or you do not have access to it",
 *   and the two Step-3.5 snapshots answer 400 "this model is not enabled for
 *   the Responses API". Verified with the StepFun credential against both
 *   /v1/chat/completions and /v1/responses.
 * - **Refused on every route.** Four aggregate ids answer 400 "Model X is not
 *   available on this endpoint. Call it on /provider/v1/chat/completions
 *   instead." on both routes. That named path is not a usable API on this
 *   relay -- it answers a Cloudflare 525 SSL-handshake-failed HTML page, or
 *   HTML with HTTP 200 -- so there is nothing the adapter could route to.
 *
 * A listing is an advertisement, not a promise: eight of the eleven ids one
 * StepFun key lists and four of the twenty-six an aggregate key lists cannot
 * serve a turn at all, and a menu entry whose every use ends in an error is
 * the defect this catalog exists to remove. They are listed here rather than
 * dropped silently -- the settings panel names them "endpoint does not serve"
 * -- and a model the endpoint starts serving again is one line away from the
 * menu.
 *
 * Every id below was re-verified by live request on the release that added it;
 * no entry is inferred from documentation.
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
    /**
     * Endpoint paths this model is served on, as the GATEWAY itself declares them
     * (Command Code publishes this on every listing row). This is the routing
     * truth rather than a hint: a model advertising only `/messages` answers 400
     * on `/chat/completions`, so id-prefix guessing would produce a guaranteed
     * failure for every call. Absent means the endpoint said nothing, and the
     * group's own protocol stands.
     */
    endpoints?: readonly string[];
    /**
     * A DEFINITE image verdict, when a capability source stated one. Absent means
     * "not stated", which the permissive default reads as accepted; false means
     * the model is text-only and must not be sent an image.
     */
    vision?: boolean;
    /**
     * A definite "this model cannot reason" verdict, when a capability source
     * stated one. Absent leaves the group's own vocabulary in charge.
     */
    reasoning?: boolean;
    /** Dollars per million input tokens, when a capability source published one. */
    inputCost?: number;
    /** Dollars per million output tokens, when published. */
    outputCost?: number;
    /** Dollars per million cached input tokens, when published. */
    cacheReadCost?: number;
    /**
     * Whether the account's subscription tier excludes this model.
     *
     * Set by the adapter from the account's own plan, because the endpoints
     * listing is NOT plan-filtered: verified live, the listing advertised Pro-
     * and Max-tier models that an individual-goat account answers 403
     * MODEL_NOT_IN_PLAN for. Such a model is kept out of the menu rather than
     * listed and failing on every call.
     */
    outOfPlan?: boolean;
}
/** One catalog model after registry projection, before variant expansion. */
export interface CatalogModel {
    upstreamId: string;
    displayName: string;
    contextWindow: number;
    /** Whether the endpoint published this window, rather than this plugin assuming it. */
    contextWindowDisclosed?: boolean;
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
/**
 * The context steps one model may be offered.
 *
 * One expression, evaluated by both the adapter that mints menu entries and the
 * settings row that draws the chips, so the two cannot disagree -- the defect
 * that made a row show a single pressed chip which refused every click.
 *
 * Three inputs, in order of authority:
 *
 *  1. the registry's own options for a model it sizes,
 *  2. the endpoint's DISCLOSED length, when it publishes one per row,
 *  3. the group ladder unfiltered, when nothing but this plugin's assumption
 *     bounds the model.
 *
 * The distinction in (2) and (3) is load-bearing rather than pedantic. Command
 * Code publishes `context_length` on every row, so a step above it is an entry
 * the model cannot honour: a 256K model was offered 400K and 1M. StepFun
 * publishes nothing, and its uncurated ids carry only a floor guess, so the same
 * filtering there would hide steps those models serve.
 * @param model - the projected row.
 * @param ladder - the group's effective ladder.
 * @returns the steps to offer, never empty.
 */
export declare function contextStepsFor(model: Pick<GroupCatalogModel, 'contextOptions' | 'contextWindow' | 'contextWindowDisclosed'>, ladder: readonly number[] | undefined): number[];
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
    /**
     * Whether {@link contextWindow} is the ENDPOINT's own disclosure rather than
     * a registry value or a floor default.
     *
     * The distinction decides whether the window may be used to filter the
     * ladder. An endpoint that publishes a per-row length is stating a fact, so a
     * step above it is a menu entry the model cannot honour. A number this plugin
     * assumed is only a floor, and filtering by it would hide steps the model can
     * serve -- which is the case StepFun's uncurated ids depend on.
     */
    contextWindowDisclosed?: boolean;
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
