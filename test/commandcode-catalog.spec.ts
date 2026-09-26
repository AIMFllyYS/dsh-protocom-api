/**
 * The Command Code capability catalog parser.
 *
 * The page it reads is a SCRAPED, undocumented Next.js payload, so the failure
 * paths matter as much as the happy one: every degradation must yield "no
 * capability claims" rather than an empty model menu.
 */
import { describe, expect, it } from 'vitest'
import {
  catalogFor,
  modelsArrays,
  parseCatalogRows,
  reassembleFlightPayload,
  scrapeCatalog,
} from '../src/commandcode-catalog.ts'

/** Wrap one JSON value the way the real page streams it. */
function flightPage(...values: unknown[]): string {
  return values
    .map(value => `<script>self.__next_f.push([1,${JSON.stringify(JSON.stringify(value))}])</script>`)
    .join('')
}

/** One catalog row in the shape the live page used. */
const ROW = {
  id: 'stealth/space-bunny-alpha',
  name: 'Space Bunny Alpha',
  contextWindow: 1_000_000,
  reasoning: true,
  vision: true,
  inputCost: 0.834,
  outputCost: 2.501,
  cacheReadCost: 0.042,
  minPlanName: 'Go',
  caps: { text: true, vision: true, reasoning: true },
}

describe('payload reassembly', () => {
  it('joins the streamed fragments in order', () => {
    const html = flightPage({ a: 1 }, { b: 2 })
    expect(reassembleFlightPayload(html)).toBe('{"a":1}{"b":2}')
  })

  it('skips a fragment that is not a JSON string', () => {
    // Built with JSON.stringify rather than inline escapes: the fixture must
    // put a real JSON-string argument in the push call, which is what the
    // page emits, and hand-escaping it is exactly how this test first went
    // wrong.
    const good = '<script>self.__next_f.push([1,' + JSON.stringify('{"a":1}') + '])</script>'
    const bad = '<script>self.__next_f.push([1,notJson])</script>'
    expect(reassembleFlightPayload(good + bad)).toBe('{"a":1}')
  })

  it('returns an empty payload for a page with no fragments', () => {
    expect(reassembleFlightPayload('<html>nothing here</html>')).toBe('')
  })
})

describe('models array extraction', () => {
  it('finds the array after a models key', () => {
    const payload = 'x"models":[{"id":"a"}]y'
    expect(JSON.parse(modelsArrays(payload)[0] as string)).toEqual([{ id: 'a' }])
  })

  it('handles a nested array and a brace inside a string', () => {
    // Balance counting must not be fooled by brackets or escapes inside strings,
    // which is exactly what the real payload is full of.
    const payload = '"models":[{"note":"a ] bracket and \\" quote","nested":[1,2]}]tail'
    const found = modelsArrays(payload)
    expect(found).toHaveLength(1)
    expect(() => JSON.parse(found[0] as string)).not.toThrow()
  })

  it('prefers the largest array when the payload carries several', () => {
    const payload = '"models":[1]"models":[1,2,3]'
    expect(JSON.parse(modelsArrays(payload)[0] as string)).toEqual([1, 2, 3])
  })

  it('returns nothing when the key is absent', () => {
    expect(modelsArrays('no catalog here')).toEqual([])
  })
})

