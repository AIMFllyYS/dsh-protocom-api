/**
 * End-to-end check of the Command Code family against a REAL account:
 * reads the subscription tier, applies the tier gate and the endpoint gate to
 * the live listing, and reports the menu the user would actually see.
 *
 *   COMMANDCODE_API_KEY=<key> node scripts/verify-cc-account.mjs
 *
 * The key is read from the environment and never printed.
 */
import { scrapeCatalog, catalogFor, tierFromPlanId, withinTier } from '../lib/types/commandcode-catalog.js'
import { parseModelsListing } from '../lib/types/discovery.js'
import { groupCatalog } from '../lib/types/model-registry.js'
import { COMMANDCODE } from '../lib/types/commandcode.js'

const key = process.env.COMMANDCODE_API_KEY
if (!key) { console.error('set COMMANDCODE_API_KEY first'); process.exit(2) }

const getJson = async (url) => {
  const response = await fetch(url, { headers: { authorization: 'Bearer ' + key, accept: 'application/json' } })
  if (!response.ok) throw new Error(url + ' -> HTTP ' + response.status)
  return response.json()
}

const whoami = await getJson('https://api.commandcode.ai/alpha/whoami')
console.log('account:', whoami.user?.userName ?? '(unnamed)')

const sub = await getJson('https://api.commandcode.ai/alpha/billing/subscriptions')
const planId = sub.data?.planId
const tier = tierFromPlanId(planId)
console.log('planId:', planId, '-> tier:', tier)

const credits = await getJson('https://api.commandcode.ai/alpha/billing/credits')
const monthly = credits.credits?.monthlyCredits
const five = credits.windowLimits?.fiveHour
const weekly = credits.windowLimits?.weekly
console.log('monthly credits remaining: $' + Number(monthly ?? 0).toFixed(2))
console.log('five-hour window: $' + Number(five?.used ?? 0).toFixed(2) + ' of $' + five?.cap)
console.log('weekly window:    $' + Number(weekly?.used ?? 0).toFixed(2) + ' of $' + weekly?.cap)

const page = await (await fetch(COMMANDCODE.capabilityCatalogUrl, { headers: { accept: 'text/html' } })).text()
const scrape = scrapeCatalog(page)
console.log('')
console.log('catalog rows:', scrape.byId.size)

const listing = parseModelsListing(await (await fetch('https://api.commandcode.ai/provider/v1/models', { headers: { accept: 'application/json' } })).json())
let outOfPlan = 0
let joined = 0
const enriched = listing.map((row) => {
  const found = catalogFor(scrape.byId, row.id)
  if (found === undefined) return row
  joined += 1
  if (!withinTier(found.minPlan, tier)) { outOfPlan += 1; return { ...row, outOfPlan: true } }
  return { ...row, ...(row.vision === undefined ? { vision: found.vision } : {}), ...(found.reasoning ? {} : { reasoning: false }) }
})
console.log('listing rows:', listing.length, '| joined:', joined, '| out of plan:', outOfPlan)

const catalog = groupCatalog('cc', enriched, { family: COMMANDCODE, registryFallback: false })
console.log('MENU ROWS:', catalog.length)
console.log('  accepting images:', catalog.filter(r => r.vision).length)
console.log('  text-only:', catalog.filter(r => !r.vision).length)
console.log('')
console.log('sample menu:')
for (const row of catalog.slice(0, 6)) {
  console.log('  ' + row.displayName.padEnd(28) + ' ctx=' + String(row.contextWindow).padEnd(8) + ' vision=' + row.vision)
}

// The decisive check: a model the menu offers must actually answer.
const probe = catalog[0]
const body = JSON.stringify({ model: probe.ids[0], messages: [{ role: 'user', content: 'Reply with OK' }], max_tokens: 16 })
const answer = await fetch('https://api.commandcode.ai/provider/v1/chat/completions', {
  method: 'POST',
  headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
  body,
})
console.log('')
console.log('menu model ' + probe.ids[0] + ' -> HTTP ' + answer.status)
if (!answer.ok) {
  console.error('FAIL: the menu offered a model that does not answer')
  console.error((await answer.text()).slice(0, 300))
  process.exit(1)
}
console.log('OK: the tier gate holds and a menu model really answers.')
