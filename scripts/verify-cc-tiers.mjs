/**
 * Verify the Command Code tier table against the live endpoint.
 *
 * The tiers come from the vendor's CLI catalog and the listing comes from its
 * endpoints API. They are separate sources that must agree on the exact id: a
 * mismatch is silent, and the affected model simply offers no Effort control,
 * which looks like a vendor limitation rather than a stale table here.
 *
 *   node scripts/verify-cc-tiers.mjs
 */
import { readFileSync } from 'node:fs'

const TIERS = JSON.parse(readFileSync(new URL('../.agents/commandcode-tiers-2026-09-27.json', import.meta.url), 'utf8'))
const LISTING_URL = 'https://api.commandcode.ai/provider/v1/models'

const response = await fetch(LISTING_URL)
if (!response.ok) {
  console.error(`listing answered HTTP ${response.status}`)
  process.exit(1)
}
const { data } = await response.json()
const listing = data.map(row => row.id)
const byId = new Map(TIERS.map(entry => [entry.id, entry.efforts]))

const joined = listing.filter(id => byId.has(id))
const unjoined = listing.filter(id => !byId.has(id))
const orphaned = [...byId.keys()].filter(id => !listing.includes(id))
const offering = TIERS.filter(entry => entry.efforts.length > 0)

console.log(`listing rows:            ${listing.length}`)
console.log(`tier rows:               ${TIERS.length}`)
console.log(`joined on the exact id:  ${joined.length}`)
console.log(`offering an Effort:      ${offering.length}`)
console.log(`deliberately none:       ${TIERS.length - offering.length}`)
if (unjoined.length > 0) console.log(`listed but no tier:      ${unjoined.join(', ')}`)
if (orphaned.length > 0) console.log(`tier but not listed:     ${orphaned.join(', ')}`)

// A model with no tier entry renders without an Effort control, so an
// unjoined id is a real defect rather than a cosmetic mismatch.
if (unjoined.length > 0 || orphaned.length > 0) {
  console.error('the tier table and the live listing disagree')
  process.exit(1)
}
console.log('OK: every listing row has a tier entry and vice versa.')