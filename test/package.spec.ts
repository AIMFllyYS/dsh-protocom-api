import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = new URL('../', import.meta.url)
const read = (relative: string): string => readFileSync(fileURLToPath(new URL(relative, root)), 'utf8')

describe('build artifact consistency (P2-5)', () => {
  it('the client banner id matches the package name', () => {
    const pkg = JSON.parse(read('package.json')) as { name: string }
    const config = read('tsdown.config.ts')
    const match = /load\(\{\s*id:\s*"([^"]+)"/.exec(config)
    expect(match?.[1]).toBe(pkg.name)
  })

  it('the published file set excludes sourcemaps and source', () => {
    const pkg = JSON.parse(read('package.json')) as { files: string[] }
    expect(pkg.files.some(entry => entry.includes('.map'))).toBe(false)
    expect(pkg.files.some(entry => entry.startsWith('src/'))).toBe(false)
    expect(pkg.files).toContain('lib/types/**/*.d.ts')
  })
})