describe('row parsing', () => {
  it('reads the fields the live page carries', () => {
    const { byId } = parseCatalogRows([ROW])
    expect(byId.get('stealth/space-bunny-alpha')).toEqual({
      reasoning: true,
      vision: true,
      contextWindow: 1_000_000,
      inputCost: 0.834,
      outputCost: 2.501,
      cacheReadCost: 0.042,
      minPlan: 'Go',
    })
  })

  it('falls back to the caps object when the flat fields are absent', () => {
    const { byId } = parseCatalogRows([{ id: 'm', caps: { reasoning: true, vision: false } }])
    expect(byId.get('m')).toMatchObject({ reasoning: true, vision: false })
  })

  it('skips a row that states no capabilities rather than guessing', () => {
    // A guessed capability is the defect the catalog exists to remove.
    const { byId, skipped } = parseCatalogRows([{ id: 'm' }, { id: 'n', reasoning: true }])
    expect(byId.size).toBe(0)
    expect(skipped).toBe(2)
  })

  it('skips rows with no usable id or a non-boolean verdict', () => {
    const { byId, skipped } = parseCatalogRows([
      { reasoning: true, vision: true },
      { id: '', reasoning: true, vision: true },
      { id: 'x'.repeat(300), reasoning: true, vision: true },
      { id: 'm', reasoning: 'yes', vision: true },
    ])
    expect(byId.size).toBe(0)
    expect(skipped).toBe(4)
  })

  it('keeps a zero cost as a real price and drops a negative one', () => {
    // A free model genuinely costs 0; a negative cost is nonsense and dropped.
    const { byId } = parseCatalogRows([
      { id: 'free', reasoning: false, vision: false, inputCost: 0, outputCost: 0 },
      { id: 'bad', reasoning: false, vision: false, inputCost: -5 },
    ])
    expect(byId.get('free')).toMatchObject({ inputCost: 0, outputCost: 0 })
    expect(byId.get('bad')).not.toHaveProperty('inputCost')
  })

  it('drops a zero context window, which is not a window', () => {
    const { byId } = parseCatalogRows([{ id: 'm', reasoning: true, vision: true, contextWindow: 0 }])
    expect(byId.get('m')).not.toHaveProperty('contextWindow')
  })

  it('rejects a non-array', () => {
    expect(parseCatalogRows({ nope: true }).byId.size).toBe(0)
  })
})

describe('id joining tolerates the vendor prefix', () => {
  const { byId } = parseCatalogRows([ROW, { id: 'gpt-6-astra', reasoning: true, vision: true }])

  it('matches an exact id', () => {
    expect(catalogFor(byId, 'gpt-6-astra')).toBeDefined()
  })

  it('matches a listing id by its last path segment', () => {
    // The live data needs this: the listing says "space-bunny-alpha" while the
    // page says "stealth/space-bunny-alpha".
    expect(catalogFor(byId, 'space-bunny-alpha')).toBeDefined()
    expect(catalogFor(byId, 'other/space-bunny-alpha')).toBeDefined()
  })

  it('returns nothing for an id the page omitted', () => {
    expect(catalogFor(byId, 'unknown-model')).toBeUndefined()
    expect(catalogFor(byId, 'unknown/unknown-model')).toBeUndefined()
  })
})

describe('degradation never empties the menu', () => {
  it('reports a problem when the page could not be read at all', () => {
    const scrape = scrapeCatalog(undefined, 'HTTP 503')
    expect(scrape.byId.size).toBe(0)
    expect(scrape.problem).toBe('HTTP 503')
  })

  it('reports a problem for a page with no payload', () => {
    expect(scrapeCatalog('<html>plain</html>').problem).toMatch(/no readable payload/)
  })

  it('reports a problem for a payload with no catalog', () => {
    expect(scrapeCatalog(flightPage({ other: 1 })).problem).toMatch(/no model catalog/)
  })

  it('reports a problem when no candidate array parses', () => {
    const html = '<script>self.__next_f.push([1,"\\"models\\":[broken"])</script>'
    expect(scrapeCatalog(html).problem).toBeDefined()
  })

  it('succeeds on the real page shape', () => {
    const scrape = scrapeCatalog(flightPage({ models: [ROW] }))
    expect(scrape.problem).toBeUndefined()
    expect(scrape.byId.size).toBe(1)
  })

  it('recovers when the largest array is not the catalog but a smaller one is', () => {
    const html = flightPage({ models: [1, 2, 3] }, { models: [ROW] })
    // Both candidates are considered; the parseable one with rows wins.
    expect(scrapeCatalog(html).byId.size).toBe(1)
  })
})
