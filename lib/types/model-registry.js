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
import { variantLengths } from "./context-variants.js";
import { CONTEXT_1M, CONTEXT_200K, CONTEXT_256K, CONTEXT_LADDER, GROUP_DEFAULTS } from "./groups.js";
export { CONTEXT_LADDER } from "./groups.js";
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
export function protocolForEndpoints(endpoints) {
    if (endpoints === undefined || endpoints.length === 0)
        return undefined;
    if (endpoints.includes('/chat/completions'))
        return 'chat-completions';
    if (endpoints.includes('/responses'))
        return 'responses';
    if (endpoints.includes('/messages'))
        return 'messages';
    return undefined;
}
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
export function servesDeclaredEndpoints(model) {
    if (model.endpoints === undefined || model.endpoints.length === 0)
        return true;
    const protocol = protocolForEndpoints(model.endpoints);
    // `messages` maps to a protocol this plugin RECOGNIZES but does not yet
    // implement, so it must be excluded exactly like an unknown surface: the
    // adapter refuses such a route at dispatch, and offering it here would move
    // that failure from "model is not in the menu" to "every call to it fails".
    return protocol !== undefined && protocol !== 'messages';
}
/**
 * Context capacity assumed for a model neither the registry nor the endpoint
 * sizes. It is the ladder floor, not a smaller "safe" number: assuming less
 * than the floor produced a single 128K entry for every unknown model — a
 * choice no model served by this endpoint can honour, and a residue of the
 * registry's original global-catalog design.
 */
export const FALLBACK_CONTEXT_WINDOW = CONTEXT_200K;
/**
 * The reasoning vocabulary shared by the GLM-5.2/5.3 generation. GLM refuses
 * `thinking: {type: "disabled"}`, so `off` is deliberately absent: every
 * effort here keeps thinking enabled and varies its budget.
 */
const GLM_REASONING = {
    efforts: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'high',
};
/** The reasoning vocabulary shared by the GPT-5.6 generation. */
const GPT_REASONING = {
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'medium',
};
/**
 * The full vocabulary this relay accepts, for a model verified against all of
 * it. Live-verified 2026-09-27: every level answers 200.
 *
 * Relay-scoped, like GLM_REASONING and GPT_REASONING above, and deliberately
 * not shared with GO_FULL_REASONING: the relay spells the disabling word
 * `none` and answers 400 to `off`, while the Go gateway is the exact reverse.
 */
const FULL_REASONING = {
    efforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'high',
};
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
export function contextChoicesFor(contextWindow) {
    const offered = CONTEXT_LADDER.filter(length => length < contextWindow);
    return [...offered, contextWindow].sort((left, right) => left - right);
}
/**
 * The initial registry. Order is presentation order, but the adapter re-sorts
 * by {@link RegistryEntry.rank} so the recommended models lead the menu.
 */
