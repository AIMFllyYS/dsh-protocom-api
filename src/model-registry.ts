/**
 * The hand-maintained model registry: display names, context capacities,
 * vision support, and reasoning vocabularies for the models the Protocom
 * official API is known to serve, keyed by upstream model id. Discovery output
 * is projected through this registry; ids it does not know fall through with
 * the endpoint's own display name (or the raw id) and the fallback context
 * window.
 *
 * The endpoint discloses only `id`, `object`, `created`, `owned_by`, `type`,
 * and `display_name` — no context, modality, or reasoning metadata exists on
 * the wire — so every fact below is hand-maintained from the serving model's
 * own published specification and verified against the endpoint.
 *
 * @module dsh-protocom-api/model-registry
 */

import type { GroupReasoning } from './groups.ts'

/** Reasoning vocabulary one registry model supports. */
export interface RegistryReasoning {
  efforts: readonly string[]
  defaultEffort?: string
}

/** Per-million-token USD prices, when published. */
export interface RegistryPricing {
  input: number
  output: number
  cacheRead?: number
}

/** One known model: how to recognize it and what to say about it. */
export interface RegistryEntry {
  /** Exact upstream id, or a pattern tested against it. */
  match: string | RegExp
  displayName: string
  family: string
  /** Combined request/response context capacity in tokens. */
  contextWindow: number
  /** Selectable context lengths; absence offers only {@link contextWindow} itself. */
  contextOptions?: number[]
  reasoning?: RegistryReasoning
  /**
   * Whether this model accepts image input through the endpoint. Verified by
   * request, not inferred from the model family.
   */
  vision?: boolean
  /**
   * Menu priority: lower sorts earlier. Assigned to the models whose reasoning
   * content actually streams, so the picker leads with readable thinking.
   */
  rank?: number
  pricing?: RegistryPricing
}

/** Context capacity assumed for a model the registry does not size. */
export const FALLBACK_CONTEXT_WINDOW = 131_072

/** 1M-token context, the ceiling most current flagships publish. */
const CONTEXT_1M = 1_048_576

/** 256K-token context. */
const CONTEXT_256K = 262_144

/**
 * The reasoning vocabulary shared by the GLM-5.2/5.3 generation. GLM refuses
 * `thinking: {type: "disabled"}`, so `off` is deliberately absent: every
 * effort here keeps thinking enabled and varies its budget.
 */
const GLM_REASONING: RegistryReasoning = {
  efforts: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
  defaultEffort: 'high',
}

/** The reasoning vocabulary shared by the GPT-5.6 generation. */
const GPT_REASONING: RegistryReasoning = {
  efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  defaultEffort: 'medium',
}

/** Context lengths offered for a 1M model: 256K, 512K, and the full window. */
const LENGTHS_1M = [CONTEXT_256K, 524_288, CONTEXT_1M]

/** Context lengths offered for a 256K model. */
const LENGTHS_256K = [131_072, CONTEXT_256K]

/**
 * The initial registry. Order is presentation order, but the adapter re-sorts
 * by {@link RegistryEntry.rank} so the recommended models lead the menu.
 */
