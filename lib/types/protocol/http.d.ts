/**
 * Shared transport for the two wire protocols: one POST with a JSON body
 * answered by an SSE stream. Every provider request carries the harness
 * attribution headers; HTTP failures map to the provider-neutral LlmError
 * code taxonomy.
 *
 * @module dsh-protocom-api/protocol/http
 */
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
 * POST one JSON body and return the SSE response. Transport and HTTP
 * failures throw coded LlmErrors; the caller owns stream decoding.
 */
export declare function postSse(connection: ProtocolConnection, path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<Response>;
