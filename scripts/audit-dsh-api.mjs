/**
 * Audit a built plugin bundle against a DSH checkout: extract every named
 * import from every @deepseek-ai module and report any symbol the checkout no
 * longer provides.
 *
 * A missing named export is fatal at module-evaluation time in ESM, which is
 * exactly the "entry did not activate: failed to import" symptom — so this
 * finds the real cause rather than the first symptom.
 *
 * Compare against the checkout's SOURCE, not its `lib/`. A working checkout
 * can carry a `lib/` built from an older revision (this one did), and auditing
 * the stale build reports symbols the running runtime does not have.
 *
 *   node scripts/audit-dsh-api.mjs <bundle.js> <dsh-checkout-root>
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const [bundlePath, dshRoot] = process.argv.slice(2)
if (!bundlePath || !dshRoot) {
  console.error('usage: node scripts/audit-dsh-api.mjs <bundle.js> <dsh-checkout-root>')
  process.exit(2)
}
const source = readFileSync(bundlePath, 'utf8')

const imports = new Map()
for (const match of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
  const symbols = match[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean)
  const mod = match[2]
  if (!imports.has(mod)) imports.set(mod, new Set())
  for (const s of symbols) imports.get(mod).add(s)
}

/** Locate the checkout directory whose package.json names this module. */
function packageDir(mod) {
  const stack = [join(dshRoot, 'packages')]
  while (stack.length > 0) {
    const dir = stack.pop()
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { continue }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name === 'node_modules' || entry.name === 'lib') continue
      const full = join(dir, entry.name)
      const pkg = join(full, 'package.json')
      if (existsSync(pkg)) {
        try {
          if (JSON.parse(readFileSync(pkg, 'utf8')).name === mod) return full
        } catch { /* unreadable */ }
      }
      stack.push(full)
    }
  }
  return undefined
}

/** Concatenated source of a package (excluding node_modules), cached. */
const sourceCache = new Map()
function packageSource(dir) {
  if (sourceCache.has(dir)) return sourceCache.get(dir)
  let text = ''
  const walk = (current) => {
    let entries
    try { entries = readdirSync(current, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'lib') continue
      const full = join(current, entry.name)
      if (entry.isDirectory()) { walk(full); continue }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue
      try { text += readFileSync(full, 'utf8') } catch { /* unreadable */ }
    }
  }
  walk(join(dir, 'src'))
  sourceCache.set(dir, text)
  return text
}

let missing = 0
for (const [mod, symbols] of imports) {
  if (!mod.startsWith('@deepseek-ai/')) continue
  const dir = packageDir(mod)
  if (dir === undefined) { console.log(`?? ${mod} — not found in checkout`); continue }
  const text = packageSource(dir)
  if (text.length === 0) { console.log(`?? ${mod} — no source found`); continue }
  const absent = [...symbols].filter(symbol => !new RegExp(`\\b${symbol}\\b`).test(text))
  if (absent.length > 0) {
    missing += absent.length
    console.log(`MISSING from ${mod}:`)
    for (const s of absent) console.log(`    ${s}`)
  } else {
    console.log(`ok  ${mod} (${symbols.size} symbols)`)
  }
}
console.log('')
console.log(missing === 0 ? 'RESULT: every imported symbol still exists.' : `RESULT: ${missing} imported symbol(s) are GONE from the source.`)
