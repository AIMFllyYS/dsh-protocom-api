/**
 * Report the menu Command Code would render: per-model context window, vision,
 * and reasoning vocabulary, as the plugin's own projection produces them.
 * A manual check beside verify-commandcode.mjs.
 */
import { parseModelsListing } from '../lib/types/discovery.js'
import { groupCatalog } from '../lib/types/model-registry.js'
import { COMMANDCODE } from '../lib/types/commandcode.js'

const response = await fetch('https://api.commandcode.ai/provider/v1/models', { headers: { accept: 'application/json' } })
const listing = parseModelsListing(await response.json())
const catalog = groupCatalog('cc', listing, { family: COMMANDCODE, registryFallback: false })

const withReasoning = catalog.filter(row => row.reasoning !== undefined)
const withoutReasoning = catalog.filter(row => row.reasoning === undefined)
console.log(`menu rows: ${catalog.length}`)
console.log(`rows declaring a reasoning vocabulary: ${withReasoning.length}`)
console.log(`rows with none (no Effort submenu): ${withoutReasoning.length}`)
console.log(`rows accepting images: ${catalog.filter(row => row.vision).length}`)
console.log(`rows declared text-only: ${catalog.filter(row => !row.vision).length}`)
console.log('')
console.log('context windows in the menu:', [...new Set(catalog.map(row => row.contextWindow))].sort((a, b) => a - b).join(', '))
console.log('')
console.log('sample rows:')
for (const row of catalog.slice(0, 8)) {
  console.log(`  ${row.displayName.padEnd(28)} ctx=${String(row.contextWindow).padEnd(8)} vision=${row.vision} reasoning=${row.reasoning === undefined ? '-' : row.reasoning.efforts.join('/')}`)
}
