/**
 * Shared transport for the two wire protocols: one POST with a JSON body
 * answered by an SSE stream. Every provider request carries the harness
 * attribution headers; HTTP failures map to the provider-neutral LlmError
 * code taxonomy.
 *
 * @module dsh-protocom-api/protocol/http
 */
/**
 * Resolved request images, keyed by attachment id: the provider-ready `data:`
 * URL an image block's durable reference stands for. Empty when the request
 * carries no image the adapter retained. Lives beside the transport because
 * both wire protocols carry images.
 */
export type RequestImageUrls = ReadonlyMap<string, string>;
/** Connection facts frozen for one request. */
export interface ProtocolConnection {
    /** Endpoint root; `/v1/<path>` is appended. */
    baseURL: string;
    /** Bearer token from the same configuration generation as {@link baseURL}. */
    apiKey: string;
}
/** Map an HTTP status to a stable LlmError code. */
export declare function httpErrorCode(status: number): string;
/**
 * Largest provider-supplied `Retry-After` this adapter forwards. The harness
 * retry layer treats `providerRetryAfterMs > maxDelayMs` (default 10s) as
 * "cancel this retry" in normal mode, so an unbounded upstream value silently
 * removed the client's retry chance; a large one under a raised `maxDelayMs`
 * would instead park the request for days. Capping at that same default keeps
 * the value inside the policy that consumes it and bounds the wait.
 */
export declare const MAX_PROVIDER_RETRY_AFTER_MS = 10000;
/**
 * POST one JSON body and return the SSE response. Transport and HTTP
 * failures throw coded LlmErrors; the caller owns stream decoding.
 */
export declare function postSse(connection: ProtocolConnection, path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<Response>;
