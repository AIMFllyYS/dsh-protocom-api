/**
 * Shared transport for the two wire protocols: one POST with a JSON body
 * answered by an SSE stream. Every provider request carries the harness
 * attribution headers; HTTP failures map to the provider-neutral LlmError
 * code taxonomy.
 *
 * @module dsh-protocom-api/protocol/http
 */
import { attributionHeaders, LlmError, ProviderRequestId } from '@deepseek-ai/dsh-llm';
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
function providerRetryAfterMs(value) {
    if (value === null)
        return undefined;
    if (/^\d+$/.test(value)) {
        const delay = Number(value) * 1_000;
        return Number.isFinite(delay) && delay > 0 ? delay : undefined;
    }
    const delay = Date.parse(value) - Date.now();
    return Number.isFinite(delay) && delay > 0 ? delay : undefined;
}
/**
 * POST one JSON body and return the SSE response. Transport and HTTP
 * failures throw coded LlmErrors; the caller owns stream decoding.
 */
export async function postSse(connection, path, body, signal) {
    const url = `${connection.baseURL}/v1/${path}`;
    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {
                'authorization': `Bearer ${connection.apiKey}`,
                'content-type': 'application/json',
                'accept': 'text/event-stream',
                ...attributionHeaders(),
            },
            body: JSON.stringify(body),
            ...signal === undefined ? {} : { signal },
        });
    }
    catch (error) {
        if (signal?.aborted)
            throw new LlmError('Protocom request aborted by caller', 'ABORTED', { cause: error });
        throw new LlmError(`Protocom API request to ${url} failed`, 'TRANSPORT', { cause: error });
    }
    if (response.ok) {
        if (!response.body)
            throw new LlmError('Protocom API returned no response body', 'EMPTY_RESPONSE');
        return response;
    }
    let message = `Protocom API error (HTTP ${response.status})`;
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
    const delay = providerRetryAfterMs(response.headers.get('retry-after'));
    const id = response.headers.get('x-request-id');
    throw new LlmError(message, httpErrorCode(response.status), {
        cause: new Error(rawResponse.length > 0 ? rawResponse : `Protocom HTTP ${response.status}`),
        status: response.status,
        ...delay === undefined ? {} : { providerRetryAfterMs: delay },
        ...id === null || id.length === 0 ? {} : { requestId: ProviderRequestId(id) },
    });
}
