/** Write the extracted docs catalog to .agents/ for inspection. */
const response = await fetch('https://commandcode.ai/docs/plans/goat')
const html = await response.text()
const fragments = [...html.matchAll(/self\.__next_f\.push\(\[1,\s*("(?:[^"\\]|\\.)*")\]\)/g)].map(m => { try { return JSON.parse(m[1]) } catch { return '' } })
const payload = fragments.join('')
const marker = '"models":['
const candidates = []
let at = payload.indexOf(marker)
while (at !== -1) {
  const start = at + marker.length - 1
  let depth = 0, end = -1
  for (let i = start; i < payload.length; i += 1) {
    const ch = payload[i]
    if (ch === '[') depth += 1
    else if (ch === ']') { depth -= 1; if (depth === 0) { end = i; break } }
  }
  if (end !== -1) candidates.push(payload.slice(start, end + 1))
  at = payload.indexOf(marker, at + 1)
}
const models = JSON.parse(candidates.sort((a, b) => b.length - a.length)[0])
const { writeFileSync } = await import('node:fs')
const out = new URL('../.agents/commandcode-catalog-2026-09-23.json', import.meta.url)
writeFileSync(out, JSON.stringify(models, null, 1))
console.log('wrote', models.length, 'rows to', out.pathname)
