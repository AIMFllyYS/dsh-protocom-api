// End-to-end: OUR serializer's real output, sent live, with known-colour images.
// Covers the multi-image tool result the spill policy produces, not just one.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import zlib from 'node:zlib'
import { serializeChatRequest } from '../lib/types/protocol/chat-completions.js'

const ct = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })()
const crc32 = (b) => { let c = 0xFFFFFFFF; for (const x of b) c = ct[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
const ch = (ty, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(ty, 'ascii'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); }
function png(w, h, rgb) { const i = Buffer.alloc(13); i.writeUInt32BE(w, 0); i.writeUInt32BE(h, 4); i[8] = 8; i[9] = 2; const r = Buffer.alloc(1 + w * 3); for (let x = 0; x < w; x++) { r[1 + x * 3] = rgb[0]; r[2 + x * 3] = rgb[1]; r[3 + x * 3] = rgb[2]; } const raw = Buffer.concat(Array.from({ length: h }, () => r)); return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), ch('IHDR', i), ch('IDAT', zlib.deflateSync(raw)), ch('IEND', Buffer.alloc(0))]); }
const IMG = { RED: png(96, 96, [220, 20, 20]), GREEN: png(96, 96, [20, 180, 40]) }
const durl = (n) => 'data:image/png;base64,' + IMG[n].toString('base64')
const key = /^\s*PROTOCOM_AGGREGATE_API_KEY:\s*(\S+?)[,]?\s*$/m.exec(readFileSync(join(homedir(), '.dsh', '.credentials.yaml'), 'utf8'))![1].replace(/,$/, '')
let failures = 0
async function check(label, model, content, images, expect) {
  const body = serializeChatRequest({ messages: [{ role: 'user', content: [{ type: 'text', text: 'Name every colour you were given, comma separated. If you were given no image reply NONE.' }] }, { role: 'tool', toolCallId: 'call_1', content }] } as never, model, images)
  body.stream = false
  const resp = await fetch('https://relay.protocom.org/v1/chat/completions', { method: 'POST', headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const text = await resp.text()
  let said = ''
  try { said = (JSON.parse(text).choices?.[0]?.message?.content ?? '').trim() } catch { said = text.slice(0, 100) }
  const low = said.toLowerCase()
  const ok = expect.every(c => low.includes(c.toLowerCase()))
  if (!ok) failures++
  console.log((ok ? 'PASS ' : 'FAIL ') + label.padEnd(30) + ' http=' + resp.status + ' want=' + expect.join('+') + ' said: ' + said.slice(0, 40))
}
const one = (id, name) => ({ type: 'image', attachment: { attachmentId: id, mediaType: 'image/png' } })
const m1 = new Map([['a', durl('RED')]])
const m2 = new Map([['a', durl('RED')], ['b', durl('GREEN')]])
for (const model of ['google/gemini-3.8-flash', 'z-ai/glm-5.3-flash']) {
  console.log('== ' + model)
  await check('1 image', model, [{ type: 'text', text: 'Read 1 image.' }, one('a', 'r')], m1, ['red'])
  await check('2 images in one tool result', model, [{ type: 'text', text: 'Read 2 images.' }, one('a', 'r'), { type: 'text', text: 'and' }, one('b', 'g')], m2, ['red', 'green'])
}
console.log(failures === 0 ? 'RESULT: every image was delivered' : 'RESULT: ' + failures + ' case(s) lost an image')
process.exit(failures === 0 ? 0 : 1)