/** Endpoint root. `/chat/completions` is appended for a turn. */
export const CLINEPASS_BASE_URL = 'https://api.cline.bot/api/v1';
/** The origin a stored key may be sent to without explicit confirmation. */
export const CLINEPASS_BASE_URL_ORIGIN = new URL(CLINEPASS_BASE_URL).origin;
/** The one provider route this family registers. */
export const CLINEPASS_PROVIDER = 'clinepass';
/**
 * Credential references this family resolves.
 *
 * Cline issues plain API keys from Settings > API Keys, so the pool is a
 * first-class fit: every distinct reference is an independent subscription,
 * and `CLINE_API_KEY_2` pools a second one exactly as it does for the other
 * families. The namespace bound keeps the environment fallback from reading
 * an arbitrary variable.
 */
export const CLINEPASS_CREDENTIAL_REF = /^CLINE_[A-Z0-9_]+$/;
/** The conventional credential reference a stored key lives under. */
export const CLINEPASS_KEY_REF = 'CLINE_API_KEY';
/**
 * Context lengths offered as picker variants.
 *
 * The same four steps the other subscription families offer, so a budget means
 * the same thing whichever subscription serves it. The ladder is a CEILING,
 * never an override: a model is only offered steps within its own window, and
 * its own window is always the last step it can reach.
 */
export const CLINEPASS_CONTEXT_LADDER = [200_000, 256_000, 400_000, 1_000_000];
/**
 * Ids Cline documents as retired from ClinePass.
 *
 * "Due to capacity constraints and model upgrades, GLM-5.2, Kimi K2.6, Kimi
 * K2.7 Code, and DeepSeek V4 Flash are no longer available on ClinePass."
 * Named rather than merely omitted, so a deployment that had one selected
 * reads "the endpoint does not serve this" instead of an unexplained 400, and
 * restoring one is a single line.
 */
export const CLINEPASS_REFUSED_MODEL_IDS = [
    'cline-pass/glm-5.2',
    'cline-pass/kimi-k2.6',
    'cline-pass/kimi-k2.7-code',
    'cline-pass/deepseek-v4-flash',
];
/**
 * The vocabulary of a model whose catalog entry declares a reasoning TOGGLE
 * rather than effort levels.
 *
 * Cline's own normalizer maps a bare `enabled: true` to `medium`, so `medium`
 * is the on-state spelled as a level and `none` is the off-state. Offering the
 * two is what makes the switch reachable; inventing low/high for a model that
 * has no such setting would be a menu the gateway cannot honour.
 */
const CLINE_TOGGLE_REASONING = { efforts: ['none', 'medium'], defaultEffort: 'medium' };
/** Effort levels, for a model whose catalog declares them explicitly. */
const efforts = (values, defaultEffort) => ({ efforts: values, defaultEffort });
/**
 * The fourteen models ClinePass includes.
 *
 * Ids are Cline's own, cross-checked against the live `recommended-models`
 * endpoint. Every entry is tagged for the group, because the endpoint's
 * `/models` listing is NOT a membership source for this family -- see
 * ProviderFamily.listingIsMembership -- so this registry IS the menu.
 *
 * Context windows, image support and reasoning vocabularies are taken verbatim
 * from Cline's own bundled model catalog, which is the only source that states
 * them. They are NOT from models.dev: that consensus disagrees with Cline on
 * several of these models, and most sharply on qwen3.8-max, where it reports
 * 1,000,000 tokens and image support for a model Cline serves at 128,000 with
 * neither. Where a vendor publishes its own numbers, those win.
 */
