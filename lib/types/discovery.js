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
import { attributionHeaders, LlmError } from '@deepseek-ai/dsh-llm';
/** Largest listing reply accepted; a truncated listing is not parseable. */
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
function label(...candidates) {
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.length > 0)
            return candidate;
    }
    return undefined;
}
function capacity(...candidates) {
    for (const candidate of candidates) {
        if (typeof candidate === 'number' && Number.isInteger(candidate) && candidate > 0)
            return candidate;
    }
    return undefined;
}
function strings(candidate) {
    if (!Array.isArray(candidate))
        return undefined;
    const values = candidate.filter((value) => typeof value === 'string' && value.length > 0);
    return values.length === 0 ? undefined : values;
}
/**
 * Read one model-listing body. The `data` array is canonical; a top-level
 * `models` array is accepted for gateway variants. Entries without a usable
 * id are skipped rather than failing the whole interrogation.
 */
export function parseModelsListing(body) {
    const listing = body;
    const rows = Array.isArray(listing?.data)
        ? listing.data
        : Array.isArray(listing?.models)
            ? listing.models
            : undefined;
    if (rows === undefined) {
        throw new LlmError('the endpoint\'s model listing has neither a "data" nor a "models" array; enter this provider\'s models by hand', 'DISCOVERY_FAILED');
    }
    const models = [];
    for (const raw of rows) {
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
            continue;
        const entry = raw;
        const id = label(entry.id);
        if (id === undefined)
            continue;
        const displayName = label(entry.display_name, entry.displayName, entry.name);
        const contextWindow = capacity(entry.context_window, entry.context_length, entry.contextWindow, entry.max_input_tokens);
        const maxTokens = capacity(entry.max_output_tokens, entry.max_tokens);
        const reasoningEfforts = strings(entry.reasoningEfforts) ?? strings(entry.reasoning_efforts);
        const supports = entry.supportsReasoningEffort === true || entry.supports_reasoning_effort === true;
        models.push({
            id,
            ...displayName === undefined ? {} : { displayName },
            ...contextWindow === undefined ? {} : { contextWindow },
            ...maxTokens === undefined ? {} : { maxTokens },
            ...supports ? { supportsReasoningEffort: true } : {},
            ...reasoningEfforts === undefined ? {} : { reasoningEfforts },
        });
    }
    return models;
}
/**
 * GET the endpoint's model listing with one credential.
 * @param baseURL - endpoint root; `/v1/models` is appended.
 * @param apiKey - bearer token; omitted for an unauthenticated probe.
 * @param signal - caller cancellation.
 */
export async function fetchUpstreamModels(baseURL, apiKey, signal) {
    const url = `${baseURL}/v1/models`;
    let response;
    try {
        response = await fetch(url, {
            method: 'GET',
            headers: {
                'accept': 'application/json',
                ...apiKey === undefined ? {} : { 'authorization': `Bearer ${apiKey}` },
                ...attributionHeaders(),
            },
            ...signal === undefined ? {} : { signal },
        });
    }
    catch (error) {
        if (signal?.aborted)
            throw new LlmError('model discovery aborted by caller', 'ABORTED', { cause: error });
        throw new LlmError(`could not reach ${url}`, 'DISCOVERY_FAILED', { cause: error });
    }
    if (!response.ok) {
        throw new LlmError(`${url} answered ${response.status}${response.status === 401 || response.status === 403 ? '; check the API key' : ''}`, 'DISCOVERY_FAILED');
    }
    const declared = Number(response.headers.get('content-length') ?? Number.NaN);
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
        await response.body?.cancel();
        throw new LlmError(`${url} answered with more than ${MAX_RESPONSE_BYTES} bytes`, 'DISCOVERY_FAILED');
    }
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) {
        throw new LlmError(`${url} answered with more than ${MAX_RESPONSE_BYTES} bytes`, 'DISCOVERY_FAILED');
    }
    let body;
    try {
        body = JSON.parse(text);
    }
    catch (error) {
        throw new LlmError(`${url} did not answer with JSON`, 'DISCOVERY_FAILED', { cause: error });
    }
    return parseModelsListing(body);
}
/**
 * The registered model-discovery callback: interrogate the endpoint named by
 * the draft (or the configured endpoint for one of this plugin's routes) and
 * project the reply into harness discovery metadata. A key typed into the
 * form wins over the stored one.
 */
export async function discoverModels(request, signal, hooks) {
    const baseURL = request.baseURL !== undefined && request.baseURL.length > 0
        ? request.baseURL.replace(/\/+$/, '').replace(/\/v1$/, '')
        : hooks.baseURL();
    const apiKey = request.apiKey
        ?? (request.provider === undefined ? undefined : await hooks.resolveApiKey(request.provider));
    const upstream = await fetchUpstreamModels(baseURL, apiKey, signal);
    return upstream.map(model => ({
        id: model.id,
        ...model.displayName === undefined ? {} : { name: model.displayName },
        ...model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow },
        ...model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens },
    }));
}
