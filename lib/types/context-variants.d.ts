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
 * Whether a model's capacity falls within the ceiling a ladder sets.
 *
 * The ladder's top rung is the deployment's ceiling for that group. A model may
 * always be used at its own capacity while that capacity is at or below the
 * ceiling; a ladder that deliberately stops BELOW a model's window is how a
 * deployment caps a group, and is not overridden.
 *
 * This is what separates the two cases that look alike. A group offering up to
 * 1M must be able to use a 1M model at 1M, whatever base the model states it
 * in. A group offering only 256K has said so on purpose, and a 1M model there
 * stays at 256K.
 * @param contextWindow - the model's own declared capacity.
 * @param configured - the group's ladder.
 * @returns whether the window is within what the ladder allows.
 */
export declare function withinLadderCeiling(contextWindow: number, configured: readonly number[] | undefined): boolean;
/** Whether two lengths name the same budget, allowing for the two bases. */
export declare function sameBudget(left: number, right: number): boolean;
/**
 * The variant lengths to advertise for one model, or `undefined` for the
 * single default entry with a bare id. Configuration is the switch: without
 * `contextLengths` the model lists exactly as before variants existed. With
 * it, registry-known models are matched against the configured rungs (an empty
 * match degrades to the default entry rather than hiding the model); unknown
 * models take the configured lengths directly.
 *
 * Two things about the matching are deliberate:
 *
 *  - **By budget, not by exact integer.** Matching `configured.includes(length)`
 *    meant a model declaring 1,000,000 could never match a 1,048,576 rung, so
 *    its own window was silently dropped and it was offered only the rungs
 *    below it. Every OpenCode Go model with a decimal window was capped that
 *    way while the binary ones -- Kimi K3 at 1,048,576 -- kept their 1M, which
 *    is precisely how the menu looked broken for some models and not others.
 *
 *  - **The MODEL's figure is emitted, not the configured one.** They can differ
 *    by up to the tolerance, and the model's own number is the only one it can
 *    actually honour. Advertising the rung instead is how a model ends up
 *    promised a window it does not have.
 */
export declare function variantLengths(contextOptions: readonly number[] | undefined, configured: readonly number[] | undefined): number[] | undefined;
