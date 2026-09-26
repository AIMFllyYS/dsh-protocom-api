/**
 * Per-model reasoning-effort vocabulary for the Command Code gateway.
 *
 * The endpoints listing carries routing truth only: its rows are exactly
 * id/object/created/owned_by/name/context_length/supported_endpoints, with no
 * reasoning field of any kind. The vendor capability page says whether a model can
 * reason at all, but publishes no effort list either -- so on its own the menu had a
 * boolean and nothing to render, and no model ever offered an Effort choice.
 *
 * These tiers come from the vendor own CLI catalog, which the CLI uses for its
 * `model:effort` shorthand:
 *   https://unpkg.com/command-code@latest/dist/bundled/command-code-knowledge/reference/models.md
 * Snapshot archived at .agents/commandcode-models-md-2026-09-27.md.
 *
 * VERIFIED 2026-09-27: the catalog lists 82 models and the live endpoints listing
 * returned 82 rows, joining 82/82 on the EXACT id. Tiers are per-model and NOT
 * uniform, so one group-wide vocabulary would send levels a model refuses.
 *
 * An empty list means the model chooses its own depth: the CLI accepts no effort for
 * it, so sending one would be an unsupported field. Such a model is offered no
 * Effort control rather than a fabricated one.
 *
 * @module dsh-protocom-api/commandcode-tiers
 */
/** Models sharing one vocabulary, keyed by the comma-joined efforts. */
const SETS = {
    "none": [
        "MiniMaxAI/MiniMax-M2.5", "MiniMaxAI/MiniMax-M2.7", "Qwen/Qwen3.6-Max-Preview",
        "Qwen/Qwen3.6-Plus", "Qwen/Qwen3.7-Flash", "Qwen/Qwen3.7-Max",
        "Qwen/Qwen3.7-Plus", "claude-haiku-4-5-20251001", "inclusionai/ling-3.0-flash-sante:free",
        "meituan/LongCat-2.0", "moonshotai/Kimi-K2.5", "moonshotai/Kimi-K2.6",
        "moonshotai/Kimi-K2.7-Code", "moonshotai/Kimi-K2.7-Code-Highspeed", "nvidia/nemotron-3-ultra-550b-a55b",
        "poolside/laguna-s-2.1-free", "stepfun/Step-3.5-Flash", "stepfun/Step-3.7-Flash",
        "tencent/hy3-paid", "thinkingmachines/inkling", "thinkingmachines/inkling-small",
        "xiaomi/mimo-v2.5", "xiaomi/mimo-v2.5-pro", "xiaomi/mimo-v2.6-flash",
        "xiaomi/mimo-v2.6-pro", "xiaomi/mimo-v2.6-pro-ultraspeed", "zai-org/GLM-5",
        "zai-org/GLM-5.1", "zai-org/GLM-5.2-Fast",
    ],
    "low,medium,high,xhigh,max": [
        "claude-fable-5", "claude-fable-5-1", "claude-opus-4-7",
        "claude-opus-4-8", "claude-opus-5", "claude-opus-5-5",
        "claude-sonnet-4-6", "claude-sonnet-5", "gpt-5.6-luna",
        "gpt-5.6-sol", "gpt-5.6-terra", "gpt-6-astra",
        "gpt-6-luna", "gpt-6-sol", "meta/muse-spark-1.3",
    ],
    "low,medium,high": [
        "MiniMaxAI/MiniMax-M3", "google/gemini-3.1-flash-lite", "google/gemini-3.5-flash",
        "google/gemini-3.5-flash-lite", "google/gemini-3.6-flash", "google/gemini-3.7-flash",
        "google/gemini-3.8-flash", "gpt-5.4-mini", "stealth/space-bunny-alpha",
        "stepfun/Step-5-Preview", "tencent/hy4-preview", "xai/grok-4.5",
    ],
    "low,medium,high,xhigh": [
        "gpt-5.3-codex", "gpt-5.4", "gpt-5.5",
        "meta/muse-spark-1.1", "meta/muse-spark-1.2", "meta/muse-spark-1.2-contributor",
        "meta/muse-spark-1.3-contributor", "xai/grok-4.6", "xai/grok-4.7",
    ],
    "low,high,max": [
        "deepseek/deepseek-v4-flash-fast", "deepseek/deepseek-v4.1-flash", "moonshotai/Kimi-K3",
        "z-ai/glm-5.3-flash", "z-ai/glm-5.3-flashx", "zai-org/GLM-5.3",
    ],
    "low,medium,xhigh": [
        "Qwen/Qwen3.8-27B", "Qwen/Qwen3.8-Flash", "Qwen/Qwen3.8-Max",
        "Qwen/Qwen3.8-Max-0902", "Qwen/Qwen3.8-Omni-Flash", "stealth/pixel-canary",
    ],
    "high,max": [
        "deepseek/deepseek-v4-flash", "deepseek/deepseek-v4-flash-vision-exp", "deepseek/deepseek-v4-pro",
        "zai-org/GLM-5.2",
    ],
    "high,xhigh": [
        "sakana/fugu-ultra",
    ],
};
/** Upstream id -> its effort vocabulary. */
const BY_ID = new Map();
for (const [key, ids] of Object.entries(SETS)) {
    if (key === 'none')
        continue;
    const efforts = key.split(',');
    // The vendor default: the CLI sends no effort until one is chosen, and `high` is
    // the level the docs lead with for every model that accepts it.
    const defaultEffort = efforts.includes('high') ? 'high' : efforts[0];
    for (const id of ids)
        BY_ID.set(id, { efforts, defaultEffort });
}
/**
 * The effort vocabulary this gateway accepts for one upstream id.
 * @param upstreamId - the model id as the endpoints listing reports it.
 * @returns its efforts, or undefined when it takes none or is unknown.
 */
export function commandCodeReasoning(upstreamId) {
    return BY_ID.get(upstreamId);
}
