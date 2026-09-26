// @vitest-environment jsdom
/**
 * The model row's disclosure.
 *
 * The row used to carry four control clusters on every line: about five
 * hundred controls in one group's default view. The published guidance is to
 * persist one or two per row and group the rest, so the settings moved behind
 * a disclosure and the row now leads with a summary of its own state.
 *
 * These tests pin the two properties that make that trade safe: the summary
 * carries the answer without opening, and rows open INDEPENDENTLY, because the
 * task is comparing models rather than editing one.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ProtocomSection } from '../src/client/ProtocomSection.tsx'
import { en } from '../src/client/locale.ts'
import { PROTOCOM } from '../src/family.ts'
import type { ProtocomOperations } from '../src/client/operations.ts'

const LISTING = [
  { id: 'step-3.7-flash', name: 'step-3.7-flash' },
  { id: 'step-router-v1', name: 'step-router-v1' },
]

function bench(): ProtocomOperations {
  let revision = 0
  return {
    describeSettings: async () => ({ ns: 'protocom-api', revision: 1, writable: true, value: { groups: { stepfun: { enabled: true } } } }) as never,
    describeCredentials: async () => ({}),
    storeApiKey: vi.fn(async () => undefined),
    writeSettings: vi.fn(async () => { revision += 1; return { kind: 'written', view: { ns: 'protocom-api', revision, writable: true, value: { groups: { stepfun: { enabled: true } } } } } as never }),
    discoverModels: vi.fn(async () => ({ kind: 'found', models: LISTING }) as never),
  }
}

function renderSection(operations: ProtocomOperations) {
  return render(<ProtocomSection operations={operations} t={(key) => en[key]} family={PROTOCOM} copy={{ title: en.title, intro: en.intro }} />)
}

/** Run the StepFun card's discovery and return its rows. */
async function stepfunRows(): Promise<HTMLElement[]> {
  await screen.findAllByText(en.groupStepfun)
  const card = [...document.querySelectorAll('.protocom-card')].find(
    candidate => candidate.querySelector('.protocom-card-name')?.textContent === en.groupStepfun,
  ) as HTMLElement
  const probe = [...card.querySelectorAll('button')].find(button => button.textContent === en.probeRefresh) as HTMLElement
  fireEvent.click(probe)
  await waitFor(() => expect(card.querySelectorAll('.protocom-model-row').length).toBeGreaterThan(1), { timeout: 3000 })
  return [...card.querySelectorAll('.protocom-model-row')] as HTMLElement[]
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('model row disclosure (R3)', () => {
  it('summarizes its state without being opened', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    renderSection(bench())
    const [row] = await stepfunRows()
    // The whole ladder is in force by default, and the summary says so. A row
    // that hid its state behind the disclosure would fail this.
    expect(row.querySelector('.protocom-model-summary')?.textContent).toContain('200K')
    expect(row.querySelector('.protocom-model-summary')?.textContent).toContain('1M')
    expect(row.querySelector('.protocom-model-detail')).toBeNull()
  })

  it('offers exactly one control while collapsed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    renderSection(bench())
    const [row] = await stepfunRows()
    // One disclosure, plus the visibility checkbox. Four clusters per row is
    // what made a sixty-row list unreadable.
    expect(row.querySelectorAll('.protocom-model-more')).toHaveLength(1)
    expect(row.querySelectorAll('.protocom-ctx button')).toHaveLength(0)
    expect(row.querySelectorAll('.protocom-vision')).toHaveLength(0)
  })

  it('reveals the controls when opened', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    renderSection(bench())
    const [row] = await stepfunRows()
    fireEvent.click(row.querySelector('.protocom-model-more') as HTMLElement)
    await waitFor(() => expect(row.querySelector('.protocom-model-detail')).not.toBeNull())
    const detail = row.querySelector('.protocom-model-detail') as HTMLElement
    expect(within(detail).getAllByRole('button')).toHaveLength(6)
  })

  it('opens rows independently, so two models can be compared', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    renderSection(bench())
    const rows = await stepfunRows()
    fireEvent.click(rows[0]?.querySelector('.protocom-model-more') as HTMLElement)
    fireEvent.click(rows[1]?.querySelector('.protocom-model-more') as HTMLElement)
    await waitFor(() => {
      expect(rows[0]?.querySelector('.protocom-model-detail')).not.toBeNull()
      expect(rows[1]?.querySelector('.protocom-model-detail')).not.toBeNull()
    })
  })

  it('announces its expansion state to assistive technology', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    renderSection(bench())
    const [row] = await stepfunRows()
    const more = row.querySelector('.protocom-model-more') as HTMLElement
    expect(more.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(more)
    await waitFor(() => expect(more.getAttribute('aria-expanded')).toBe('true'))
  })
})
