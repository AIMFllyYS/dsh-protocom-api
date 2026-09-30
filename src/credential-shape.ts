/**
 * Shape checks for a credential VALUE, shared by both sides of a write.
 *
 * Dependency-free on purpose. The Host resolves a stored key while building a
 * request, and the settings panel validates one as it is saved; the panel's
 * bundle is forbidden from pulling in the Host's schema or credential
 * machinery, so anything both sides need has to live in a module that imports
 * nothing.
 */

/**
 * Whether a credential value is plainly a filesystem path rather than a key.
 *
 * The mistake is easy to make and cost a real user an evening. Explorer's
 * "Copy as path" puts exactly this shape on the clipboard, and a browser's
 * duplicate-download suffix appends ` (1)` to it, so what lands in the key
 * field reads as `C:\\Users\\...\\cline-key.txt (1)`.
 *
 * The Host's generic guard would refuse that value anyway -- a space and a
 * backslash are not what a key looks like -- but its message is about HTTP
 * headers, which describes the SYMPTOM and never the mistake. Naming the
 * mistake is the whole point of this check.
 *
 * Deliberately narrow. Only shapes that cannot be a key are caught here, so a
 * legitimately odd key is left to the generic guard rather than being told it
 * is a path: a drive letter, a UNC prefix, or a drive-relative separator.
 * @param value - the credential value.
 * @returns the matching description, or undefined when it is not path-shaped.
 */
export function describePathShapedSecret(value: string): string | undefined {
  // A quoted path is what Explorer puts on the clipboard.
  const inner = value.length >= 2 && value.startsWith('"') && value.endsWith('"')
    ? value.slice(1, -1)
    : value
  if (/^[A-Za-z]:[\\/]/.test(inner)) return 'a drive path'
  if (inner.startsWith('\\\\')) return 'a UNC path'
  if (/^[A-Za-z]:[^\\/]/.test(inner)) return 'a drive-relative path'
  // The duplicate-download suffix is the tell that it came from a browser.
  if (/ \(\d+\)$/.test(value) && /[\\/]/.test(inner)) return 'a path with a duplicate-download suffix'
  return undefined
}

/**
 * The reason to refuse a credential at the moment it is entered, if any.
 *
 * Validating only when a request resolves a key means a bad value is stored
 * happily and then fails on every single turn, which is what happened here:
 * the message was correct but arrived long after the paste and pointed at a
 * field the user had no reason to revisit. Checking at entry puts it where the
 * mistake was made.
 *
 * It deliberately does NOT re-implement the Host's header-safety rule. That
 * rule belongs to the runtime and duplicating it would let the two drift; the
 * path shape is the one failure a user cannot diagnose from its wording.
 * @param value - the value about to be stored.
 * @returns a sentence for the operator, or undefined when it may be stored.
 */
export function credentialEntryProblem(value: string): string | undefined {
  const shape = describePathShapedSecret(value)
  if (shape === undefined) return undefined
  return `That is ${shape}, not an API key. Paste the key itself -- the text you copy from the provider -- rather than the file it was saved in.`
}
