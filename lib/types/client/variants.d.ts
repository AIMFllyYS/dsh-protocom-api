/**
 * Pure helpers behind the section's probe table: which context lengths one
 * discovered model may offer as checkboxes, and the toggled group list.
 *
 * @module dsh-protocom-api/client/variants
 */
/** The four standard lengths offered for a model the registry does not size. */
export declare const STANDARD_VARIANT_CHOICES: readonly [131072, 262144, 524288, 1048576];
/**
 * The checkbox lengths one probe row shows: the registry's declared options
 * when known, the standard four otherwise.
 */
export declare function variantChoicesFor(upstreamId: string): readonly number[];
/** Add or remove one length, keeping the group list sorted and unique. */
export declare function toggleLength(lengths: readonly number[], length: number): number[];
