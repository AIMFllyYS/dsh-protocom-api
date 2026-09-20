/**
 * Pure helpers behind the section's probe table: which context lengths one
 * discovered model may offer as checkboxes, and the toggled group list.
 *
 * @module dsh-protocom-api/client/variants
 */

import { CONTEXT_LADDER, contextChoicesFor, matchRegistry } from '../model-registry.ts'

/** The standard lengths offered for a model the registry does not size. */
export const STANDARD_VARIANT_CHOICES = CONTEXT_LADDER

/**
 * The lengths one model may be offered: the ladder steps its own window
 * clears, or the standard ladder for an id the registry does not size.
 */
export function variantChoicesFor(upstreamId: string): readonly number[] {
  const entry = matchRegistry(upstreamId)
  return entry === undefined ? CONTEXT_LADDER : contextChoicesFor(entry.contextWindow)
}

/** Add or remove one length, keeping the group list sorted and unique. */
export function toggleLength(lengths: readonly number[], length: number): number[] {
  const next = lengths.includes(length)
    ? lengths.filter(candidate => candidate !== length)
    : [...lengths, length]
  return next.sort((a, b) => a - b)
}
