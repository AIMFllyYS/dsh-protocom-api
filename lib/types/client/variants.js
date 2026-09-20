/**
 * Pure helpers behind the section's probe table: which context lengths one
 * discovered model may offer as checkboxes, and the toggled group list.
 *
 * @module dsh-protocom-api/client/variants
 */
import { matchRegistry } from "../model-registry.js";
/** The four standard lengths offered for a model the registry does not size. */
export const STANDARD_VARIANT_CHOICES = [131_072, 262_144, 524_288, 1_048_576];
/**
 * The checkbox lengths one probe row shows: the registry's declared options
 * when known, the standard four otherwise.
 */
export function variantChoicesFor(upstreamId) {
    return matchRegistry(upstreamId)?.contextOptions ?? STANDARD_VARIANT_CHOICES;
}
/** Add or remove one length, keeping the group list sorted and unique. */
export function toggleLength(lengths, length) {
    const next = lengths.includes(length)
        ? lengths.filter(candidate => candidate !== length)
        : [...lengths, length];
    return next.sort((a, b) => a - b);
}
