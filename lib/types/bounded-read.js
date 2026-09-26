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
export async function readBoundedBytes(response, limit) {
    const declared = Number(response.headers.get('content-length') ?? Number.NaN);
    if (Number.isFinite(declared) && declared > limit) {
        await response.body?.cancel();
        throw new Error(`the reply declared ${declared} bytes, over the ${limit}-byte limit`);
    }
    const reader = response.body?.getReader();
    if (reader === undefined)
        throw new Error('the reply carried no body');
    const chunks = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done)
            break;
        if (value === undefined)
            continue;
        total += value.byteLength;
        if (total > limit) {
            await reader.cancel();
            throw new Error(`the reply exceeded the ${limit}-byte limit`);
        }
        chunks.push(value);
    }
    return new TextDecoder().decode(Buffer.concat(chunks, total));
}
