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
import { resolveBaseURL } from './config.ts'
import type { UpstreamModel } from './model-registry.ts'

/** Largest listing reply accepted; a truncated listing is not parseable. */
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024

/**
 * Longest accepted model id or label. A hostile listing can otherwise carry a
 * multi-megabyte `display_name` (measured at 2.4M characters) straight into the
 * model catalog and the settings UI.
 */
const MAX_TEXT_LENGTH = 256

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
  /** Command Code publishes this on every row; see {@link UpstreamModel.endpoints}. */
  supported_endpoints?: unknown
  supportedEndpoints?: unknown
}

/** One string bound to {@link MAX_TEXT_LENGTH}. */
function bounded(value: string): string {
  return value.length > MAX_TEXT_LENGTH ? value.slice(0, MAX_TEXT_LENGTH) : value
}

function label(...candidates: readonly unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) return bounded(candidate)
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
  const values = candidate
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map(bounded)
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
    // Only strings are kept, and each is bounded like every other upstream text:
    // a hostile listing must not push a large payload into the catalog.
    const endpoints = strings(entry.supported_endpoints) ?? strings(entry.supportedEndpoints)
    models.push({
      id,
      ...displayName === undefined ? {} : { displayName },
      ...contextWindow === undefined ? {} : { contextWindow },
      ...maxTokens === undefined ? {} : { maxTokens },
      ...supports ? { supportsReasoningEffort: true } : {},
      ...reasoningEfforts === undefined ? {} : { reasoningEfforts },
      ...endpoints === undefined ? {} : { endpoints },
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
  // A declared length is only a cheap early rejection; it is attacker-supplied
  // and absent on a chunked reply, so the real bound is the streaming byte count
  // below. Reading to completion first and checking afterwards (`text.length`,
  // which also counts UTF-16 units rather than bytes) left memory bounded only
  // by the upstream's willingness — a 4.8 MB chunked reply was accepted.
  const declared = Number(response.headers.get('content-length') ?? Number.NaN)
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    await response.body?.cancel()
    throw new LlmError(`${url} answered with more than ${MAX_RESPONSE_BYTES} bytes`, 'DISCOVERY_FAILED')
  }
  const reader = response.body?.getReader()
  if (reader === undefined) {
    throw new LlmError(`${url} answered with no body`, 'DISCOVERY_FAILED')
  }
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done: finished, value } = await reader.read()
    if (finished) break
    if (value === undefined) continue
    total += value.byteLength
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel()
      throw new LlmError(`${url} answered with more than ${MAX_RESPONSE_BYTES} bytes`, 'DISCOVERY_FAILED')
    }
    chunks.push(value)
  }
  const text = new TextDecoder().decode(Buffer.concat(chunks, total))
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch (error: unknown) {
    throw new LlmError(`${url} did not answer with JSON`, 'DISCOVERY_FAILED', { cause: error })
  }
  return parseModelsListing(body)
}

/**
 * Canonical origin of an endpoint root, or `undefined` when it is not a usable
 * http(s) origin. WHATWG parsing is what makes two spellings of one endpoint
 * compare equal (case, punycode, default ports, IPv6 brackets) and a decorated
 * one (`user@host`, `host?x`, `relay.protocom.org.evil.test`) disagree, so the
 * comparison never runs on raw strings.
 */
export function endpointOrigin(raw: string): string | undefined {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return undefined
  }
  if (url.username !== '' || url.password !== '') return undefined
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
  return url.origin
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
  const configured = hooks.baseURL()
  // This function is exported, so the configured endpoint is re-validated here
  // rather than assumed: a standalone caller must not be able to put a stored
  // bearer on a plain-http wire through its own hooks.
  try {
    resolveBaseURL(configured)
  } catch (error: unknown) {
    throw new LlmError(
      `protocom-api: the configured baseURL is not usable (${error instanceof Error ? error.message : String(error)})`,
      'DISCOVERY_FAILED',
      { cause: error },
    )
  }
  const configuredOrigin = endpointOrigin(configured)
  if (configuredOrigin === undefined) {
    throw new LlmError('protocom-api: the configured baseURL is not a usable http(s) origin', 'DISCOVERY_FAILED')
  }
  // An empty string is "not supplied", not a bearer token: the old `??` chain
  // turned `apiKey: ''` into a request carrying an empty Authorization header.
  const askedRaw = request.baseURL !== undefined && request.baseURL.length > 0 ? request.baseURL : undefined
  const asked = askedRaw === undefined
    ? undefined
    : askedRaw.replace(/\/+$/, '').replace(/\/v1$/, '')
  // Scheme and shape are bounded for a draft too, even when the caller brings
  // its own one-shot key: otherwise a draft naming a plain-http host would put
  // that key on the wire in cleartext.
  if (asked !== undefined) {
    try {
      resolveBaseURL(asked)
    } catch (error: unknown) {
      throw new LlmError(
        `protocom-api: the probe endpoint is not usable (${error instanceof Error ? error.message : String(error)})`,
        'DISCOVERY_FAILED',
        { cause: error },
      )
    }
  }
  const baseURL = asked ?? configured
  const explicit = request.apiKey !== undefined && request.apiKey.length > 0 ? request.apiKey : undefined
  // A stored credential is scoped to the configured endpoint. Sending it to an
  // endpoint the caller names would let a draft (or a prompt-injected write to
  // one) pair this deployment's key with an attacker's host; a caller that
  // really wants a foreign probe must supply a one-shot `apiKey` for it.
  const usesStoredCredential = explicit === undefined && request.provider !== undefined
  if (usesStoredCredential && asked !== undefined && endpointOrigin(baseURL) !== configuredOrigin) {
    throw new LlmError(
      'protocom-api: this endpoint differs from the configured baseURL, so the stored credential is not sent;'
      + ' supply an apiKey for this probe, or interrogate the configured endpoint',
      'DISCOVERY_FAILED',
    )
  }
  const apiKey = explicit
    ?? (request.provider === undefined ? undefined : await hooks.resolveApiKey(request.provider))
  const upstream = await fetchUpstreamModels(baseURL, apiKey, signal)
  return upstream.map(model => ({
    id: model.id,
    ...model.displayName === undefined ? {} : { name: model.displayName },
    ...model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow },
    ...model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens },
  }))
}
