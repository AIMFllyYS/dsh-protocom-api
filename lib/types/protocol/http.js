/**
 * Shared transport for the two wire protocols: one POST with a JSON body
 * answered by an SSE stream. Every provider request carries the harness
 * attribution headers; HTTP failures map to the provider-neutral LlmError
 * code taxonomy.
 *
 * @module dsh-protocom-api/protocol/http
 */
import { attributionHeaders, LlmError, ProviderRequestId } from '@deepseek-ai/dsh-llm';
import { captureWire } from "../capture.js";
/** Map an HTTP status to a stable LlmError code. */
export function httpErrorCode(status) {
    if (status === 401 || status === 403)
        return 'AUTH';
    if (status === 413)
        return 'INVALID_REQUEST';
    if (status === 429)
        return 'RATE_LIMIT';
    if (status === 400)
        return 'INVALID_REQUEST';
    if (status >= 500)
        return 'SERVER';
    return `HTTP_${status}`;
}
/**
 * Retry-After ceiling a connection that names none falls back to. Chosen to
 * match the retry policy's own shipped default so a hand-built connection (the
 * tests, a probe) behaves exactly like a configured deployment at its defaults.
 */
export const DEFAULT_RETRY_AFTER_CEILING_MS = 10_000;
/**
 * Clamp one provider-supplied `Retry-After` into the policy that will consume
 * it.
 *
 * The harness retry layer treats `providerRetryAfterMs > maxDelayMs` as
 * "cancel this retry" in normal mode, so an unbounded upstream value silently
 * removes the client's retry chance. The ceiling is therefore the SAME number
 * the declared policy uses as its own `maxDelayMs`: forwarding the provider's
 * instruction up to the deployment's configured ceiling respects it, and
 * clamping at that ceiling keeps the executor's comparison unable to cancel.
 * @param value - the raw `Retry-After` header, or null when absent.
 * @param ceilingMs - the consuming policy's `maxDelayMs`.
 * @returns the delay to forward, or undefined when there is nothing usable.
 */
function providerRetryAfterMs(value, ceilingMs) {
    if (value === null)
        return undefined;
    const seconds = /^\d+$/.test(value) ? Number(value) * 1_000 : Number.NaN;
    const delay = Number.isFinite(seconds) ? seconds : Date.parse(value) - Date.now();
    return Number.isFinite(delay) && delay > 0 ? Math.min(delay, ceilingMs) : undefined;
}
/**
 * POST one JSON body and return the SSE response. Transport and HTTP
 * failures throw coded LlmErrors; the caller owns stream decoding.
 */
export async function postSse(connection, path, body, signal) {
    const url = `${connection.baseURL}/v1/${path}`;
    const serialized = JSON.stringify(body);
    const label = connection.label ?? 'Protocom';
    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {
                'authorization': `Bearer ${connection.apiKey}`,
                'content-type': 'application/json',
                'accept': 'text/event-stream',
                ...attributionHeaders(),
                ...connection.headers,
            },
            body: serialized,
            ...signal === undefined ? {} : { signal },
        });
    }
    catch (error) {
        if (signal?.aborted)
            throw new LlmError(`${label} request aborted by caller`, 'ABORTED', { cause: error });
        throw new LlmError(`${label} API request to ${url} failed`, 'TRANSPORT', { cause: error });
    }
    if (response.ok) {
        if (!response.body)
            throw new LlmError(`${label} API returned no response body`, 'EMPTY_RESPONSE');
        return response;
    }
    let message = `${label} API error (HTTP ${response.status})`;
    let providerError;
    const rawResponse = await response.text();
    try {
        const parsed = JSON.parse(rawResponse);
        providerError = parsed.error;
        if (providerError?.message)
            message = providerError.message;
    }
    catch {
        // The HTTP status remains authoritative when a gateway returns malformed JSON.
    }
    // Opt-in only (see src/capture.ts): the exact request and the upstream's own
    // explanation are what make a provider-specific rejection diagnosable.
    await captureWire({ url, status: response.status, request: serialized, response: rawResponse });
    const delay = providerRetryAfterMs(response.headers.get('retry-after'), connection.retryAfterCeilingMs ?? DEFAULT_RETRY_AFTER_CEILING_MS);
    const id = response.headers.get('x-request-id');
    throw new LlmError(message, httpErrorCode(response.status), {
        cause: new Error(rawResponse.length > 0 ? rawResponse : `${label} HTTP ${response.status}`),
        status: response.status,
        ...delay === undefined ? {} : { providerRetryAfterMs: delay },
        ...id === null || id.length === 0 ? {} : { requestId: ProviderRequestId(id) },
    });
}