export const REGISTRY = [
    {
        id: 'kimi-k3',
        displayName: 'Kimi K3',
        family: 'kimi',
        contextWindow: CONTEXT_256K,
        // Live-verified 2026-09-27: minimal, medium, xhigh and max all answer 200.
        // Only `none` is refused, so the narrower pair this used to declare hid
        // levels the model serves.
        reasoning: { efforts: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'high' },
        vision: true,
        rank: 1,
    },
    {
        id: 'glm-5.2',
        displayName: 'GLM-5.2',
        family: 'glm',
        contextWindow: CONTEXT_1M,
        reasoning: GLM_REASONING,
        // Text-only by the vendor's own documentation. Declared rather than left
        // absent: an absent verdict now means "unknown", and unknown is permissive.
        vision: false,
        rank: 2,
    },
    {
        id: 'mimo-v2.5',
        displayName: 'MiMo V2.5',
        family: 'mimo',
        contextWindow: CONTEXT_1M,
        reasoning: { efforts: ['none', 'low', 'medium', 'high'], defaultEffort: 'high' },
        vision: true,
        rank: 3,
    },
    {
        id: 'deepseek/deepseek-v4.1-flash',
        displayName: 'DeepSeek V4.1 Flash',
        family: 'deepseek',
        contextWindow: CONTEXT_1M,
        reasoning: { efforts: ['none', 'low', 'high', 'max'], defaultEffort: 'none' },
        vision: true,
    },
    {
        id: 'deepseek-v4.1-flash',
        displayName: 'DeepSeek V4.1 Flash',
        family: 'deepseek',
        contextWindow: CONTEXT_1M,
        reasoning: { efforts: ['none', 'low', 'high', 'max'], defaultEffort: 'none' },
        vision: true,
    },
    {
        // Advertised as a reasoning model, but the endpoint's Moonshot route
        // rejects `reasoning_effort` outright ("invalid moonshotai provider
        // options", HTTP 400) while accepting `thinking` and streaming no
        // reasoning at all. Declaring an effort vocabulary here would make every
        // request fail, because the picker's default effort goes out on the wire;
        // without one the request carries neither field, which the route serves.
        id: 'moonshotai/Kimi-K2.7-Code',
        displayName: 'Kimi K2.7 Code',
        family: 'kimi',
        contextWindow: CONTEXT_256K,
        vision: true,
    },
    {
        id: 'zai-org/GLM-5.2',
        displayName: 'GLM-5.2',
        family: 'glm',
        contextWindow: CONTEXT_1M,
        reasoning: GLM_REASONING,
        vision: false,
    },
    {
        id: 'glm-5.3',
        displayName: 'GLM-5.3',
        family: 'glm',
        contextWindow: CONTEXT_1M,
        reasoning: GLM_REASONING,
        vision: false,
    },
    {
        id: 'z-ai/glm-5.3-flash',
        displayName: 'GLM-5.3 Flash',
        family: 'glm',
        contextWindow: CONTEXT_1M,
        reasoning: GLM_REASONING,
        vision: true,
    },
    {
        id: 'z-ai/glm-5.3-flashx',
        displayName: 'GLM-5.3 FlashX',
        family: 'glm',
        contextWindow: CONTEXT_1M,
        reasoning: GLM_REASONING,
        vision: true,
    },
    { id: 'Qwen/Qwen3.8-27B', displayName: 'Qwen3.8 27B', family: 'qwen', contextWindow: CONTEXT_1M, vision: true },
    { id: 'qwen3.8-max', displayName: 'Qwen3.8 Max', family: 'qwen', contextWindow: CONTEXT_1M },
    { id: 'Qwen/Qwen3.7-Flash', displayName: 'Qwen3.7 Flash', family: 'qwen', contextWindow: CONTEXT_256K, vision: true },
    { id: 'Qwen/Qwen3.8-Omni-Flash', displayName: 'Qwen3.8 Omni Flash', family: 'qwen', contextWindow: CONTEXT_1M, vision: true },
    {
        id: 'MiniMaxAI/MiniMax-M3',
        displayName: 'MiniMax M3',
        family: 'minimax',
        contextWindow: CONTEXT_1M,
        // Live-verified 2026-09-27: none and xhigh both answer 200 on top of the
        // three this declared, so the pair was a menu restriction rather than a
        // capability limit.
        reasoning: { efforts: ['none', 'low', 'medium', 'high', 'xhigh'], defaultEffort: 'high' },
        vision: true,
    },
    {
        id: 'mimo-v2.5-pro',
        displayName: 'MiMo V2.5 Pro',
        family: 'mimo',
        contextWindow: CONTEXT_1M,
        reasoning: { efforts: ['none', 'low', 'medium', 'high'], defaultEffort: 'high' },
        // The endpoint answered 404 "no endpoints found that support image input".
        vision: false,
    },
    {
        id: 'google/gemini-3.8-flash',
        displayName: 'Gemini 3.8 Flash',
        family: 'gemini',
        contextWindow: CONTEXT_1M,
        vision: true,
    },
    {
        id: 'gpt-5.6-sol',
        displayName: 'GPT-5.6 Sol',
        family: 'gpt',
        contextWindow: CONTEXT_1M,
        reasoning: GPT_REASONING,
        vision: true,
        groups: ['codex'],
    },
    {
        id: 'gpt-5.6-luna',
        displayName: 'GPT-5.6 Luna',
        family: 'gpt',
        contextWindow: CONTEXT_1M,
        reasoning: GPT_REASONING,
        vision: true,
        groups: ['codex'],
    },
    {
        // Verified by request against this endpoint: `step-5-preview` answers a
        // chat turn carrying an inline image (HTTP 200, "Red"), and StepFun
        // publishes it at a 1M window. It is the only StepFun id curated here —
        // the others ride from the group's own listing with the group's ladder,
        // because sizing a model on a guess would narrow its menu to steps it
        // cannot honour.
        id: 'step-5-preview',
        displayName: 'Step 5 Preview',
        family: 'step',
        contextWindow: CONTEXT_1M,
        vision: true,
        groups: ['stepfun'],
    },
    // These four answer "not available on this endpoint" on /v1/chat/completions
    // whenever the endpoint lists them, so their facts cannot be verified by
    // request; the values follow their generation's published window. They stay
    // catalogued rather than blocked — the picker's toggles are how a deployment
    // says which models it wants, and a model that starts serving should simply
    // start working.
    { id: 'google/gemini-3.7-flash', displayName: 'Gemini 3.7 Flash', family: 'gemini', contextWindow: CONTEXT_1M, vision: true },
    { id: 'tencent/hy4-preview', displayName: 'HY-4 Preview', family: 'hunyuan', contextWindow: CONTEXT_256K },
    { id: 'inclusionai/ling-3.0-flash-sante:free', displayName: 'Ling 3.0 Flash Sante', family: 'inclusionai', contextWindow: CONTEXT_256K },
    { id: 'Qwen/Qwen3.8-Flash', displayName: 'Qwen3.8 Flash', family: 'qwen', contextWindow: CONTEXT_1M, vision: true },
    // Context values below follow each model's published ceiling; the two marked
    // unverified follow their family's documented window.
    { id: 'tencent/hy3-paid', displayName: 'HY-3', family: 'hunyuan', contextWindow: CONTEXT_256K },
    { id: 'meituan/LongCat-2.0:free', displayName: 'LongCat 2.0', family: 'longcat', contextWindow: CONTEXT_256K },
    { id: 'poolside/laguna-s-2.1-free', displayName: 'Laguna S 2.1 Free', family: 'poolside', contextWindow: CONTEXT_256K },
    { id: 'meta/muse-spark-1.3-contributor', displayName: 'Muse Spark 1.3 Contributor', family: 'meta', contextWindow: CONTEXT_1M, vision: true },
    /* ---------------------------------------------------------------------
     * Added 2026-09-27 after a live listing sweep. These were served but absent
     * here, which does not hide them -- the listing is the membership source --
     * but leaves them sized by the family floor, offering no Effort control, and
     * relying on the permissive vision default.
     *
     * Every field is live-verified against the relay itself, not taken from a
     * third party: all seven effort levels answered 200 on each id below, and an
     * inline image answered 200 on all five. The window is the consensus of the
     * independent providers models.dev reports, which is the same source this
     * registry already cites for windows it cannot probe.
     * ------------------------------------------------------------------- */
    {
        id: 'mimo-v2.6-flash',
        displayName: 'MiMo V2.6 Flash',
        family: 'mimo',
        contextWindow: CONTEXT_1M,
        reasoning: FULL_REASONING,
        vision: true,
    },
    {
        id: 'mimo-v2.6-pro',
        displayName: 'MiMo V2.6 Pro',
        family: 'mimo',
        contextWindow: CONTEXT_1M,
        reasoning: FULL_REASONING,
        vision: true,
    },
    {
        id: 'xiaomi/mimo-v2.6-flash',
        displayName: 'MiMo V2.6 Flash',
        family: 'mimo',
        contextWindow: CONTEXT_1M,
        reasoning: FULL_REASONING,
        vision: true,
    },
    {
        id: 'xiaomi/mimo-v2.6-pro-ultraspeed',
        displayName: 'MiMo V2.6 Pro Ultraspeed',
        family: 'mimo',
        contextWindow: CONTEXT_1M,
        reasoning: FULL_REASONING,
        vision: true,
    },
    {
        id: 'gpt-6-luna',
        displayName: 'GPT-6 Luna',
        family: 'gpt',
        contextWindow: 1_050_000,
        reasoning: FULL_REASONING,
        vision: true,
        protocol: 'responses',
    },
];
/** Find the registry entry for one upstream id. */
export function matchRegistry(id, registry = REGISTRY) {
    return registry.find(entry => entry.id === id);
}
/** Whether one registry entry is a membership source for a group. */
export function servesGroup(entry, key) {
    return entry.groups?.includes(key) === true;
}
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
export const REFUSED_CHAT_MODEL_IDS = [
    // StepFun: refused on this relay's routes (404 not-found / 400 not-enabled).
    'step-3.5-flash',
    'step-3.5-flash-2603',
    'step-explore',
    'step-image-edit-2',
    'stepaudio-2.5-asr',
    'stepaudio-2.5-chat',
    'stepaudio-2.5-realtime',
    'stepaudio-2.5-tts',
    // Aggregate: listed, but "not available on this endpoint" on both routes.
    'Qwen/Qwen3.8-Flash',
    'google/gemini-3.7-flash',
    'tencent/hy4-preview',
    'inclusionai/ling-3.0-flash-sante:free',
    // The bare id is listed and refused; the `:free` suffix variant is a
    // different id the relay does not list at all. Re-verified 2026-09-27.
    'meituan/LongCat-2.0',
];
/** Whether the endpoint's chat route answers for one upstream id. */
export function servesChat(id, refused = REFUSED_CHAT_MODEL_IDS) {
    return !refused.includes(id);
}
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
export function acceptsImages(id, declared, registry = REGISTRY) {
    const chosen = declared?.get(identityKey(id, registry));
    if (chosen !== undefined)
        return chosen;
    return matchRegistry(id, registry)?.vision !== false;
}
/**
 * The models the plugin recommends out of the box: the ones whose reasoning
 * content actually streams from this endpoint, in preference order. A
 * deployment overrides the list through the `recommendedModels` setting; it
 * only ever orders the menu, so a model left off it stays fully selectable.
 */
