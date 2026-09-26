import { parseModelsListing } from '../lib/types/discovery.js'
import { groupCatalog, catalogEntry } from '../lib/types/model-registry.js'
import { variantLengths } from '../lib/types/context-variants.js'
import { COMMANDCODE } from '../lib/types/commandcode.js'

const response = await fetch('https://api.commandcode.ai/provider/v1/models', { headers: { accept: 'application/json' } })
const listing = parseModelsListing(await response.json())
const catalog = groupCatalog('cc', listing, { family: COMMANDCODE, registryFallback: false })
const configured = COMMANDCODE.defaults['cc'].contextLengths
console.log('configured ladder:', configured.join(', '))
console.log('')
// How the menu would expand each model into variant entries.
for (const row of catalog.slice(0, 6)) {
  const lengths = variantLengths(row.contextOptions, configured)
  const entries = lengths === undefined
    ? [row.displayName + ' (one entry at ' + row.contextWindow + ')']
    : lengths.map(n => row.displayName + ' [' + n + ']')
  console.log(entries.join('  |  '))
}
const anyVariants = catalog.filter(row => variantLengths(row.contextOptions, configured) !== undefined).length
console.log('')
console.log('rows that would offer context variants:', anyVariants, 'of', catalog.length)
console.log('rows whose window is BELOW the first rung (200000):', catalog.filter(r => r.contextWindow < 200000).length)
