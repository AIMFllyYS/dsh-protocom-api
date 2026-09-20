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
import { CONTEXT_1M, CONTEXT_200K, CONTEXT_256K, CONTEXT_LADDER, GROUP_DEFAULTS } from "./groups.js";
export { CONTEXT_LADDER } from "./groups.js";
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
 * The ladder steps one model can offer. A window below the whole ladder still
 * offers itself, so no model is left without a choice.
 * @param contextWindow - the model's declared capacity.
 * @returns the offered lengths, smallest first.
 */
export function contextChoicesFor(contextWindow) {
    const offered = CONTEXT_LADDER.filter(length => length <= contextWindow);
    return offered.length > 0 ? [...offered] : [contextWindow];
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
        reasoning: { efforts: ['low', 'high'], defaultEffort: 'high' },
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
        reasoning: { efforts: ['off', 'low', 'medium', 'high'], defaultEffort: 'high' },
        vision: true,
        rank: 3,
    },
    {
        id: 'deepseek/deepseek-v4.1-flash',
        displayName: 'DeepSeek V4.1 Flash',
        family: 'deepseek',
        contextWindow: CONTEXT_1M,
        reasoning: { efforts: ['off', 'low', 'high', 'max'], defaultEffort: 'off' },
        vision: true,
    },
    {
        id: 'deepseek-v4.1-flash',
        displayName: 'DeepSeek V4.1 Flash',
        family: 'deepseek',
        contextWindow: CONTEXT_1M,
        reasoning: { efforts: ['off', 'low', 'high', 'max'], defaultEffort: 'off' },
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
        reasoning: { efforts: ['low', 'medium', 'high'], defaultEffort: 'high' },
        vision: true,
    },
    {
        id: 'mimo-v2.5-pro',
        displayName: 'MiMo V2.5 Pro',
        family: 'mimo',
        contextWindow: CONTEXT_1M,
        reasoning: { efforts: ['off', 'low', 'medium', 'high'], defaultEffort: 'high' },
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
];
/** Find the registry entry for one upstream id. */
export function matchRegistry(id) {
    return REGISTRY.find(entry => entry.id === id);
}
/** Whether one registry entry is a membership source for a group. */
export function servesGroup(entry, key) {
    return entry.groups?.includes(key) === true;
}
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
export const REFUSED_CHAT_MODEL_IDS = [
    'step-3.5-flash',
    'step-3.5-flash-2603',
    'step-explore',
    'step-image-edit-2',
    'stepaudio-2.5-asr',
    'stepaudio-2.5-chat',
    'stepaudio-2.5-realtime',
    'stepaudio-2.5-tts',
];
/** Whether the endpoint's chat route answers for one upstream id. */
export function servesChat(id) {
    return !REFUSED_CHAT_MODEL_IDS.includes(id);
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
export function acceptsImages(id, declared) {
    const chosen = declared?.get(identityKey(id));
    if (chosen !== undefined)
        return chosen;
    return matchRegistry(id)?.vision !== false;
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
export function identityKey(id) {
    const entry = matchRegistry(id);
    if (entry === undefined)
        return id;
    return REGISTRY.find(candidate => candidate.displayName === entry.displayName)?.id ?? id;
}
/** Collapse the registry into one identity per display name, in registry order. */
export function modelIdentities() {
    const byName = new Map();
    for (const entry of REGISTRY) {
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
    return tokens >= 1_048_576 && tokens % 1_048_576 === 0
        ? `${tokens / 1_048_576}M`
        : `${Math.round(tokens / 1024)}K`;
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
export function catalogEntry(upstream, groupReasoning, declaredVision) {
    const entry = matchRegistry(upstream.id);
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
            ...reasoning === undefined ? {} : { reasoning },
            vision: acceptsImages(upstream.id, declaredVision),
            rank: Number.MAX_SAFE_INTEGER,
        };
    }
    return {
        upstreamId: upstream.id,
        displayName: entry.displayName,
        contextWindow: entry.contextWindow,
        contextOptions: contextChoicesFor(entry.contextWindow),
        ...reasoning === undefined ? {} : { reasoning },
        vision: acceptsImages(upstream.id, declaredVision),
        rank: entry.rank ?? Number.MAX_SAFE_INTEGER,
    };
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
    const rows = listing === undefined ? [] : [...listing];
    for (const entry of REGISTRY) {
        if (!servesGroup(entry, key))
            continue;
        if (!rows.some(row => row.id === entry.id))
            rows.push({ id: entry.id });
    }
    // "No listing" and "empty listing" are both no information, not "no models".
    if (rows.length === 0 && options.registryFallback !== false) {
        for (const entry of REGISTRY)
            rows.push({ id: entry.id });
    }
    const rankOf = (id) => {
        const at = options.recommended?.indexOf(identityKey(id)) ?? -1;
        return at === -1 ? Number.MAX_SAFE_INTEGER : at;
    };
    const ranked = rows
        .filter(row => servesChat(row.id) && options.hidden?.has(row.id) !== true)
        .map((row, index) => ({ index, row, rank: rankOf(row.id) }))
        .sort((left, right) => left.rank - right.rank || left.index - right.index);
    const byName = new Map();
    for (const { row } of ranked) {
        const model = catalogEntry(row, GROUP_DEFAULTS[key].reasoning, options.vision);
        const hit = byName.get(model.displayName);
        if (hit === undefined) {
            byName.set(model.displayName, {
                upstreamId: row.id,
                ids: [row.id],
                displayName: model.displayName,
                contextWindow: model.contextWindow,
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
