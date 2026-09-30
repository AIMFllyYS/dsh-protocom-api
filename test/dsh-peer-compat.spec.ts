// @vitest-environment node
/**
 * The compatibility contract DSH enforces before it imports this plugin.
 *
 * `packages/boot/app-boot/src/plugin-compatibility.ts` refuses to admit a
 * plugin unless every `@deepseek-ai/dsh*` peer range satisfies the runtime
 * version, using `semver.satisfies(runtime, range, { includePrerelease: true })`.
 * A refusal is not a warning: the plugin is denied and every provider in it
 * goes dark, which is exactly what happened when DSH moved from 0.1.7-rc.2 to
 * 0.2.0-rc.2 and this manifest still said `^0.1.7-rc.2`.
 *
 * That failure was avoidable: the check is reproducible offline, because the
 * version a plugin is admitted against is the one its own devDependencies
 * install. This test runs DSH's exact call against that version, so a runtime
 * bump fails here -- where the fix is a one-line range edit -- instead of at
 * install time, where it reads as a broken product.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import semver from 'semver'

/** Our manifest, which declares the peers DSH judges. */
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  peerDependencies?: Record<string, string>
}

/**
 * The runtime version this checkout is built against.
 *
 * Read from the installed `dsh-llm` rather than hardcoded: the point is to
 * compare the declared range against whatever version is actually present.
 */
function installedRuntime(): string {
  const pkg = JSON.parse(readFileSync(
    new URL('../node_modules/@deepseek-ai/dsh-llm/package.json', import.meta.url),
    'utf8',
  )) as { version: string }
  return pkg.version
}

describe('DSH peer compatibility (R3)', () => {
  it('admits this plugin on the runtime it is built against', () => {
    const runtime = installedRuntime()
    expect(semver.valid(runtime), runtime).not.toBeNull()
    const peers = manifest.peerDependencies ?? {}
    const dshPeers = Object.entries(peers)
      // The runtime checks exactly these, and ignores every other name.
      .filter(([name]) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'))
    expect(dshPeers.length).toBeGreaterThan(0)
    const refused = dshPeers.filter(([, range]) => !semver.satisfies(runtime, range, { includePrerelease: true }))
    // Named in the failure, because "which range is wrong" is the whole question.
    expect(refused, `runtime ${runtime}`).toEqual([])
  })

  it('still admits the runtime this plugin last shipped against', () => {
    // The range deliberately spans both, and the API surface the plugin uses
    // is identical in each: no package it imports changed its source between
    // 0.1.7-rc.2 and 0.2.0-rc.2. Pinning only the new runtime would strand
    // every deployment that has not upgraded yet.
    const peers = manifest.peerDependencies ?? {}
    for (const [name, range] of Object.entries(peers)) {
      if (name !== '@deepseek-ai/dsh' && !name.startsWith('@deepseek-ai/dsh-')) continue
      expect(semver.satisfies('0.1.7-rc.2', range, { includePrerelease: true }), `${name} ${range}`).toBe(true)
    }
  })

  it('does not claim the next minor prereleases', () => {
    // An upper bound of plain `<0.3.0` would admit 0.3.0-alpha and 0.3.0-rc.1,
    // which have never been examined. `<0.3.0-0` is the idiomatic way to
    // exclude a version and all its prereleases.
    const peers = manifest.peerDependencies ?? {}
    for (const [name, range] of Object.entries(peers)) {
      if (name !== '@deepseek-ai/dsh' && !name.startsWith('@deepseek-ai/dsh-')) continue
      expect(semver.satisfies('0.3.0-rc.1', range, { includePrerelease: true }), `${name} ${range}`).toBe(false)
    }
  })
})