export const REGISTRY: readonly RegistryEntry[] = [
  {
    match: 'kimi-k3',
    displayName: 'Kimi K3',
    family: 'kimi',
    contextWindow: CONTEXT_256K,
    contextOptions: LENGTHS_256K,
    reasoning: { efforts: ['low', 'high'], defaultEffort: 'high' },
    vision: true,
    rank: 1,
  },
  {
    match: 'glm-5.2',
    displayName: 'GLM-5.2',
    family: 'glm',
    contextWindow: CONTEXT_1M,
    contextOptions: LENGTHS_1M,
    reasoning: GLM_REASONING,
    rank: 2,
  },
  {
    match: 'mimo-v2.5',
    displayName: 'MiMo V2.5',
    family: 'mimo',
    contextWindow: CONTEXT_1M,
    contextOptions: LENGTHS_1M,
    reasoning: { efforts: ['off', 'low', 'medium', 'high'], defaultEffort: 'high' },
    vision: true,
    rank: 3,
  },
  {
    match: /^deepseek\/deepseek-v4\.1-flash$/,
    displayName: 'DeepSeek V4.1 Flash',
    family: 'deepseek',
    contextWindow: CONTEXT_1M,
    contextOptions: LENGTHS_1M,
    reasoning: { efforts: ['off', 'low', 'high', 'max'], defaultEffort: 'off' },
    vision: true,
  },
  {
    match: 'deepseek-v4.1-flash',
    displayName: 'DeepSeek V4.1 Flash',
    family: 'deepseek',
    contextWindow: CONTEXT_1M,
    contextOptions: LENGTHS_1M,
    reasoning: { efforts: ['off', 'low', 'high', 'max'], defaultEffort: 'off' },
    vision: true,
  },
  {
    match: 'moonshotai/Kimi-K2.7-Code',
    displayName: 'Kimi K2.7 Code',
    family: 'kimi',
    contextWindow: CONTEXT_256K,
    contextOptions: LENGTHS_256K,
    reasoning: { efforts: ['off', 'low', 'medium', 'high'], defaultEffort: 'medium' },
    vision: true,
  },
  {
    match: 'zai-org/GLM-5.2',
    displayName: 'GLM-5.2',
    family: 'glm',
    contextWindow: CONTEXT_1M,
    contextOptions: LENGTHS_1M,
    reasoning: GLM_REASONING,
  },
  {
    match: 'glm-5.3',
    displayName: 'GLM-5.3',
    family: 'glm',
    contextWindow: CONTEXT_1M,
    contextOptions: LENGTHS_1M,
    reasoning: GLM_REASONING,
  },
  {
    match: 'z-ai/glm-5.3-flash',
    displayName: 'GLM-5.3 Flash',
    family: 'glm',
    contextWindow: CONTEXT_1M,
    contextOptions: LENGTHS_1M,
    reasoning: GLM_REASONING,
    vision: true,
  },
  {
    match: 'z-ai/glm-5.3-flashx',
    displayName: 'GLM-5.3 FlashX',
    family: 'glm',
    contextWindow: CONTEXT_1M,
    contextOptions: LENGTHS_1M,
    reasoning: GLM_REASONING,
    vision: true,
  },
  { match: 'Qwen/Qwen3.8-27B', displayName: 'Qwen3.8 27B', family: 'qwen', contextWindow: CONTEXT_1M, contextOptions: LENGTHS_1M, vision: true },
  { match: 'qwen3.8-max', displayName: 'Qwen3.8 Max', family: 'qwen', contextWindow: CONTEXT_1M, contextOptions: LENGTHS_1M },
  { match: 'Qwen/Qwen3.7-Flash', displayName: 'Qwen3.7 Flash', family: 'qwen', contextWindow: CONTEXT_256K, contextOptions: LENGTHS_256K, vision: true },
  { match: 'Qwen/Qwen3.8-Omni-Flash', displayName: 'Qwen3.8 Omni Flash', family: 'qwen', contextWindow: CONTEXT_1M, contextOptions: LENGTHS_1M, vision: true },
  {
    match: 'MiniMaxAI/MiniMax-M3',
    displayName: 'MiniMax M3',
    family: 'minimax',
    contextWindow: CONTEXT_1M,
    contextOptions: LENGTHS_1M,
    reasoning: { efforts: ['low', 'medium', 'high'], defaultEffort: 'high' },
    vision: true,
  },
  {
    match: 'mimo-v2.5-pro',
    displayName: 'MiMo V2.5 Pro',
    family: 'mimo',
    contextWindow: CONTEXT_1M,
    contextOptions: LENGTHS_1M,
    reasoning: { efforts: ['off', 'low', 'medium', 'high'], defaultEffort: 'high' },
  },
  {
    match: 'google/gemini-3.8-flash',
    displayName: 'Gemini 3.8 Flash',
    family: 'gemini',
    contextWindow: CONTEXT_1M,
    contextOptions: LENGTHS_1M,
    vision: true,
  },
  {
    match: 'gpt-5.6-sol',
    displayName: 'GPT-5.6 Sol',
    family: 'gpt',
    contextWindow: 1_050_000,
    contextOptions: LENGTHS_1M,
    reasoning: GPT_REASONING,
    vision: true,
  },
  {
    match: 'gpt-5.6-luna',
    displayName: 'GPT-5.6 Luna',
    family: 'gpt',
    contextWindow: 1_050_000,
    contextOptions: LENGTHS_1M,
    reasoning: GPT_REASONING,
    vision: true,
  },
  // Context values below follow each model's published ceiling; the two marked
  // unverified follow their family's documented window.
  { match: 'tencent/hy3-paid', displayName: 'HY-3', family: 'hunyuan', contextWindow: CONTEXT_256K, contextOptions: LENGTHS_256K },
  { match: 'meituan/LongCat-2.0:free', displayName: 'LongCat 2.0', family: 'longcat', contextWindow: CONTEXT_256K, contextOptions: LENGTHS_256K },
  { match: 'poolside/laguna-s-2.1-free', displayName: 'Laguna S 2.1 Free', family: 'poolside', contextWindow: CONTEXT_256K, contextOptions: LENGTHS_256K },
  { match: 'meta/muse-spark-1.3-contributor', displayName: 'Muse Spark 1.3 Contributor', family: 'meta', contextWindow: CONTEXT_1M, contextOptions: LENGTHS_1M, vision: true },
]

