// @vitest-environment node
/**
 * Naming the mistake when a credential field holds a file path.
 *
 * This cost a real user an evening. Explorer's "Copy as path" puts
 * `C:\Users\...\cline-key.txt` on the clipboard, and a browser's duplicate
 * download appends ` (1)`, so the key field ends up holding a path. The
 * generic guard refuses it -- correctly -- but says it "contains characters no
 * HTTP header can carry", which describes the symptom and never the mistake.
 *
 * The second half of this file is the more important half: the detector must
 * never accuse a real key of being a path.
 */
import { describe, expect, it } from 'vitest'
import { credentialEntryProblem, describePathShapedSecret } from '../src/config.ts'

describe('path-shaped credentials (R3)', () => {
  it('recognises the mistake that was actually made', () => {
    // Verbatim shape of the value found in a live profile: a folder path with
    // the browser duplicate-download suffix, which is what "Copy as path" on
    // the extracted folder produces.
    expect(describePathShapedSecret('C:\\Users\\someone\\Downloads\\cline-key (1)'))
      .toBe('a drive path')
    expect(describePathShapedSecret('C:\\Users\\someone\\Downloads\\cline-key.txt'))
      .toBe('a drive path')
  })

  it('recognises the other path spellings', () => {
    expect(describePathShapedSecret('C:/Users/someone/key.txt')).toBe('a drive path')
    expect(describePathShapedSecret('"C:\\Users\\someone\\key.txt"')).toBe('a drive path')
    expect(describePathShapedSecret('\\\\server\\share\\key.txt')).toBe('a UNC path')
    expect(describePathShapedSecret('C:key.txt')).toBe('a drive-relative path')
    expect(describePathShapedSecret('/home/someone/key.txt (2)'))
      .toBe('a path with a duplicate-download suffix')
  })

  it('never accuses a real key of being a path', () => {
    // Shapes the four families actually issue, plus the shapes neighbouring
    // vendors use. A false accusation here would be worse than the generic
    // message it replaces: it would send someone hunting for a file.
    const realKeys = [
      'sk-ant-api03-AbCdEf1234567890GhIjKlMnOpQrStUvWxYz',
      'sk-proj-9f8e7d6c5b4a39281706f5e4d3c2b1a0',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
      'aBcD1234+/efGH5678=',
      'cline_abcdefghijklmnopqrstuvwxyz0123456789',
      'CLINE_API_KEY',
      '9f8e7d6c5b4a39281706f5e4d3c2b1a0',
    ]
    for (const key of realKeys) expect(describePathShapedSecret(key), key).toBeUndefined()
  })

  it('leaves anything else to the generic guard', () => {
    // Not this check's business: a value with a space, a newline, or nothing
    // at all is refused further down with its own message.
    expect(describePathShapedSecret('has a space')).toBeUndefined()
    expect(describePathShapedSecret('line1\nline2')).toBeUndefined()
    expect(describePathShapedSecret('')).toBeUndefined()
    expect(describePathShapedSecret('(1)')).toBeUndefined()
  })
})

describe('refusing a path at entry (R3)', () => {
  it('turns a path into a sentence the operator can act on', () => {
    const problem = credentialEntryProblem('C:\\Users\\someone\\Downloads\\cline-key (1)')
    expect(problem).toContain('a drive path, not an API key')
    // The remedy has to be in the message: the user's next move is the paste,
    // not a hunt for the field.
    expect(problem).toContain('Paste the key itself')
  })

  it('lets every real key through untouched', () => {
    for (const key of [
      'sk-ant-api03-AbCdEf1234567890GhIjKlMnOpQrStUvWxYz',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
      'aBcD1234+/efGH5678=',
      '9f8e7d6c5b4a39281706f5e4d3c2b1a0',
    ]) expect(credentialEntryProblem(key), key).toBeUndefined()
  })
})
