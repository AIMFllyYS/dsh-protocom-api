/**
 * Context-variant id codec. A variant entry's model id is
 * `<upstreamId>::ctx@<tokens>`; the suffix rides through the harness as an
 * opaque model id and is stripped back to the upstream id at dispatch.
 *
 * @module dsh-protocom-api/context-variants
 */
/** Encode one upstream id and context length into a variant model id. */
export declare function encodeVariantId(upstreamId: string, tokens: number): string;
/**
 * Split one model id into its upstream id and variant length. An absent or
 * malformed suffix (non-numeric, non-positive) means "no variant": the whole
 * id is the upstream id, so a literal marker inside an upstream id cannot
 * corrupt dispatch.
 */
export declare function decodeVariantId(id: string): {
    upstreamId: string;
    contextWindow?: number;
};
/** The upstream id a request must name, whatever variant suffix arrived. */
export declare function stripVariantId(id: string): string;
/**
 * The variant lengths to advertise for one model, or `undefined` for the
 * single default entry with a bare id. Configuration is the switch: without
 * `contextLengths` the model lists exactly as before variants existed. With
 * it, registry-known models intersect with their declared options (an empty
 * intersection degrades to the default entry rather than hiding the model);
 * unknown models take the configured lengths directly.
 */
export declare function variantLengths(contextOptions: readonly number[] | undefined, configured: readonly number[] | undefined): number[] | undefined;
