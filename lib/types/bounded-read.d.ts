/**
 * Read a response body under a byte bound, cancelling the moment it is passed.
 *
 * `response.text()` buffers the WHOLE body before any caller can check its
 * size, so a cap applied afterwards bounds nothing: memory is then limited
 * only by the upstream's willingness to keep sending. It also measures UTF-16
 * units rather than bytes, which under-counts non-ASCII payloads. The declared
 * content-length is a cheap early rejection but is attacker-supplied and
 * absent on a chunked reply, so the streaming count below is the real bound.
 *
 * @param response - an in-flight response whose body has not been read.
 * @param limit - the largest body to accept, in bytes.
 * @returns the decoded body.
 * @throws when the body exceeds the limit, or carries no body at all.
 */
export declare function readBoundedBytes(response: Response, limit: number): Promise<string>;
