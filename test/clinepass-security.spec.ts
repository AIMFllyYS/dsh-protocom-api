// @vitest-environment node
/**
 * The ClinePass credential namespace bound.
 *
 * A deployment types a credential REFERENCE into the settings form, and the
 * environment fallback reads whatever that reference names. Without a bound,
 * a reference could name any variable in the process -- an unrelated API key,
 * a cloud token -- and the plugin would send its value to the vendor. Each
 * family therefore accepts only its own namespace, and ClinePass is the fourth
 * to need one.
 */
import { describe, expect, it } from 'vitest'
import { CLINEPASS_BASE_URL_ORIGIN, CLINEPASS_CREDENTIAL_REF } from '../src/clinepass.ts'

describe('clinepass credential bound (R3)', () => {
  it('accepts only its own namespace', () => {
    expect(CLINEPASS_CREDENTIAL_REF.test('CLINE_API_KEY')).toBe(true)
    expect(CLINEPASS_CREDENTIAL_REF.test('CLINE_API_KEY_2')).toBe(true)
    // Another vendor's credential must not be readable through this family.
    expect(CLINEPASS_CREDENTIAL_REF.test('PROTOCOM_AGGREGATE_API_KEY')).toBe(false)
    expect(CLINEPASS_CREDENTIAL_REF.test('OPENCODE_GO_API_KEY')).toBe(false)
    expect(CLINEPASS_CREDENTIAL_REF.test('COMMANDCODE_API_KEY')).toBe(false)
    // Nor an unrelated secret that happens to be in the environment.
    expect(CLINEPASS_CREDENTIAL_REF.test('AWS_SECRET_ACCESS_KEY')).toBe(false)
    expect(CLINEPASS_CREDENTIAL_REF.test('HOME')).toBe(false)
    // Anchored: a substring match would accept a name that merely contains it.
    expect(CLINEPASS_CREDENTIAL_REF.test('XCLINE_API_KEY')).toBe(false)
    expect(CLINEPASS_CREDENTIAL_REF.test('CLINE_API_KEY;rm -rf')).toBe(false)
  })

  it('binds the credential to exactly one origin', () => {
    // The key is only ever sent here without explicit confirmation.
    expect(CLINEPASS_BASE_URL_ORIGIN).toBe('https://api.cline.bot')
  })
})
