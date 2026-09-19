/**
 * Pure helpers behind the section's probe table: which context lengths one
 * discovered model may offer as checkboxes, and the toggled group list.
 *
 * @module dsh-protocom-api/client/variants
 */

import { matchRegistry } from '../model-registry.ts'

/** The four standard lengths offered for a model the registry does not size. */
export const STANDARD_VARIANT_CHOICES = [204_800, 262_144, 409_600, 1_048_576] as const

/**
 * The checkbox lengths one probe row shows: the registry's declared options
 * when known, the standard four otherwise.
 */
export function variantChoicesFor(upstreamId: string): readonly number[] {
  return matchRegistry(upstreamId)?.contextOptions ?? STANDARD_VARIANT_CHOICES
}

/** Add or remove one length, keeping the group list sorted and unique. */
export function toggleLength(lengths: readonly number[], length: number): number[] {
  const next = lengths.includes(length)
    ? lengths.filter(candidate => candidate !== length)
    : [...lengths, length]
  return next.sort((a, b) => a - b)
}
