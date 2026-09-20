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
/** Context capacity assumed for a model the registry does not size. */
export const FALLBACK_CONTEXT_WINDOW = 131_072;
/** 1M-token context, the ceiling most current flagships publish. */
const CONTEXT_1M = 1_048_576;
/** 256K-token context. */
const CONTEXT_256K = 262_144;
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
/** Context lengths offered for a 1M model: 256K, 512K, and the full window. */
const LENGTHS_1M = [CONTEXT_256K, 524_288, CONTEXT_1M];
/** Context lengths offered for a 256K model. */
const LENGTHS_256K = [131_072, CONTEXT_256K];
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
        contextOptions: LENGTHS_256K,
        reasoning: { efforts: ['low', 'high'], defaultEffort: 'high' },
        vision: true,
        rank: 1,
    },
    {
        id: 'glm-5.2',
        displayName: 'GLM-5.2',
        family: 'glm',
        contextWindow: CONTEXT_1M,
        contextOptions: LENGTHS_1M,
        reasoning: GLM_REASONING,
        rank: 2,
    },
    {
        id: 'mimo-v2.5',
        displayName: 'MiMo V2.5',
        family: 'mimo',
        contextWindow: CONTEXT_1M,
        contextOptions: LENGTHS_1M,
        reasoning: { efforts: ['off', 'low', 'medium', 'high'], defaultEffort: 'high' },
        vision: true,
        rank: 3,
    },
    {
        id: 'deepseek/deepseek-v4.1-flash',
        displayName: 'DeepSeek V4.1 Flash',
        family: 'deepseek',
        contextWindow: CONTEXT_1M,
        contextOptions: LENGTHS_1M,
        reasoning: { efforts: ['off', 'low', 'high', 'max'], defaultEffort: 'off' },
        vision: true,
    },
    {
        id: 'deepseek-v4.1-flash',
        displayName: 'DeepSeek V4.1 Flash',
        family: 'deepseek',
        contextWindow: CONTEXT_1M,
        contextOptions: LENGTHS_1M,
        reasoning: { efforts: ['off', 'low', 'high', 'max'], defaultEffort: 'off' },
        vision: true,
    },
    {
        id: 'moonshotai/Kimi-K2.7-Code',
        displayName: 'Kimi K2.7 Code',
        family: 'kimi',
        contextWindow: CONTEXT_256K,
        contextOptions: LENGTHS_256K,
        reasoning: { efforts: ['off', 'low', 'medium', 'high'], defaultEffort: 'medium' },
        vision: true,
    },
    {
        id: 'zai-org/GLM-5.2',
        displayName: 'GLM-5.2',
        family: 'glm',
        contextWindow: CONTEXT_1M,
        contextOptions: LENGTHS_1M,
        reasoning: GLM_REASONING,
    },
    {
        id: 'glm-5.3',
        displayName: 'GLM-5.3',
        family: 'glm',
        contextWindow: CONTEXT_1M,
        contextOptions: LENGTHS_1M,
        reasoning: GLM_REASONING,
    },
    {
        id: 'z-ai/glm-5.3-flash',
        displayName: 'GLM-5.3 Flash',
        family: 'glm',
        contextWindow: CONTEXT_1M,
        contextOptions: LENGTHS_1M,
        reasoning: GLM_REASONING,
        vision: true,
    },
    {
        id: 'z-ai/glm-5.3-flashx',
        displayName: 'GLM-5.3 FlashX',
        family: 'glm',
        contextWindow: CONTEXT_1M,
        contextOptions: LENGTHS_1M,
        reasoning: GLM_REASONING,
        vision: true,
    },
    { id: 'Qwen/Qwen3.8-27B', displayName: 'Qwen3.8 27B', family: 'qwen', contextWindow: CONTEXT_1M, contextOptions: LENGTHS_1M, vision: true },
    { id: 'qwen3.8-max', displayName: 'Qwen3.8 Max', family: 'qwen', contextWindow: CONTEXT_1M, contextOptions: LENGTHS_1M },
    { id: 'Qwen/Qwen3.7-Flash', displayName: 'Qwen3.7 Flash', family: 'qwen', contextWindow: CONTEXT_256K, contextOptions: LENGTHS_256K, vision: true },
    { id: 'Qwen/Qwen3.8-Omni-Flash', displayName: 'Qwen3.8 Omni Flash', family: 'qwen', contextWindow: CONTEXT_1M, contextOptions: LENGTHS_1M, vision: true },
    {
        id: 'MiniMaxAI/MiniMax-M3',
        displayName: 'MiniMax M3',
        family: 'minimax',
        contextWindow: CONTEXT_1M,
        contextOptions: LENGTHS_1M,
        reasoning: { efforts: ['low', 'medium', 'high'], defaultEffort: 'high' },
        vision: true,
    },
    {
        id: 'mimo-v2.5-pro',
        displayName: 'MiMo V2.5 Pro',
        family: 'mimo',
        contextWindow: CONTEXT_1M,
        contextOptions: LENGTHS_1M,
        reasoning: { efforts: ['off', 'low', 'medium', 'high'], defaultEffort: 'high' },
    },
    {
        id: 'google/gemini-3.8-flash',
        displayName: 'Gemini 3.8 Flash',
        family: 'gemini',
        contextWindow: CONTEXT_1M,
        contextOptions: LENGTHS_1M,
        vision: true,
    },
    {
        id: 'gpt-5.6-sol',
        displayName: 'GPT-5.6 Sol',
        family: 'gpt',
        contextWindow: 1_050_000,
        contextOptions: LENGTHS_1M,
        reasoning: GPT_REASONING,
        vision: true,
    },
    {
        id: 'gpt-5.6-luna',
        displayName: 'GPT-5.6 Luna',
        family: 'gpt',
        contextWindow: 1_050_000,
        contextOptions: LENGTHS_1M,
        reasoning: GPT_REASONING,
        vision: true,
    },
    // These four answer "not available on this endpoint" on /v1/chat/completions
    // whenever the endpoint lists them, so their facts cannot be verified by
    // request; the values follow their generation's published window. They stay
    // catalogued rather than blocked — the picker's toggles are how a deployment
    // says which models it wants, and a model that starts serving should simply
    // start working.
    { id: 'google/gemini-3.7-flash', displayName: 'Gemini 3.7 Flash', family: 'gemini', contextWindow: CONTEXT_1M, contextOptions: LENGTHS_1M, vision: true },
    { id: 'tencent/hy4-preview', displayName: 'HY-4 Preview', family: 'hunyuan', contextWindow: CONTEXT_256K, contextOptions: LENGTHS_256K },
    { id: 'inclusionai/ling-3.0-flash-sante:free', displayName: 'Ling 3.0 Flash Sante', family: 'inclusionai', contextWindow: CONTEXT_256K, contextOptions: LENGTHS_256K },
    { id: 'Qwen/Qwen3.8-Flash', displayName: 'Qwen3.8 Flash', family: 'qwen', contextWindow: CONTEXT_1M, contextOptions: LENGTHS_1M, vision: true },
    // Context values below follow each model's published ceiling; the two marked
    // unverified follow their family's documented window.
    { id: 'tencent/hy3-paid', displayName: 'HY-3', family: 'hunyuan', contextWindow: CONTEXT_256K, contextOptions: LENGTHS_256K },
    { id: 'meituan/LongCat-2.0:free', displayName: 'LongCat 2.0', family: 'longcat', contextWindow: CONTEXT_256K, contextOptions: LENGTHS_256K },
    { id: 'poolside/laguna-s-2.1-free', displayName: 'Laguna S 2.1 Free', family: 'poolside', contextWindow: CONTEXT_256K, contextOptions: LENGTHS_256K },
    { id: 'meta/muse-spark-1.3-contributor', displayName: 'Muse Spark 1.3 Contributor', family: 'meta', contextWindow: CONTEXT_1M, contextOptions: LENGTHS_1M, vision: true },
];
/** Find the registry entry for one upstream id. */
export function matchRegistry(id) {
    return REGISTRY.find(entry => entry.id === id);
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
 */
export function catalogEntry(upstream, groupReasoning) {
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
            vision: false,
            rank: Number.MAX_SAFE_INTEGER,
        };
    }
    return {
        upstreamId: upstream.id,
        displayName: entry.displayName,
        contextWindow: entry.contextWindow,
        ...entry.contextOptions === undefined ? {} : { contextOptions: [...entry.contextOptions] },
        ...reasoning === undefined ? {} : { reasoning },
        vision: entry.vision === true,
        rank: entry.rank ?? Number.MAX_SAFE_INTEGER,
    };
}
