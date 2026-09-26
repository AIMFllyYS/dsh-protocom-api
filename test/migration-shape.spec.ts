// @vitest-environment node
/**
 * The migration a 0.8.0 deployment has to perform is documented in the README,
 * and getting it subtly wrong is invisible: a config in the old shape still
 * parses, it just resolves to all-defaults, so the plugin looks installed while
 * serving nothing. These tests pin the shape the documentation promises.
 */
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { Config } from '../src/config.ts'

/** The old shape: four top-level sections in a settings document. */
const LEGACY = `
protocom-api:
  groups:
    aggregate:
      enabled: true
      apiKey: PROTOCOM_AGGREGATE_API_KEY
  hiddenModels:
    - some/hidden-model
opencode-go:
  groups:
    go:
      enabled: true
      apiKey: OPENCODE_GO_API_KEY
`

/** Re-key a legacy document into the one Config, as the migration documents. */
function migrate(document: Record<string, unknown>): Record<string, unknown> {
  const config: Record<string, unknown> = {}
  if (document['protocom-api'] !== undefined) config['protocom'] = document['protocom-api']
  if (document['opencode-go'] !== undefined) config['opencodeGo'] = document['opencode-go']
  if (document['commandcode'] !== undefined) config['commandcode'] = document['commandcode']
  if (document['model-fusion'] !== undefined) config['fusion'] = document['model-fusion']
  return config
}

describe('legacy settings migration (1.0.0)', () => {
  it('carries an operator\'s groups across the section rename', () => {
    const migrated = migrate(parse(LEGACY) as Record<string, unknown>)
    const parsed = Config(migrated as never)
    // The whole point: a group that was on stays on.
    expect(parsed.protocom.get().groups?.['aggregate']?.enabled).toBe(true)
    expect(parsed.opencodeGo.get().groups?.['go']?.enabled).toBe(true)
    expect(parsed.protocom.get().hiddenModels).toEqual(['some/hidden-model'])
    // Sections the operator never had fall back to their own defaults rather
    // than inheriting a neighbour's.
    expect(parsed.commandcode.get().groups).toEqual({})
    expect(parsed.fusion.get().enabled).toBe(false)
  })

  it('leaves the OLD shape resolving to defaults, which is why the rename matters', () => {
    // A deployment that pastes its old document unchanged gets no error at all;
    // `groups` is simply not a field of a section, so nothing is enabled. This
    // test exists so that failure mode is on the record rather than guessed at.
    const parsed = Config(parse(LEGACY) as never)
    expect(parsed.protocom.get().groups).toEqual({})
    expect(parsed.protocom.get().baseURL).toBeTruthy()
  })
})
