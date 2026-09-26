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
    /** Provider name for error messages (default `'Protocom'`). */
    label?: string;
    /**
     * Extra request headers this family's endpoint requires, merged over the
     * shared ones. OpenCode Go uses this for its mandatory `x-opencode-session`
     * session scoping.
     */
    headers?: Record<string, string>;
    /**
     * Largest `Retry-After` this request may forward, in milliseconds. The caller
     * passes the consuming retry policy's own `maxDelayMs`; absent means the
     * shipped default, which keeps hand-built connections honest.
     */
    retryAfterCeilingMs?: number;
}
/** Map an HTTP status to a stable LlmError code. */
export declare function httpErrorCode(status: number): string;
/**
 * Retry-After ceiling a connection that names none falls back to. Chosen to
 * match the retry policy's own shipped default so a hand-built connection (the
 * tests, a probe) behaves exactly like a configured deployment at its defaults.
 */
export declare const DEFAULT_RETRY_AFTER_CEILING_MS = 10000;
/**
 * POST one JSON body and return the SSE response. Transport and HTTP
 * failures throw coded LlmErrors; the caller owns stream decoding.
 */
export declare function postSse(connection: ProtocolConnection, path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<Response>;
