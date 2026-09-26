/**
 * Extract the structured model catalog Command Code embeds in its docs page.
 *
 * The page is a Next.js app; the data rides its streaming RSC payload as
 * `self.__next_f.push(...)` fragments, not as a documented API. This script
 * reassembles those fragments and pulls out the models array so the shape can
 * be inspected before any code depends on it.
 */
const response = await fetch('https://commandcode.ai/docs/plans/goat')
const html = await response.text()

// Reassemble the RSC payload: each push carries a JSON string fragment.
const fragments = [...html.matchAll(/self\.__next_f\.push\(\[1,\s*("(?:[^"\\]|\\.)*")\]\)/g)]
  .map(match => {
    try { return JSON.parse(match[1]) } catch { return '' }
  })
const payload = fragments.join('')
console.log(`payload chars: ${payload.length}`)

// Find every models array in the payload and take the largest.
const candidates = []
const marker = '"models":['
let at = payload.indexOf(marker)
while (at !== -1) {
  const start = at + marker.length - 1
  let depth = 0
  let end = -1
  for (let index = start; index < payload.length; index += 1) {
    const ch = payload[index]
    if (ch === '[') depth += 1
    else if (ch === ']') {
      depth -= 1
      if (depth === 0) { end = index; break }
    }
  }
  if (end !== -1) candidates.push(payload.slice(start, end + 1))
  at = payload.indexOf(marker, at + 1)
}
if (candidates.length === 0) {
  console.error('no models array found in the payload')
  process.exit(1)
}
const raw = candidates.sort((a, b) => b.length - a.length)[0]
let models
try {
  models = JSON.parse(raw)
} catch (error) {
  console.error('the largest candidate did not parse:', error.message)
  process.exit(1)
}
console.log(`models in the catalog: ${models.length}`)
console.log('fields per row:', [...new Set(models.flatMap(row => Object.keys(row)))].sort().join(', '))
console.log('')
for (const row of models.slice(0, 5)) {
  console.log(JSON.stringify({
    id: row.id,
    contextWindow: row.contextWindow,
    reasoning: row.reasoning,
    vision: row.vision,
    minPlanName: row.minPlanName,
    inputCost: row.inputCost,
    outputCost: row.outputCost,
    cacheReadCost: row.cacheReadCost,
  }))
}
console.log('')
console.log('minPlanName values:', [...new Set(models.map(row => row.minPlanName))].join(', '))
console.log('reasoning=true:', models.filter(row => row.reasoning === true).length, 'of', models.length)
console.log('vision=true:', models.filter(row => row.vision === true).length, 'of', models.length)
console.log('rows with a published input cost:', models.filter(row => typeof row.inputCost === 'number' && row.inputCost > 0).length)