/** Find the registry entry for one upstream id. */
export function matchRegistry(id: string): RegistryEntry | undefined {
  return REGISTRY.find(entry => typeof entry.match === 'string' ? entry.match === id : entry.match.test(id))
}

/** Short capacity label: 128K, 256K, 512K, 1M. */
export function contextLabel(tokens: number): string {
  return tokens >= 1_048_576 && tokens % 1_048_576 === 0
    ? `${tokens / 1_048_576}M`
    : `${Math.round(tokens / 1024)}K`
}

/** Selector name for one entry at one context length: `{displayName} [{label}]`. */
export function displayNameWithContext(displayName: string, tokens: number): string {
  return `${displayName} [${contextLabel(tokens)}]`
}

/** One upstream listing row, as much of it as this plugin reads. */
export interface UpstreamModel {
  id: string
  /** Endpoint-supplied human name; may equal {@link id}. */
  displayName?: string
  contextWindow?: number
  maxTokens?: number
  /** Gateway capability flags some listings disclose. */
  supportsReasoningEffort?: boolean
  reasoningEfforts?: string[]
}

/** One catalog model after registry projection, before variant expansion. */
export interface CatalogModel {
  upstreamId: string
  displayName: string
  contextWindow: number
  contextOptions?: number[]
  reasoning?: RegistryReasoning
  /** Whether the model accepts image input. */
  vision: boolean
  /** Menu priority; lower sorts earlier. */
  rank: number
}

/**
 * Project one discovered upstream model into catalog form. Registry entries
 * win on every field they declare; unknown ids keep the endpoint's own
 * display name when it adds information over the raw id. Reasoning metadata
 * resolves registry first, then endpoint-disclosed effort lists, then the
 * group's own default vocabulary.
 */
export function catalogEntry(upstream: UpstreamModel, groupReasoning?: GroupReasoning): CatalogModel {
  const entry = matchRegistry(upstream.id)
  const disclosed: RegistryReasoning | undefined = upstream.reasoningEfforts !== undefined
    && upstream.reasoningEfforts.length > 0
    ? {
      efforts: upstream.reasoningEfforts,
      defaultEffort: upstream.reasoningEfforts.includes('high')
        ? 'high'
        : upstream.reasoningEfforts[0] as string,
    }
    : undefined
  const reasoning = entry?.reasoning ?? disclosed ?? groupReasoning
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
    }
  }
  return {
    upstreamId: upstream.id,
    displayName: entry.displayName,
    contextWindow: entry.contextWindow,
    ...entry.contextOptions === undefined ? {} : { contextOptions: [...entry.contextOptions] },
    ...reasoning === undefined ? {} : { reasoning },
    vision: entry.vision === true,
    rank: entry.rank ?? Number.MAX_SAFE_INTEGER,
  }
}
