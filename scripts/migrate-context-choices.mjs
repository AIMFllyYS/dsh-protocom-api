#!/usr/bin/env node
// Restore context steps a stored modelContexts choice excludes because the
// PRE-1.1.0 menu could not offer them.
//
// What happened: the ladder was matched by exact membership, and a model's own
// window was not added as a rung. A model declaring 1,000,000 therefore got a
// menu of [204800, 262144, 409600] -- its 1M rung is 1,048,576, which is
// GREATER than 1,000,000 and so filtered out. Choosing from that menu stored a
// subset of it, and a stored subset is authoritative (it REPLACES the offered
// steps rather than filtering them), so the model stayed capped below its real
// window even after the ladder was fixed.
//
// This adds back ONLY the steps the old menu could not display. A step the old
// menu DID show is left alone: deselecting it was a real choice, and re-adding
// it would overwrite intent rather than repair damage. The distinction is
// decidable, because the missing step is exactly one the old formula could not
// produce.
//
// Usage: node scripts/migrate-context-choices.mjs [--apply] [profileDir]
//   Without --apply it reports what it would change and writes nothing.

import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
// parseDocument, NOT parse+stringify: the patch file is hand-maintained and
// carries comments, and a plain round-trip silently deletes every one of them.
import { parseDocument } from 'yaml'
import { contextChoicesFor, GO_REFUSED_MODEL_IDS, GO_REGISTRY, identityKey, REGISTRY } from '../lib/types/model-registry.js'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const dir = args.find(a => !a.startsWith('--')) ?? join(homedir(), '.dsh', 'profiles', 'desktop')
const file = join(dir, 'cordis.patch.yml')

/** The group ladders as shipped, so the pre-fix menu can be reconstructed. */
const LADDER = [204800, 262144, 409600, 1048576]
const FAMILIES = [
  { section: 'protocom', registry: REGISTRY, group: undefined },
  { section: 'opencodeGo', registry: GO_REGISTRY, group: 'go' },
]

const doc = parseDocument(readFileSync(file, 'utf8'))
const items = doc.contents?.items ?? []
const index = items.findIndex(item => item.get?.('id') === 'protocom-api')
if (index === -1) { console.error('no protocom-api entry in ' + file); process.exit(1) }

let changed = 0
for (const family of FAMILIES) {
  const contexts = doc.getIn([index, 'config', family.section, 'modelContexts'], true)
  if (contexts?.items === undefined) continue
  for (const pair of contexts.items) {
    const id = String(pair.key)
    const chosen = pair.value?.toJSON?.()
    if (!Array.isArray(chosen) || chosen.length === 0) continue
    const model = family.registry.find(e => identityKey(e.id, family.registry) === id || e.id === id)
    if (model === undefined) continue
    if (family.group !== undefined && model.groups?.includes(family.group) !== true) continue
    const available = contextChoicesFor(model.contextWindow).filter(l => LADDER.includes(l) || l === model.contextWindow)
    // What the pre-fix filter produced: rungs <= the window, nothing added.
    const oldMenu = LADDER.filter(l => l <= model.contextWindow)
    const add = available.filter(l => !chosen.includes(l) && !oldMenu.includes(l))
    if (add.length === 0) continue
    changed++
    console.log((apply ? 'PATCH ' : 'WOULD ') + family.section + ' ' + id + '  chosen=' + JSON.stringify(chosen) + '  +' + JSON.stringify(add) + '  (window ' + model.contextWindow + ')')
    // flow:false keeps the block list the file already uses.
    if (apply) pair.value = doc.createNode([...chosen, ...add], { flow: false })
  }
}

if (changed === 0) { console.log('nothing to repair in ' + file); process.exit(0) }
if (!apply) { console.log('\n' + changed + ' entr(ies) would change. Re-run with --apply.'); process.exit(0) }
copyFileSync(file, file + '.bak-context-migration')
writeFileSync(file, doc.toString({ lineWidth: 0 }))
console.log('\n' + changed + ' entr(ies) repaired; backup at ' + file + '.bak-context-migration')