/**
 * Pure helpers behind the section's probe table: which context lengths one
 * discovered model may offer as checkboxes, and the toggled group list.
 *
 * @module dsh-protocom-api/client/variants
 */
/** The standard lengths offered for a model the registry does not size. */
export declare const STANDARD_VARIANT_CHOICES: readonly number[];
/**
 * The lengths one model may be offered: the ladder steps its own window
 * clears, or the standard ladder for an id the registry does not size.
 */
export declare function variantChoicesFor(upstreamId: string): readonly number[];
/** Add or remove one length, keeping the group list sorted and unique. */
export declare function toggleLength(lengths: readonly number[], length: number): number[];
