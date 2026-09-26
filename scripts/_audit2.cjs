'use strict'
const fs = require('fs'); const path = require('path'); const os = require('os')
const root = path.resolve(__dirname, '..')
const YAML = require(path.join(root, 'node_modules', 'yaml'))
const key = YAML.parse(fs.readFileSync(path.join(os.homedir(), '.dsh', '.credentials.yaml'), 'utf8')).refs.PROTOCOM_AGGREGATE_API_KEY
async function probe(model, extra) {
  const body = { model, messages: [{ role: 'user', content: 'Say ok' }], max_tokens: 16, stream: false, ...extra }
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 30000)
    const res = await fetch('https://relay.protocom.org/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify(body), signal: ctl.signal })
    clearTimeout(t)
    const text = await res.text(); let j = null; try { j = JSON.parse(text) } catch (e) {}
    return res.status + (j && j.error ? ' | ' + String(j.error.message || '').slice(0, 160) : '')
  } catch (e) { return 'NET ' + e.message }
}
async function main() {
  // Deterministic (no model thinking involved): does the routed schema accept 'off' as a bare field value?
  console.log('A bare reasoning_effort=off          ', await probe('deepseek/deepseek-v4.1-flash', { reasoning_effort: 'off' }))
  console.log('B effort=none + thinking:disabled    ', await probe('deepseek/deepseek-v4.1-flash', { reasoning_effort: 'none', thinking: { type: 'disabled' } }))
  console.log('C effort=high + thinking:disabled    ', await probe('deepseek/deepseek-v4.1-flash', { reasoning_effort: 'high', thinking: { type: 'disabled' } }))
  console.log('D bare reasoningEffort=off (camelBase)', await probe('deepseek/deepseek-v4.1-flash', { reasoningEffort: 'off' }))
  // And whether the relay's schema rejects 'off' even on a model that is NOT thinking-mandatory:
  console.log('E glm-5.3-flash bare effort=off      ', await probe('z-ai/glm-5.3-flash', { reasoning_effort: 'off' }))
  console.log('F glm-5.3-flash effort=none          ', await probe('z-ai/glm-5.3-flash', { reasoning_effort: 'none' }))
  // Re-confirm the registry's *actual* wire output for defaultEffort 'off': resolveThinking('off','toggle') === {thinking:{type:disabled}}, effort NOT sent.
  const r = await import('file://' + path.join(root, 'src/protocol/chat-completions.ts').replace(/\\/g, '/'))
  console.log('resolveThinking(off,toggle) =', JSON.stringify(r.resolveThinking('off', 'toggle')))
  console.log('resolveThinking(none,toggle) =', JSON.stringify(r.resolveThinking('none', 'toggle')))
}
main().catch(e => { console.error('FAILED', e); process.exit(1) })