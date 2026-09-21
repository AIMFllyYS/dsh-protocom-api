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
export function matchRegistry(id, registry = REGISTRY) {
    return registry.find(entry => entry.id === id);
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
            ...reasoning === undefined ? {} : { reasoning },
            vision: acceptsImages(upstream.id, declaredVision, registry),
            rank: Number.MAX_SAFE_INTEGER,
        };
    }
    return {
        upstreamId: upstream.id,
        displayName: entry.displayName,
        contextWindow: entry.contextWindow,
        contextOptions: contextChoicesFor(entry.contextWindow),
        ...reasoning === undefined ? {} : { reasoning },
        vision: acceptsImages(upstream.id, declaredVision, registry),
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
        .filter(row => servesChat(row.id, refused) && options.hidden?.has(row.id) !== true)
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
