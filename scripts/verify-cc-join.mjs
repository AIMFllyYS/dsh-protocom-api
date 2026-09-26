/**
 * How well do the two Command Code sources join?
 *
 * The endpoints listing is the routing truth (it alone carries
 * supported_endpoints); the docs catalog is the capability truth (it alone
 * carries reasoning/vision/pricing). This reports how many listed models can be
 * enriched, and what an id-level join would miss.
 */
import { readFileSync } from 'node:fs'
import { parseModelsListing } from '../lib/types/discovery.js'

const response = await fetch('https://api.commandcode.ai/provider/v1/models', { headers: { accept: 'application/json' } })
const listing = parseModelsListing(await response.json())
const docs = JSON.parse(readFileSync(new URL('../.agents/commandcode-catalog-2026-09-23.json', import.meta.url), 'utf8'))
const byId = new Map(docs.map(row => [row.id, row]))

// The listing uses bare ids; the docs catalog sometimes prefixes a vendor path.
const matchOf = (id) => {
  if (byId.has(id)) return byId.get(id)
  const tail = id.includes('/') ? id.slice(id.lastIndexOf('/') + 1) : undefined
  for (const [key, row] of byId) {
    if (tail !== undefined && key.endsWith('/' + tail)) return row
    if (key === id) return row
  }
  return undefined
}

let matched = 0
const unmatched = []
for (const row of listing) {
  if (matchOf(row.id) !== undefined) matched += 1
  else unmatched.push(row.id)
}
console.log(`listing rows: ${listing.length}`)
console.log(`matched to the docs catalog: ${matched}`)
console.log(`unmatched: ${unmatched.length}`)
for (const id of unmatched.slice(0, 12)) console.log('  unmatched: ' + id)
console.log('')
const docsOnly = docs.filter(row => !listing.some(l => l.id === row.id))
console.log(`docs rows not in the listing: ${docsOnly.length}`)
for (const row of docsOnly.slice(0, 8)) console.log('  docs-only: ' + row.id)
