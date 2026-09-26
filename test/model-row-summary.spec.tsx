// @vitest-environment jsdom
/**
 * Row summary edge cases.
 *
 * The summary is the collapsed row's whole answer, so it must stay correct
 * where the ladder is unusual: a group that ships no ladder at all, and a row
 * the deployment has hidden.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProtocomSection } from '../src/client/ProtocomSection.tsx'
import { en } from '../src/client/locale.ts'
import { PROTOCOM } from '../src/family.ts'
import type { ProtocomOperations } from '../src/client/operations.ts'

function bench(value: Record<string, unknown>): ProtocomOperations {
  return {
    describeSettings: async () => ({ ns: 'protocom-api', revision: 1, writable: true, value }) as never,
    describeCredentials: async () => ({}),
    storeApiKey: vi.fn(async () => undefined),
    writeSettings: vi.fn(async () => ({ kind: 'written', view: {} }) as never),
    discoverModels: vi.fn(async () => ({ kind: 'found', models: [{ id: 'kimi-k3', name: 'Kimi K3' }] }) as never),
  }
}

function renderSection(operations: ProtocomOperations) {
  return render(<ProtocomSection operations={operations} t={(key) => en[key]} family={PROTOCOM} copy={{ title: en.title, intro: en.intro }} />)
}

/** Run the aggregate card's discovery and return its first row. */
async function aggregateRow(): Promise<HTMLElement> {
  await screen.findAllByText(en.groupAggregate)
  const card = [...document.querySelectorAll('.protocom-card')].find(
    candidate => candidate.querySelector('.protocom-card-name')?.textContent === en.groupAggregate,
  ) as HTMLElement
  fireEvent.click([...card.querySelectorAll('button')].find(b => b.textContent === en.probeRefresh) as HTMLElement)
  await waitFor(() => expect(card.querySelector('.protocom-model-row')).not.toBeNull(), { timeout: 3000 })
  return card.querySelector('.protocom-model-row') as HTMLElement
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('row summary edge cases (R3)', () => {
  it('names the single window when the group ships no ladder', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    renderSection(bench({ groups: { aggregate: { enabled: true } } }))
    const row = await aggregateRow()
    // The aggregate group ships no ladder, so the model is served at one
    // length. The summary must still name it rather than render blank.
    const summary = row.querySelector('.protocom-model-summary')?.textContent ?? ''
    expect(summary).toMatch(/\d/)
  })

  it('keeps the summary readable on a hidden row', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    renderSection(bench({ groups: { aggregate: { enabled: true } }, hiddenModels: ['kimi-k3'] }))
    const row = await aggregateRow()
    // Hiding a row changes the visibility control, not what the row is set
    // to; the summary stays so an operator can see what re-enabling restores.
    expect(row.className).toContain('is-off')
    expect(row.querySelector('.protocom-model-summary')?.textContent).toMatch(/\d/)
  })
})
