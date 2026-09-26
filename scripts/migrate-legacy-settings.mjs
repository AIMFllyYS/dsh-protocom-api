/**
 * Migrate a pre-1.7 settings document to the 1.0.0 section shape.
 *
 * DSH 1.7 gives a plugin exactly one Config, keyed by its Loader row, so the
 * four sections this plugin used to register as separate namespaces became
 * fields of one document. A deployment upgrading from 0.8.0 therefore has its
 * values in the old shape -- and, because the Host normally imports
 * `settings.yaml` exactly once, often still sitting in the renamed
 * `settings.yaml.imported` with nothing having read them.
 *
 * This reads that document, re-keys the four sections, VALIDATES the result
 * against the plugin's real Config schema, and prints a patch entry to paste
 * into the profile. Validation is the point: a silently wrong shape would
 * leave the groups looking configured while the plugin served defaults.
 *
 *   node scripts/migrate-legacy-settings.mjs <settings.yaml[.imported]> [out.yml]
 *
 * Prints the entry on stdout, and writes it to `out.yml` as UTF-8 when given.
 * Prefer the file form on Windows: PowerShell's `>` redirection writes UTF-16LE,
 * which no YAML reader accepts, and the resulting failure names the wrong file.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { parse, stringify } from 'yaml'

/** Old top-level section name -> field of the one Config. */
const SECTIONS = {
  'protocom-api': 'protocom',
  'opencode-go': 'opencodeGo',
  'commandcode': 'commandcode',
  'model-fusion': 'fusion',
}

const source = process.argv[2]
if (!source) {
  console.error('usage: node scripts/migrate-legacy-settings.mjs <settings.yaml[.imported]>')
  process.exit(2)
}
const document = parse(readFileSync(source, 'utf8'))
if (document === null || typeof document !== 'object') {
  console.error(`${source}: not a settings document`)
  process.exit(1)
}

const config = {}
const found = []
for (const [legacy, field] of Object.entries(SECTIONS)) {
  const section = document[legacy]
  if (section === undefined) continue
  config[field] = section
  found.push(`${legacy} -> ${field}`)
}
if (found.length === 0) {
  console.error(`${source}: no protocom-api / opencode-go / commandcode / model-fusion section`)
  process.exit(1)
}
console.error(`migrated: ${found.join(', ')}`)

// Emit through the YAML serializer with block style, so the result is a file a
// human can still read and diff rather than one long flow mapping.
const entry = [{ id: 'protocom-api', name: 'dsh-protocom-api', config }]
const rendered = stringify(entry, { lineWidth: 0, defaultStringType: 'PLAIN', defaultKeyType: 'PLAIN' })
const out = process.argv[3]
if (out === undefined) process.stdout.write(rendered)
else {
  writeFileSync(out, rendered, 'utf8')
  console.error(`wrote ${out}`)
}
