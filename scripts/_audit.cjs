
'use strict'
const fs = require('fs'); const path = require('path')
async function main() {
  const cacheDir = path.resolve(__dirname, '_audit-cache')
  fs.mkdirSync(cacheDir, { recursive: true })
  const get = async (url, file) => {
    const p = path.join(cacheDir, file)
    const res = await fetch(url, { redirect: 'follow' })
    const text = await res.text()
    fs.writeFileSync(p, text)
    return { status: res.status, text }
  }
  const cc = await get('https://api.commandcode.ai/provider/v1/models', 'cc-listing.json')
  const go = await get('https://opencode.ai/zen/go/v1/models', 'go-listing.json')
  console.log('cc status', cc.status, 'bytes', cc.text.length)
  console.log('go status', go.status, 'bytes', go.text.length)

  const ccRows = JSON.parse(cc.text).data
  const goRows = JSON.parse(go.text).data
  console.log('CC rows:', ccRows.length, '| GO rows:', goRows.length)
  console.log('')
  console.log('=== CC endpoint surface histogram ===')
  const hist = new Map()
  for (const r of ccRows) {
    const k = JSON.stringify(r.supported_endpoints || [])
    hist.set(k, (hist.get(k) || 0) + 1)
  }
  for (const [k, v] of [...hist].sort((a,b)=>b[1]-a[1])) console.log('  ', k, v)
  console.log('')
  console.log('=== CC messages-only ids (hidden by servesDeclaredEndpoints) ===')
  const hidden = ccRows.filter(r => Array.isArray(r.supported_endpoints) && r.supported_endpoints.length && !r.supported_endpoints.includes('/chat/completions') && !r.supported_endpoints.includes('/responses'))
  for (const r of hidden) console.log('  ', r.id, JSON.stringify(r.supported_endpoints))
  console.log('')
  console.log('=== CC context_length histogram ===')
  const ch = new Map()
  for (const r of ccRows) ch.set(r.context_length, (ch.get(r.context_length)||0)+1)
  for (const [k,v] of [...ch].sort((a,b)=>a[0]-b[0])) console.log('  ', k, v)
  console.log('')
  console.log('=== CC rows (id | ctx | endpoints | name) ===')
  for (const r of ccRows) console.log('  ', r.id.padEnd(52), String(r.context_length).padEnd(9), JSON.stringify(r.supported_endpoints), '|', r.name)
  fs.writeFileSync(path.join(cacheDir,'cc-ids.json'), JSON.stringify(ccRows.map(r=>r.id), null, 2))
  console.log('')
  console.log('=== GO ids ===')
  console.log(JSON.stringify(goRows.map(r=>r.id), null, 1))
  fs.writeFileSync(path.join(cacheDir,'go-ids.json'), JSON.stringify(goRows.map(r=>r.id), null, 2))
}
main().catch(e => { console.error('FAILED', e); process.exit(1) })