export const DEFAULT_RECOMMENDED = REGISTRY
    .filter(entry => entry.rank !== undefined)
    .slice()
    .sort((left, right) => left.rank - right.rank)
    .map(entry => entry.id);
/**
 * The identity key of one upstream id: the first registry id of the model it
 * belongs to. Aliases of one model share a key, so a recommendation or a
 * visibility choice made against either id applies to both.
 */
export function identityKey(id, registry = REGISTRY) {
    const entry = matchRegistry(id, registry);
    if (entry === undefined)
        return id;
    return registry.find(candidate => candidate.displayName === entry.displayName)?.id ?? id;
}
/** Collapse the registry into one identity per display name, in registry order. */
export function modelIdentities(registry = REGISTRY) {
    const byName = new Map();
    for (const entry of registry) {
        const hit = byName.get(entry.displayName);
        if (hit === undefined)
            byName.set(entry.displayName, { entry, ids: [entry.id] });
        else
            hit.ids.push(entry.id);
    }
    return [...byName.values()].map(({ entry, ids }) => ({ displayName: entry.displayName, ids, entry }));
}
/** Short capacity label: 128K, 256K, 512K, 1M. */
export function contextLabel(tokens) {
    // Providers report windows in both bases: binary (1,048,576) and decimal
    // (1,000,000 — OpenCode Go's models.dev figures). Label either cleanly
    // rather than printing 977K for a decimal million.
    //
    // A model can now offer BOTH of those as separate steps, and the naive
    // labels collide -- 1M and 1M -- which leaves the operator choosing between
    // two identical chips with different budgets behind them. The binary figure
    // is distinguished because it is the larger of the two: "1M" reads as the
    // decimal million, so the binary one is the exception that needs marking.
    // The binary figure keeps the plain label it has always had, because it is
    // the one this ladder is built from. The decimal million is the exception
    // that needs marking, and it only ever appears beside the binary one when a
    // model's own window is decimal.
    if (tokens === 1_000_000)
        return '1M (dec)';
    if (tokens % 1_048_576 === 0)
        return `${tokens / 1_048_576}M`;
    return `${Math.round(tokens / 1024)}K`;
}
/** Selector name for one entry at one context length: `{displayName} [{label}]`. */
export function displayNameWithContext(displayName, tokens) {
    return `${displayName} [${contextLabel(tokens)}]`;
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
export function catalogEntry(upstream, groupReasoning, declaredVision, registry = REGISTRY) {
    const entry = matchRegistry(upstream.id, registry);
    const disclosed = upstream.reasoningEfforts !== undefined
        && upstream.reasoningEfforts.length > 0
        ? {
            efforts: upstream.reasoningEfforts,
            defaultEffort: upstream.reasoningEfforts.includes('high')
                ? 'high'
                : upstream.reasoningEfforts[0],
        }
        : undefined;
    const reasoning = entry?.reasoning ?? disclosed ?? groupReasoning;
    if (entry === undefined) {
        return {
            upstreamId: upstream.id,
            displayName: upstream.displayName !== undefined && upstream.displayName !== upstream.id
                ? upstream.displayName
                : upstream.id,
            contextWindow: upstream.contextWindow ?? FALLBACK_CONTEXT_WINDOW,
            // Only the endpoint's own number is a fact. The floor default is a guess,
            // and the two must stay distinguishable downstream.
            ...upstream.contextWindow === undefined ? {} : { contextWindowDisclosed: true },
            ...reasoning === undefined ? {} : { reasoning },
            // A source that states the verdict outranks the permissive default; a
            // deployment's own declaration still outranks both.
            vision: declaredVision?.get(identityKey(upstream.id, registry)) ?? upstream.vision ?? acceptsImages(upstream.id, undefined, registry),
            rank: Number.MAX_SAFE_INTEGER,
        };
    }
    return {
        upstreamId: upstream.id,
        displayName: entry.displayName,
        contextWindow: entry.contextWindow,
        contextOptions: contextChoicesFor(entry.contextWindow),
        ...reasoning === undefined ? {} : { reasoning },
        vision: declaredVision?.get(identityKey(upstream.id, registry)) ?? upstream.vision ?? acceptsImages(upstream.id, undefined, registry),
        rank: entry.rank ?? Number.MAX_SAFE_INTEGER,
    };
}
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
export function contextStepsFor(model, ladder) {
    if (model.contextOptions !== undefined) {
        return variantLengths(model.contextOptions, ladder) ?? [model.contextWindow];
    }
    if (ladder === undefined || ladder.length === 0)
        return [model.contextWindow];
    const allowed = model.contextWindowDisclosed === true
        ? ladder.filter(length => length <= model.contextWindow)
        : [...ladder];
    return allowed.length > 0 ? allowed : [model.contextWindow];
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
export function groupCatalog(key, listing, options = {}) {
    const registry = options.family?.registry ?? REGISTRY;
    const refused = options.family?.refused ?? REFUSED_CHAT_MODEL_IDS;
    const groupReasoning = options.family === undefined
        ? GROUP_DEFAULTS[key].reasoning
        : options.family.defaults[key]?.reasoning;
    const rows = listing === undefined ? [] : [...listing];
    for (const entry of registry) {
        if (!servesGroup(entry, key))
            continue;
        if (!rows.some(row => row.id === entry.id))
            rows.push({ id: entry.id });
    }
    // "No listing" and "empty listing" are both no information, not "no models".
    if (rows.length === 0 && options.registryFallback !== false) {
        for (const entry of registry)
            rows.push({ id: entry.id });
    }
    const rankOf = (id) => {
        const at = options.recommended?.indexOf(identityKey(id, registry)) ?? -1;
        return at === -1 ? Number.MAX_SAFE_INTEGER : at;
    };
    const ranked = rows
        // A row the endpoint refuses to chat on, or that declares only surfaces
        // this plugin cannot speak, is not offered: listing it would turn every
        // call into a 400 that reads like a bug rather than a missing capability.
        .filter(row => servesChat(row.id, refused)
        && servesDeclaredEndpoints(row)
        && row.outOfPlan !== true
        && options.hidden?.has(row.id) !== true)
        .map((row, index) => ({ index, row, rank: rankOf(row.id) }))
        .sort((left, right) => left.rank - right.rank || left.index - right.index);
    const byName = new Map();
    for (const { row } of ranked) {
        const model = catalogEntry(row, groupReasoning, options.vision, registry);
        const hit = byName.get(model.displayName);
        if (hit === undefined) {
            byName.set(model.displayName, {
                upstreamId: row.id,
                ids: [row.id],
                displayName: model.displayName,
                contextWindow: model.contextWindow,
                // Carried through: the adapter and the settings row both need to know
                // whether this window is the endpoint's fact or this plugin's guess.
                ...model.contextWindowDisclosed === true ? { contextWindowDisclosed: true } : {},
                ...model.contextOptions === undefined ? {} : { contextOptions: [...model.contextOptions] },
                ...model.reasoning === undefined ? {} : { reasoning: model.reasoning },
                vision: model.vision,
                rank: model.rank,
            });
            continue;
        }
        hit.ids.push(row.id);
    }
    return [...byName.values()];
}
/* ------------------------------------------------------------------------
 * OpenCode Go (`https://opencode.ai/zen/go`): the subscription surface. Its
 * `/v1/models` listing discloses only `id`/`object`/`created`/`owned_by`, so
 * every fact below is hand-maintained from models.dev's `opencode-go` entry
 * and verified by request against the live endpoint.
 *
 * Verified wire facts (2026-09, live probing):
 * - Protocol is per-model: grok-4.6, muse-spark-1.2/1.3-contributor and
 *   gpt-5.6-luna answer 503/`ModelError` on /v1/chat/completions and only
 *   serve /v1/responses; every other listed model answers only on
 *   chat-completions (the same /responses call 503s); minimax-m2.7 and
 *   hy3-preview fail on both.
 * - Thinking on chat-completions rides `reasoning_effort` alone — the gateway
 *   parses `reasoningEffort ?? reasoning_effort ?? reasoning.effort`; a
 *   `thinking: {type:"disabled"}` block is refused on GLM routes — and the
 *   disabling word is per model: `none` (deepseek/qwen/kimi-k3/mimo/…), `off`
 *   (kimi-k2.7-code), or impossible (glm-5.1/5.2/5.3, minimax-m2.5: reasoning
 *   is mandatory there). `minimum` — not `minimal` — is qwen3.6-plus's word.
 * - Reasoning streams as `delta.reasoning_content` on chat (deepseek, glm,
 *   kimi-k2.7-code/k3, longcat, mimo-v2.5-pro, omen-alpha, qwen3.x), as
 *   `delta.reasoning`/`reasoning_details` on minimax-m2.5, inline as
 *   `<think>…</think>` inside `delta.content` on minimax-m3, and as reasoning
 *   items (`reasoning_summary_text.delta` etc.) on the responses models.
 * - Replaying assistant `reasoning_content` is accepted, and kimi-family
 *   models expect it for interleaved thinking.
 * ---------------------------------------------------------------------- */
/** Go vocabulary shared by the deepseek/glm-5.3-flash/kimi-k3/longcat/mimo-v2.5/minimax-m3/qwen3.8 generation. */
const GO_FULL_REASONING = {
    efforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'high',
};
/** GLM-5.1/5.2/5.3 on Go: thinking cannot be disabled; `minimal`, `none` and `off` all answer 400. */
const GO_GLM_REASONING = {
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'high',
};
/** muses/grok on the Go responses surface: `none` and `max` answer 400. */
const GO_RESPONSES_REASONING = {
    efforts: ['minimal', 'low', 'medium', 'high', 'xhigh'],
    defaultEffort: 'medium',
};
/** Qwen3.7 generation on Go: `max`, `minimum` and `off` answer 400. */
const GO_QWEN37_REASONING = {
    efforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
    defaultEffort: 'medium',
};
/**
 * The OpenCode Go registry. Every entry is a membership source for the single
 * `go` group, so the menu holds the whole catalog even while the live listing
 * is unreachable. `contextWindow` follows the model's published window
 * (models.dev); reasoning vocabularies are the live-verified accept sets.
 */
export const GO_REGISTRY = [
    {
        id: 'deepseek-v4.1-flash',
        displayName: 'DeepSeek V4.1 Flash',
        family: 'deepseek',
        contextWindow: 1_000_000,
        reasoning: GO_FULL_REASONING,
        vision: true,
        groups: ['go'],
        rank: 1,
    },
    {
        id: 'glm-5.3',
        displayName: 'GLM-5.3',
        family: 'glm',
        contextWindow: 1_000_000,
        reasoning: GO_GLM_REASONING,
        vision: false,
        groups: ['go'],
        rank: 2,
    },
    {
        id: 'kimi-k3',
        displayName: 'Kimi K3',
        family: 'kimi',
        contextWindow: CONTEXT_1M,
        reasoning: GO_FULL_REASONING,
        vision: true,
        groups: ['go'],
        rank: 3,
    },
    {
        id: 'deepseek-v4-pro',
        displayName: 'DeepSeek V4 Pro',
        family: 'deepseek',
        contextWindow: 1_000_000,
        reasoning: GO_FULL_REASONING,
        vision: false,
        groups: ['go'],
        rank: 4,
    },
    {
        id: 'qwen3.8-max',
        displayName: 'Qwen3.8 Max',
        family: 'qwen',
        contextWindow: 1_000_000,
        reasoning: GO_FULL_REASONING,
        vision: true,
        groups: ['go'],
        rank: 5,
    },
    {
        id: 'grok-4.6',
        displayName: 'Grok 4.6',
        family: 'grok',
        contextWindow: 500_000,
        reasoning: GO_RESPONSES_REASONING,
        vision: true,
        protocol: 'responses',
        groups: ['go'],
        rank: 6,
    },
    {
        // Listed by the endpoint and serviceable on /v1/responses, which the Go
        // gateway refuses to advertise. With no entry here the id fell back to the
        // group's chat protocol and every call answered 503 "Endpoint is
        // unavailable" (measured). Its effort vocabulary was probed model by model
        // rather than inherited: minimal/low/medium/high/xhigh all answer 200 and
        // none/max answer 400 -- the same set as grok-4.6, verified separately.
        id: 'grok-4.7',
        displayName: 'Grok 4.7',
        family: 'grok',
        contextWindow: 500_000,
        reasoning: GO_RESPONSES_REASONING,
        vision: true,
        protocol: 'responses',
        groups: ['go'],
        rank: 7,
    },
    { id: 'deepseek-v4-flash', displayName: 'DeepSeek V4 Flash', family: 'deepseek', contextWindow: 1_000_000, reasoning: GO_FULL_REASONING, vision: false, groups: ['go'] },
    { id: 'deepseek-v4-flash-vision-exp', displayName: 'DeepSeek V4 Flash Vision', family: 'deepseek', contextWindow: 1_000_000, reasoning: GO_FULL_REASONING, vision: true, groups: ['go'] },
    // Live-listed but absent from models.dev: the window is unverified, so the
    // entry keeps the family floor rather than claiming the generation's 1M.
    { id: 'deepseek-flash', displayName: 'DeepSeek Flash', family: 'deepseek', contextWindow: FALLBACK_CONTEXT_WINDOW, reasoning: GO_FULL_REASONING, groups: ['go'] },
    { id: 'glm-5.1', displayName: 'GLM-5.1', family: 'glm', contextWindow: 202_752, reasoning: GO_GLM_REASONING, vision: false, groups: ['go'] },
    { id: 'glm-5.2', displayName: 'GLM-5.2', family: 'glm', contextWindow: 1_000_000, reasoning: GO_GLM_REASONING, vision: false, groups: ['go'] },
    { id: 'glm-5.3-flash', displayName: 'GLM-5.3 Flash', family: 'glm', contextWindow: 1_000_000, reasoning: GO_FULL_REASONING, vision: true, groups: ['go'] },
    {
        id: 'gpt-5.6-luna',
        displayName: 'GPT-5.6 Luna',
        family: 'gpt',
        contextWindow: 1_050_000,
        // `minimal` answers 400; `none` disables.
        reasoning: { efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium' },
        vision: true,
        protocol: 'responses',
        groups: ['go'],
    },
    // hy3 and hy4-preview accept the effort field but never emit thinking on any
    // effort, so they carry no vocabulary — an effort picker would promise a
    // knob the model does not have.
    { id: 'hy3', displayName: 'HY-3', family: 'hunyuan', contextWindow: 256_000, vision: false, groups: ['go'] },
    { id: 'hy4-preview', displayName: 'HY-4 Preview', family: 'hunyuan', contextWindow: 1_024_000, vision: false, groups: ['go'] },
    // kimi-k2.6 and mimo-v2.5 accept the field but never stream thinking.
    { id: 'kimi-k2.6', displayName: 'Kimi K2.6', family: 'kimi', contextWindow: CONTEXT_256K, vision: true, groups: ['go'] },
    {
        id: 'kimi-k2.7-code',
        displayName: 'Kimi K2.7 Code',
        family: 'kimi',
        contextWindow: CONTEXT_256K,
        // `none` answers 400 on this route; `off` is the disabling word.
        reasoning: { efforts: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium' },
        vision: true,
        groups: ['go'],
    },
    { id: 'longcat-2.0', displayName: 'LongCat 2.0', family: 'longcat', contextWindow: 1_000_000, reasoning: GO_FULL_REASONING, vision: false, groups: ['go'] },
    { id: 'mimo-v2.5', displayName: 'MiMo V2.5', family: 'mimo', contextWindow: 1_000_000, vision: true, groups: ['go'] },
    {
        id: 'mimo-v2.5-pro',
        displayName: 'MiMo V2.5 Pro',
        family: 'mimo',
        contextWindow: CONTEXT_1M,
        // `minimal`, `xhigh`, `max` and `off` all answer 400.
        reasoning: { efforts: ['none', 'low', 'medium', 'high'], defaultEffort: 'medium' },
        vision: false,
        groups: ['go'],
    },
    {
        id: 'minimax-m2.5',
        displayName: 'MiniMax M2.5',
        family: 'minimax',
        contextWindow: CONTEXT_200K,
        // Reasoning is mandatory: `none`, `off` and `minimum` answer 400. The
        // stream arrives on `delta.reasoning` (plus `reasoning_details`), not
        // `reasoning_content`.
        reasoning: { efforts: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium' },
        vision: false,
        groups: ['go'],
    },
    {
        id: 'minimax-m3',
        displayName: 'MiniMax M3',
        family: 'minimax',
        contextWindow: 1_000_000,
        reasoning: GO_FULL_REASONING,
        vision: true,
        // Thinking streams inline inside `delta.content` as `<think>…</think>`.
        inlineReasoning: true,
        groups: ['go'],
    },
    {
        id: 'muse-spark-1.2-contributor',
        displayName: 'Muse Spark 1.2 Contributor',
        family: 'meta',
        contextWindow: CONTEXT_1M,
        reasoning: GO_RESPONSES_REASONING,
        vision: true,
        protocol: 'responses',
        groups: ['go'],
    },
    {
        id: 'muse-spark-1.3-contributor',
        displayName: 'Muse Spark 1.3 Contributor',
        family: 'meta',
        contextWindow: CONTEXT_1M,
        reasoning: GO_RESPONSES_REASONING,
        vision: true,
        protocol: 'responses',
        groups: ['go'],
    },
    {
        id: 'omen-alpha',
        displayName: 'Omen Alpha',
        family: 'omen',
        contextWindow: 500_000,
        // `xhigh` answers 400; `off` and `minimum` are refused spellings.
        reasoning: { efforts: ['none', 'minimal', 'low', 'medium', 'high', 'max'], defaultEffort: 'medium' },
        vision: true,
        groups: ['go'],
    },
    {
        id: 'qwen3.6-plus',
        displayName: 'Qwen3.6 Plus',
        family: 'qwen',
        contextWindow: 1_000_000,
        // This route's minimal step is spelled `minimum`; `minimal`, `max` and
        // `off` all answer 400.
        reasoning: { efforts: ['none', 'minimum', 'low', 'medium', 'high', 'xhigh'], defaultEffort: 'medium' },
        vision: true,
        groups: ['go'],
    },
    { id: 'qwen3.7-max', displayName: 'Qwen3.7 Max', family: 'qwen', contextWindow: 1_000_000, reasoning: GO_QWEN37_REASONING, vision: false, groups: ['go'] },
    { id: 'qwen3.7-plus', displayName: 'Qwen3.7 Plus', family: 'qwen', contextWindow: 1_000_000, reasoning: GO_QWEN37_REASONING, vision: true, groups: ['go'] },
    { id: 'qwen3.8-flash', displayName: 'Qwen3.8 Flash', family: 'qwen', contextWindow: 1_000_000, reasoning: GO_FULL_REASONING, vision: true, groups: ['go'] },
    /* ---------------------------------------------------------------------
     * The 2026-09 generation, added after a live listing sweep found them
     * served but absent from this registry. Until an entry exists a model still
     * appears in the menu -- the listing is the membership source -- but with the
     * family floor for a window, no effort vocabulary, and the permissive vision
     * default, so its metadata is simply wrong.
     *
     * Windows and vision come from models.dev's opencode-go entry (the same
     * source this registry already cites). Where models.dev publishes an effort
     * list it is used verbatim; where it publishes none the entry carries no
     * vocabulary, because a model with no selectable depth must not be offered a
     * picker that promises one.
     * ------------------------------------------------------------------- */
    // models.dev publishes no effort list: reasoning is on, with no selectable
    // depth. kimi-k2.6 beside it behaves the same way.
    { id: 'kimi-k2.5', displayName: 'Kimi K2.5', family: 'kimi', contextWindow: CONTEXT_256K, vision: true, groups: ['go'] },
    { id: 'glm-5', displayName: 'GLM-5', family: 'glm', contextWindow: 202_752, vision: false, groups: ['go'] },
    { id: 'mimo-v2-pro', displayName: 'MiMo V2 Pro', family: 'mimo', contextWindow: CONTEXT_1M, vision: false, groups: ['go'] },
    { id: 'mimo-v2-omni', displayName: 'MiMo V2 Omni', family: 'mimo', contextWindow: CONTEXT_256K, vision: true, groups: ['go'] },
    { id: 'mimo-v2.6-pro', displayName: 'MiMo V2.6 Pro', family: 'mimo', contextWindow: CONTEXT_1M, vision: true, groups: ['go'] },
    { id: 'mimo-v2.6-flash', displayName: 'MiMo V2.6 Flash', family: 'mimo', contextWindow: CONTEXT_1M, vision: true, groups: ['go'] },
    { id: 'longcat-2.5-preview-free', displayName: 'LongCat 2.5 Preview', family: 'longcat', contextWindow: 1_000_000, vision: true, groups: ['go'] },
    // Qwen3.5 carries a toggle only, so thinking is on or off and never graded;
    // an effort picker here would invent levels the route does not take.
    { id: 'qwen3.5-plus', displayName: 'Qwen3.5 Plus', family: 'qwen', contextWindow: CONTEXT_256K, vision: true, groups: ['go'] },
    {
        id: 'space-bunny-free',
        displayName: 'Space Bunny Free',
        family: 'stealth',
        contextWindow: CONTEXT_1M,
        reasoning: { efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium' },
        vision: true,
        groups: ['go'],
    },
    {
        id: 'grok-4.5',
        displayName: 'Grok 4.5',
        family: 'grok',
        contextWindow: 500_000,
        // Grok 4.6/4.7 beside it serve /v1/responses only and take
        // minimal/low/medium/high/xhigh. models.dev publishes low/medium/high for
        // 4.5 with no protocol note, so this entry claims only what is published
        // rather than inheriting the sibling's wider, differently-probed set.
        reasoning: { efforts: ['low', 'medium', 'high'], defaultEffort: 'medium' },
        vision: true,
        groups: ['go'],
    },
    {
        id: 'gpt-6-luna',
        displayName: 'GPT-6 Luna',
        family: 'gpt',
        contextWindow: 1_050_000,
        // The GPT-5 generation on this route serves /v1/responses; the same is
        // assumed here and the entry is marked as such so a wrong assumption fails
        // as a wrong protocol rather than as a silent 503 on the chat surface.
        reasoning: { efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium' },
        vision: true,
        protocol: 'responses',
        groups: ['go'],
    },
];
/**
 * Ids the Go endpoint lists but cannot serve a chat turn for on any wire
 * protocol, verified by request: `minimax-m2.7` answers 503 on both
 * chat-completions and responses, and `hy3-preview` answers 400
 * "Model is unavailable". They stay listed (the probe table names them) but
 * never reach the menu.
 */
export const GO_REFUSED_MODEL_IDS = ['hy3-preview', 'minimax-m2.7'];
/** Go menu leads: the models whose thinking actually streams, in preference order. */
export const GO_DEFAULT_RECOMMENDED = GO_REGISTRY
    .filter(entry => entry.rank !== undefined)
    .slice()
    .sort((left, right) => left.rank - right.rank)
    .map(entry => entry.id);
