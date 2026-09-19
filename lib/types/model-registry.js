/**
 * The hand-maintained model registry: display names, context capacities, and
 * reasoning vocabularies for the models the Protocom official API is known to
 * serve, keyed by upstream model id. Discovery output is projected through
 * this registry; ids it does not know fall through with the endpoint's own
 * display name (or the raw id) and the fallback context window.
 *
 * @module dsh-protocom-api/model-registry
 */
/** Context capacity assumed for a model the registry does not size. */
export const FALLBACK_CONTEXT_WINDOW = 131_072;
/** The initial registry, built from the observed model listing. */
export const REGISTRY = [
    {
        match: /^deepseek\/deepseek-v4\.1-flash$/,
        displayName: 'DeepSeek V4.1 Flash',
        family: 'deepseek',
        contextWindow: 1_048_576,
        contextOptions: [204_800, 262_144, 409_600, 1_048_576],
        reasoning: { efforts: ['off', 'low', 'high', 'max'], defaultEffort: 'off' },
    },
    {
        match: 'deepseek-v4.1-flash',
        displayName: 'DeepSeek V4.1 Flash',
        family: 'deepseek',
        contextWindow: 1_048_576,
        contextOptions: [204_800, 262_144, 409_600, 1_048_576],
        reasoning: { efforts: ['off', 'low', 'high', 'max'], defaultEffort: 'off' },
    },
    {
        match: 'kimi-k3',
        displayName: 'Kimi K3',
        family: 'kimi',
        contextWindow: 262_144,
        reasoning: { efforts: ['low', 'high'], defaultEffort: 'high' },
    },
    { match: 'glm-5.3', displayName: 'GLM-5.3', family: 'glm', contextWindow: FALLBACK_CONTEXT_WINDOW },
    { match: 'z-ai/glm-5.3-flash', displayName: 'GLM-5.3 Flash', family: 'glm', contextWindow: FALLBACK_CONTEXT_WINDOW },
    { match: 'z-ai/glm-5.3-flashx', displayName: 'GLM-5.3 FlashX', family: 'glm', contextWindow: FALLBACK_CONTEXT_WINDOW },
    { match: 'glm-5.2', displayName: 'GLM-5.2', family: 'glm', contextWindow: FALLBACK_CONTEXT_WINDOW },
    { match: 'zai-org/GLM-5.2', displayName: 'GLM-5.2', family: 'glm', contextWindow: FALLBACK_CONTEXT_WINDOW },
    { match: 'Qwen/Qwen3.8-27B', displayName: 'Qwen3.8 27B', family: 'qwen', contextWindow: FALLBACK_CONTEXT_WINDOW },
    { match: 'Qwen/Qwen3.8-Flash', displayName: 'Qwen3.8 Flash', family: 'qwen', contextWindow: FALLBACK_CONTEXT_WINDOW },
    { match: 'qwen3.8-max', displayName: 'Qwen3.8 Max', family: 'qwen', contextWindow: FALLBACK_CONTEXT_WINDOW },
    { match: 'Qwen/Qwen3.7-Flash', displayName: 'Qwen3.7 Flash', family: 'qwen', contextWindow: FALLBACK_CONTEXT_WINDOW },
    { match: 'Qwen/Qwen3.8-Omni-Flash', displayName: 'Qwen3.8 Omni Flash', family: 'qwen', contextWindow: FALLBACK_CONTEXT_WINDOW },
    { match: 'MiniMaxAI/MiniMax-M3', displayName: 'MiniMax M3', family: 'minimax', contextWindow: FALLBACK_CONTEXT_WINDOW },
    { match: 'moonshotai/Kimi-K2.7-Code', displayName: 'Kimi K2.7 Code', family: 'kimi', contextWindow: FALLBACK_CONTEXT_WINDOW },
    { match: 'mimo-v2.5', displayName: 'MiMo V2.5', family: 'mimo', contextWindow: FALLBACK_CONTEXT_WINDOW },
    { match: 'mimo-v2.5-pro', displayName: 'MiMo V2.5 Pro', family: 'mimo', contextWindow: FALLBACK_CONTEXT_WINDOW },
    { match: 'google/gemini-3.7-flash', displayName: 'Gemini 3.7 Flash', family: 'gemini', contextWindow: FALLBACK_CONTEXT_WINDOW },
    { match: 'google/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', family: 'gemini', contextWindow: FALLBACK_CONTEXT_WINDOW },
    { match: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol', family: 'gpt', contextWindow: FALLBACK_CONTEXT_WINDOW },
    { match: 'gpt-5.6-luna', displayName: 'GPT-5.6 Luna', family: 'gpt', contextWindow: FALLBACK_CONTEXT_WINDOW },
    { match: 'tencent/hy3-paid', displayName: 'HY-3', family: 'hunyuan', contextWindow: FALLBACK_CONTEXT_WINDOW },
    { match: 'tencent/hy4-preview', displayName: 'HY-4 Preview', family: 'hunyuan', contextWindow: FALLBACK_CONTEXT_WINDOW },
    { match: 'meituan/LongCat-2.0:free', displayName: 'LongCat 2.0', family: 'longcat', contextWindow: FALLBACK_CONTEXT_WINDOW },
    // The free-tier suffix is a gateway tag, not part of the model's name
    // (matching the LongCat entry above).
    { match: 'poolside/laguna-s-2.1-free', displayName: 'Laguna S 2.1 Free', family: 'poolside', contextWindow: FALLBACK_CONTEXT_WINDOW },
    { match: 'inclusionai/ling-3.0-flash-sante:free', displayName: 'Ling 3.0 Flash Sante', family: 'inclusionai', contextWindow: FALLBACK_CONTEXT_WINDOW },
    { match: 'meta/muse-spark-1.3-contributor', displayName: 'Muse Spark 1.3 Contributor', family: 'meta', contextWindow: FALLBACK_CONTEXT_WINDOW },
];
/** Find the registry entry for one upstream id. */
export function matchRegistry(id) {
    return REGISTRY.find(entry => typeof entry.match === 'string' ? entry.match === id : entry.match.test(id));
}
/** Short capacity label: 200K, 256K, 400K, 1M. */
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
        };
    }
    return {
        upstreamId: upstream.id,
        displayName: entry.displayName,
        contextWindow: entry.contextWindow,
        ...entry.contextOptions === undefined ? {} : { contextOptions: [...entry.contextOptions] },
        ...reasoning === undefined ? {} : { reasoning },
    };
}
