/**
 * End-to-end check of the capability catalog against the LIVE page: scrape it,
 * join it to the live listing, and report what the menu would claim.
 *
 *   node scripts/verify-cc-capabilities.mjs
 */
import { scrapeCatalog, catalogFor } from '../lib/types/commandcode-catalog.js'
import { parseModelsListing } from '../lib/types/discovery.js'
import { groupCatalog } from '../lib/types/model-registry.js'
import { COMMANDCODE } from '../lib/types/commandcode.js'

const page = await fetch(COMMANDCODE.capabilityCatalogUrl, { headers: { accept: 'text/html' } })
if (!page.ok) { console.error('FAIL: capability page answered', page.status); process.exit(1) }
const scrape = scrapeCatalog(await page.text())
console.log('catalog rows scraped:', scrape.byId.size)
if (scrape.problem !== undefined) { console.error('FAIL: scrape degraded:', scrape.problem); process.exit(1) }

const listing = parseModelsListing(await (await fetch('https://api.commandcode.ai/provider/v1/models', { headers: { accept: 'application/json' } })).json())
let joined = 0
const enriched = listing.map((row) => {
  const found = catalogFor(scrape.byId, row.id)
  if (found === undefined) return row
  joined += 1
  return { ...row, ...(row.vision === undefined ? { vision: found.vision } : {}), ...(found.reasoning ? {} : { reasoning: false }) }
})
console.log('listing rows:', listing.length)
console.log('rows joined to the catalog:', joined)

const catalog = groupCatalog('cc', enriched, { family: COMMANDCODE, registryFallback: false })
console.log('menu rows:', catalog.length)
console.log('menu rows accepting images:', catalog.filter(r => r.vision).length)
console.log('menu rows declared text-only:', catalog.filter(r => !r.vision).length)

// A definite text-only verdict must survive into the menu.
const textOnly = catalog.filter(r => !r.vision).slice(0, 6)
console.log('')
console.log('text-only rows (first 6):')
for (const row of textOnly) console.log('  ' + row.displayName)

const problems = []
if (scrape.byId.size === 0) problems.push('catalog empty')
if (joined < listing.length * 0.9) problems.push('join rate below 90%')
if (catalog.filter(r => !r.vision).length === 0) problems.push('no text-only verdict reached the menu')
if (problems.length > 0) { console.error('FAIL: ' + problems.join('; ')); process.exit(1) }
console.log('')
console.log('OK: the catalog scraped, joined, and its text-only verdicts reached the menu.')