export const CLINEPASS_REGISTRY = [
    // 1,048,576 with a 131,072 output ceiling; accepts image, video and audio.
    { id: 'cline-pass/mimo-v2.6-flash', displayName: 'MiMo V2.6 Flash', family: 'mimo', contextWindow: 1_048_576, reasoning: CLINE_TOGGLE_REASONING, vision: true, groups: ['clinepass'] },
    { id: 'cline-pass/mimo-v2.6-pro', displayName: 'MiMo V2.6 Pro', family: 'mimo', contextWindow: 1_048_576, reasoning: CLINE_TOGGLE_REASONING, vision: true, groups: ['clinepass'] },
    // 1,310,720 -- larger than any other model here, and larger than the 1M
    // ladder step, so its own window is the step that matters.
    { id: 'cline-pass/glm-5.3', displayName: 'GLM-5.3', family: 'glm', contextWindow: 1_310_720, reasoning: efforts(['low', 'high', 'max'], 'high'), vision: false, groups: ['clinepass'] },
    { id: 'cline-pass/glm-5.3-flash', displayName: 'GLM-5.3 Flash', family: 'glm', contextWindow: 1_310_720, reasoning: efforts(['low', 'high', 'max'], 'high'), vision: true, groups: ['clinepass'] },
    // Both a toggle and effort levels, so the effort set is the one that carries
    // the disabling word as well.
    { id: 'cline-pass/kimi-k3', displayName: 'Kimi K3', family: 'kimi', contextWindow: 1_048_576, reasoning: efforts(['none', 'low', 'high', 'max'], 'high'), vision: true, groups: ['clinepass'] },
    { id: 'cline-pass/deepseek-v4-pro', displayName: 'DeepSeek V4 Pro', family: 'deepseek', contextWindow: 1_048_576, reasoning: efforts(['none', 'high', 'xhigh'], 'high'), vision: false, groups: ['clinepass'] },
    { id: 'cline-pass/deepseek-v4.1-flash', displayName: 'DeepSeek V4.1 Flash', family: 'deepseek', contextWindow: 1_048_576, reasoning: efforts(['none', 'low', 'high', 'max'], 'high'), vision: true, groups: ['clinepass'] },
    // 1,050,000 rather than the 1,048,576 its family usually declares.
    { id: 'cline-pass/mimo-v2.5', displayName: 'MiMo V2.5', family: 'mimo', contextWindow: 1_050_000, reasoning: CLINE_TOGGLE_REASONING, vision: true, groups: ['clinepass'] },
    { id: 'cline-pass/mimo-v2.5-pro', displayName: 'MiMo V2.5 Pro', family: 'mimo', contextWindow: 1_050_000, reasoning: CLINE_TOGGLE_REASONING, vision: false, groups: ['clinepass'] },
    { id: 'cline-pass/minimax-m3', displayName: 'MiniMax M3', family: 'minimax', contextWindow: 1_048_576, reasoning: CLINE_TOGGLE_REASONING, vision: true, groups: ['clinepass'] },
    { id: 'cline-pass/muse-spark-1.3-contributor', displayName: 'Muse Spark 1.3 Contributor', family: 'meta', contextWindow: 1_048_576, reasoning: efforts(['minimal', 'low', 'medium', 'high', 'xhigh', 'max'], 'medium'), vision: true, groups: ['clinepass'] },
    // 128,000 and an 8,192 output ceiling -- roughly a tenth of every sibling --
    // with NO reasoning declared and no image support. Worth stating because
    // models.dev reports 1,000,000 and vision for this id, and a menu built on
    // that would promise eight times the window the gateway serves.
    { id: 'cline-pass/qwen3.8-max', displayName: 'Qwen3.8 Max', family: 'qwen', contextWindow: 128_000, vision: false, groups: ['clinepass'] },
    { id: 'cline-pass/qwen3.7-max', displayName: 'Qwen3.7 Max', family: 'qwen', contextWindow: 1_000_000, reasoning: CLINE_TOGGLE_REASONING, vision: false, groups: ['clinepass'] },
    { id: 'cline-pass/qwen3.7-plus', displayName: 'Qwen3.7 Plus', family: 'qwen', contextWindow: 1_000_000, reasoning: CLINE_TOGGLE_REASONING, vision: true, groups: ['clinepass'] },
];
/**
 * Models that lead this family's menu when the deployment chooses none.
 *
 * Empty on purpose, like Command Code's: the fourteen are all curated by Cline
 * for agent work, and any order this plugin invented would be a preference the
 * vendor never expressed.
 */
export const CLINEPASS_RECOMMENDED = [];
/**
 * The ClinePass family. One group, one route, no session header.
 *
 * `listingIsMembership: false` is the load-bearing difference from its
 * siblings: Cline's `/api/v1/models` is a different catalog entirely, so this
 * registry is the menu rather than a supplement to a listing.
 *
 * `chatThinking: 'reasoning-object'` sends `reasoning: {enabled, effort}` with
 * no `thinking` block and no bare `reasoning_effort`. The two third-party
 * implementations disagree and neither Cline's docs nor its SDK names the
 * field for these ids, so this follows the only one that OBSERVED it on the
 * wire, which also recorded that `reasoning_effort` was NOT what it sent. That
 * is the weakest evidence in this file and it is recorded, not hidden: if live
 * testing shows otherwise, this one word is the change.
 */
export const CLINEPASS = {
    ns: 'clinepass',
    sectionKey: 'clinepass',
    label: 'ClinePass',
    baseURL: CLINEPASS_BASE_URL,
    origin: CLINEPASS_BASE_URL_ORIGIN,
    credentialRef: CLINEPASS_CREDENTIAL_REF,
    keys: ['clinepass'],
    defaults: {
        clinepass: {
            displayName: 'ClinePass',
            protocol: 'chat-completions',
            contextLengths: CLINEPASS_CONTEXT_LADDER,
        },
    },
    providerOf: () => CLINEPASS_PROVIDER,
    groupOf: provider => (provider === CLINEPASS_PROVIDER ? 'clinepass' : undefined),
    keyRef: () => CLINEPASS_KEY_REF,
    recommended: CLINEPASS_RECOMMENDED,
    registry: CLINEPASS_REGISTRY,
    refused: CLINEPASS_REFUSED_MODEL_IDS,
    listingIsMembership: false,
    chatThinking: 'reasoning-object',
};
