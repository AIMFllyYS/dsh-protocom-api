/**
 * Exercise the real CommandCodeAccountService against the live alpha endpoints,
 * the same code path the settings panel's route uses.
 *
 *   COMMANDCODE_API_KEY=<key> node scripts/verify-cc-account-service.mjs
 */
import { CommandCodeAccountService } from '../lib/types/commandcode-account.js'
import { resolveAdapterOptions } from '../lib/types/config.js'
import { COMMANDCODE } from '../lib/types/commandcode.js'

const key = process.env.COMMANDCODE_API_KEY
if (!key) { console.error('set COMMANDCODE_API_KEY first'); process.exit(2) }

const options = resolveAdapterOptions({
  baseURL: COMMANDCODE.baseURL,
  groups: { cc: { enabled: true, apiKey: 'COMMANDCODE_API_KEY' } },
}, COMMANDCODE)

const service = new CommandCodeAccountService({
  options: () => options,
  resolveApiKey: async () => key,
  log: message => console.log('  [log] ' + message),
})

const group = options.groups.get('cc')
const view = await service.readCached(group)
console.log('credits reachable:', view.credits.reachable)
console.log('usage reachable:  ', view.usage.reachable)
console.log('credential rejected:', view.credentialRejected === true)
console.log('')
const c = view.account?.credits
const u = view.account?.usage
console.log('monthly credits remaining: $' + Number(c?.monthlyCredits ?? 0).toFixed(2))
console.log('five-hour window: $' + Number(c?.fiveHour?.used ?? 0).toFixed(2) + ' of $' + c?.fiveHour?.cap + ' (' + c?.fiveHour?.percent + '%)')
console.log('weekly window:    $' + Number(c?.weekly?.used ?? 0).toFixed(2) + ' of $' + c?.weekly?.cap + ' (' + c?.weekly?.percent + '%)')
console.log('requests:', u?.requests, '| success rate:', u?.successRatePercent + '%')
console.log('cost: $' + Number(u?.cost ?? 0).toFixed(2), '| tokens in:', u?.tokensIn, '| out:', u?.tokensOut)

// The service must answer a second read from cache without hitting the network.
const started = Date.now()
await service.readCached(group)
console.log('')
console.log('cached second read took', Date.now() - started, 'ms')

if (!view.credits.reachable || !view.usage.reachable) { console.error('FAIL: a half was unreachable'); process.exit(1) }
if (c?.fiveHour === undefined || c?.weekly === undefined) { console.error('FAIL: windows missing'); process.exit(1) }
console.log('OK: both halves normalized from the live account.')
