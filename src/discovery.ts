/**
 * Interrogate the Protocom official API's model listing. The parser is
 * tolerant on purpose: the standard OpenAI `data` array is the expected
 * shape, but entries may carry an Anthropic-style `display_name`, and some
 * groups disclose reasoning capabilities (`supportsReasoningEffort` /
 * `reasoningEfforts`). Nothing here is stored — the registered discovery
 * answers drafts a configuration surface is still editing.
 *
 * @module dsh-protocom-api/discovery
 */

import { attributionHeaders, LlmError } from '@deepseek-ai/dsh-llm'
import type { LlmDiscoveredModel, LlmModelDiscoveryRequest } from '@deepseek-ai/dsh-llm'
import type { UpstreamModel } from './model-registry.ts'

/** Largest listing reply accepted; a truncated listing is not parseable. */
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024

/** One entry of a `GET /v1/models` reply, as much of it as we read. */
interface ListingEntry {
  id?: unknown
  display_name?: unknown
  displayName?: unknown
  name?: unknown
  context_window?: unknown
  context_length?: unknown
  contextWindow?: unknown
  max_input_tokens?: unknown
  max_output_tokens?: unknown
  max_tokens?: unknown
  supportsReasoningEffort?: unknown
  supports_reasoning_effort?: unknown
  reasoningEfforts?: unknown
  reasoning_efforts?: unknown
}

function label(...candidates: readonly unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) return candidate
  }
  return undefined
}

function capacity(...candidates: readonly unknown[]): number | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isInteger(candidate) && candidate > 0) return candidate
  }
  return undefined
}

function strings(candidate: unknown): string[] | undefined {
  if (!Array.isArray(candidate)) return undefined
  const values = candidate.filter((value): value is string => typeof value === 'string' && value.length > 0)
  return values.length === 0 ? undefined : values
}

/**
 * Read one model-listing body. The `data` array is canonical; a top-level
 * `models` array is accepted for gateway variants. Entries without a usable
 * id are skipped rather than failing the whole interrogation.
 */
export function parseModelsListing(body: unknown): UpstreamModel[] {
  const listing = body as { data?: unknown; models?: unknown } | null
  const rows = Array.isArray(listing?.data)
    ? listing.data
    : Array.isArray(listing?.models)
      ? listing.models
      : undefined
  if (rows === undefined) {
    throw new LlmError(
      'the endpoint\'s model listing has neither a "data" nor a "models" array; enter this provider\'s models by hand',
      'DISCOVERY_FAILED',
    )
  }
  const models: UpstreamModel[] = []
  for (const raw of rows as readonly unknown[]) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue
    const entry = raw as ListingEntry
    const id = label(entry.id)
    if (id === undefined) continue
    const displayName = label(entry.display_name, entry.displayName, entry.name)
    const contextWindow = capacity(
      entry.context_window,
      entry.context_length,
      entry.contextWindow,
      entry.max_input_tokens,
    )
    const maxTokens = capacity(entry.max_output_tokens, entry.max_tokens)
    const reasoningEfforts = strings(entry.reasoningEfforts) ?? strings(entry.reasoning_efforts)
    const supports = entry.supportsReasoningEffort === true || entry.supports_reasoning_effort === true
    models.push({
      id,
      ...displayName === undefined ? {} : { displayName },
      ...contextWindow === undefined ? {} : { contextWindow },
      ...maxTokens === undefined ? {} : { maxTokens },
      ...supports ? { supportsReasoningEffort: true } : {},
      ...reasoningEfforts === undefined ? {} : { reasoningEfforts },
    })
  }
  return models
}

/**
 * GET the endpoint's model listing with one credential.
 * @param baseURL - endpoint root; `/v1/models` is appended.
 * @param apiKey - bearer token; omitted for an unauthenticated probe.
 * @param signal - caller cancellation.
 */
export async function fetchUpstreamModels(
  baseURL: string,
  apiKey?: string,
  signal?: AbortSignal,
): Promise<UpstreamModel[]> {
  const url = `${baseURL}/v1/models`
  let response: Response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        ...apiKey === undefined ? {} : { 'authorization': `Bearer ${apiKey}` },
        ...attributionHeaders(),
      },
      ...signal === undefined ? {} : { signal },
    })
  } catch (error: unknown) {
    if (signal?.aborted) throw new LlmError('model discovery aborted by caller', 'ABORTED', { cause: error })
    throw new LlmError(`could not reach ${url}`, 'DISCOVERY_FAILED', { cause: error })
  }
  if (!response.ok) {
    throw new LlmError(
      `${url} answered ${response.status}${response.status === 401 || response.status === 403 ? '; check the API key' : ''}`,
      'DISCOVERY_FAILED',
    )
  }
  const declared = Number(response.headers.get('content-length') ?? Number.NaN)
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    await response.body?.cancel()
    throw new LlmError(`${url} answered with more than ${MAX_RESPONSE_BYTES} bytes`, 'DISCOVERY_FAILED')
  }
  const text = await response.text()
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new LlmError(`${url} answered with more than ${MAX_RESPONSE_BYTES} bytes`, 'DISCOVERY_FAILED')
  }
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch (error: unknown) {
    throw new LlmError(`${url} did not answer with JSON`, 'DISCOVERY_FAILED', { cause: error })
  }
  return parseModelsListing(body)
}

/** Host-owned inputs a discovery draft deliberately omits. */
export interface DiscoveryHooks {
  /** The endpoint root from the current configuration. */
  baseURL: () => string
  /** Resolve the stored credential of the group behind one provider route. */
  resolveApiKey: (provider: string) => Promise<string | undefined>
}

/**
 * The registered model-discovery callback: interrogate the endpoint named by
 * the draft (or the configured endpoint for one of this plugin's routes) and
 * project the reply into harness discovery metadata. A key typed into the
 * form wins over the stored one.
 */
export async function discoverModels(
  request: LlmModelDiscoveryRequest,
  signal: AbortSignal | undefined,
  hooks: DiscoveryHooks,
): Promise<readonly LlmDiscoveredModel[]> {
  const baseURL = request.baseURL !== undefined && request.baseURL.length > 0
    ? request.baseURL.replace(/\/+$/, '').replace(/\/v1$/, '')
    : hooks.baseURL()
  const apiKey = request.apiKey
    ?? (request.provider === undefined ? undefined : await hooks.resolveApiKey(request.provider))
  const upstream = await fetchUpstreamModels(baseURL, apiKey, signal)
  return upstream.map(model => ({
    id: model.id,
    ...model.displayName === undefined ? {} : { name: model.displayName },
    ...model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow },
    ...model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens },
  }))
}
