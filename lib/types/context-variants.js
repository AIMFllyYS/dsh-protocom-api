/**
 * Context-variant id codec. A variant entry's model id is
 * `<upstreamId>::ctx@<tokens>`; the suffix rides through the harness as an
 * opaque model id and is stripped back to the upstream id at dispatch.
 *
 * @module dsh-protocom-api/context-variants
 */
const MARKER = '::ctx@';
/** Encode one upstream id and context length into a variant model id. */
export function encodeVariantId(upstreamId, tokens) {
    return `${upstreamId}${MARKER}${tokens}`;
}
/**
 * Split one model id into its upstream id and variant length. An absent or
 * malformed suffix (non-numeric, non-positive) means "no variant": the whole
 * id is the upstream id, so a literal marker inside an upstream id cannot
 * corrupt dispatch.
 */
export function decodeVariantId(id) {
    const at = id.lastIndexOf(MARKER);
    if (at === -1)
        return { upstreamId: id };
    const tokens = Number(id.slice(at + MARKER.length));
    if (!Number.isSafeInteger(tokens) || tokens <= 0)
        return { upstreamId: id };
    return { upstreamId: id.slice(0, at), contextWindow: tokens };
}
/** The upstream id a request must name, whatever variant suffix arrived. */
export function stripVariantId(id) {
    return decodeVariantId(id).upstreamId;
}
/**
 * The variant lengths to advertise for one model, or `undefined` for the
 * single default entry with a bare id. Configuration is the switch: without
 * `contextLengths` the model lists exactly as before variants existed. With
 * it, registry-known models intersect with their declared options (an empty
 * intersection degrades to the default entry rather than hiding the model);
 * unknown models take the configured lengths directly.
 */
export function variantLengths(contextOptions, configured) {
    if (configured === undefined || configured.length === 0)
        return undefined;
    if (contextOptions === undefined)
        return [...new Set(configured)].sort((a, b) => a - b);
    const intersection = configured.filter(length => contextOptions.includes(length));
    return intersection.length === 0 ? undefined : [...new Set(intersection)].sort((a, b) => a - b);
}
