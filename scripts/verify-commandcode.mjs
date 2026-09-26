/**
 * Live smoke check for the Command Code family: run THIS PLUGIN's own discovery
 * and catalog projection against the real endpoint and report what a user would
 * actually see in the model menu.
 *
 * Not part of the test suite: it needs the network, so it is a manual check to
 * run after a release that touches the family. The endpoint answers its listing
 * without a credential, which is why this needs no key.
 *
 *   node scripts/verify-commandcode.mjs
 */
import { parseModelsListing } from '../lib/types/discovery.js'
import { groupCatalog } from '../lib/types/model-registry.js'
import { COMMANDCODE } from '../lib/types/commandcode.js'

const URL = 'https://api.commandcode.ai/provider/v1/models'

const response = await fetch(URL, { headers: { accept: 'application/json' } })
if (!response.ok) {
  console.error(`FAIL: ${URL} answered ${response.status}`)
  process.exit(1)
}
const listing = parseModelsListing(await response.json())
console.log(`listing rows: ${listing.length}`)

const withEndpoints = listing.filter(row => row.endpoints !== undefined).length
console.log(`rows carrying supported_endpoints: ${withEndpoints}`)

const catalog = groupCatalog('cc', listing, { family: COMMANDCODE, registryFallback: false })
const offered = catalog.flatMap(row => row.ids)
console.log(`offered in the menu: ${offered.length}`)

const hidden = listing.map(row => row.id).filter(id => !offered.includes(id))
console.log(`hidden: ${hidden.length}`)
for (const id of hidden.slice(0, 12)) console.log(`  hidden: ${id}`)

const sample = catalog.slice(0, 3)
for (const row of sample) {
  console.log(`  menu: ${row.displayName}  ctx=${row.contextWindow}  ids=${row.ids.join('|')}`)
}

const problems = []
if (withEndpoints !== listing.length) problems.push('some rows carried no supported_endpoints')
if (offered.length === 0) problems.push('the menu came out empty')
if (catalog.some(row => row.contextWindow === undefined)) problems.push('a menu row had no context window')

if (problems.length > 0) {
  console.error(`FAIL: ${problems.join('; ')}`)
  process.exit(1)
}
console.log('OK: every row disclosed its endpoints, the menu is non-empty, and every row has a context window.')
