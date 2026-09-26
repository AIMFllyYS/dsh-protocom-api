// @vitest-environment jsdom
/**
 * The context-length chips on one model row.
 *
 * The report was: different lengths cannot be clicked, and clicking one makes
 * the whole page flash. Those are two defects, and the first had a subtle
 * cause -- the chips were drawn from the GROUP ladder while the pressed set
 * came from the per-model store, so whenever the two disagreed the row showed
 * a single pressed chip, and that chip was the one the at-least-one guard
 * disables. A row could therefore offer exactly one usable-looking control
 * that refused every click.
 *
 * StepFun is the case that exposes it: it is the one group shipping a
 * four-step ladder, so its rows have a real choice to make.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProtocomSection } from '../src/client/ProtocomSection.tsx'
import { en } from '../src/client/locale.ts'
import { PROTOCOM } from '../src/family.ts'
import type { ProtocomOperations } from '../src/client/operations.ts'

/**
 * Discovery answers with UPSTREAM listing rows, which the card projects into
 * menu entries; a projected row here would render nothing, because the
 * projection reads the id.
 */
const LISTING = [{ id: 'step-3.7-flash', name: 'step-3.7-flash' }]

/**
 * An operations stub whose describeSettings reflects every write, the way the
 * Host does. A frozen view would hide the re-render loop these tests catch.
 * @param initial - the stored modelContexts map.
 */
function bench(initial: Record<string, number[]> = {}) {
  let contexts = { ...initial }
  const writes: { op: string; path: string[]; value?: unknown }[][] = []
  let describes = 0
  const operations: ProtocomOperations = {
    describeSettings: async () => {
      describes += 1
      return {
        ns: 'protocom-api',
        revision: describes,
        writable: true,
        value: { groups: { stepfun: { enabled: true } }, modelContexts: contexts },
      } as never
    },
    describeCredentials: async () => ({}),
    storeApiKey: vi.fn(async () => undefined),
    writeSettings: vi.fn(async (ops) => {
      writes.push(ops as never)
      for (const op of ops as { op: string; path: string[]; value?: unknown }[]) {
        if (op.path[0] !== 'modelContexts') continue
        if (op.op === 'unset') delete contexts[op.path[1] as string]
        else contexts = { ...contexts, [op.path[1] as string]: op.value as number[] }
      }
      return { kind: 'written', view: {} } as never
    }),
    discoverModels: vi.fn(async () => ({ kind: 'found', models: LISTING }) as never),
  }
  return { operations, writes, describes: () => describes }
}

function renderSection(operations: ProtocomOperations) {
  return render(<ProtocomSection
    operations={operations}
    t={(key) => en[key]}
    family={PROTOCOM}
    copy={{ title: en.title, intro: en.intro }}
  />)
}

/** Run the StepFun card's discovery, then return its model row. */
async function stepfunRow(): Promise<HTMLElement> {
  // The cards do not exist until the first settings read lands, so wait for the
  // group name rather than querying immediately.
  await screen.findAllByText(en.groupStepfun)
  const cards = [...document.querySelectorAll('.protocom-card')]
  const card = cards.find(candidate => candidate.querySelector('.protocom-card-name')?.textContent === en.groupStepfun) as HTMLElement
  const buttons = [...card.querySelectorAll('button')]
  fireEvent.click(buttons.find(button => button.textContent === en.probeRefresh) as HTMLElement)
  await waitFor(() => expect(card.querySelector('.protocom-model-row')).not.toBeNull(), { timeout: 3000 })
  return card.querySelector('.protocom-model-row') as HTMLElement
}

/** The chips of one row, in ladder order. */
function chips(row: HTMLElement): HTMLButtonElement[] {
  return [...row.querySelectorAll('.protocom-ctx button')] as HTMLButtonElement[]
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('context length chips (R3)', () => {
  it('draws one chip per step the group advertises', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    renderSection(bench().operations)
    const row = await stepfunRow()
    // StepFun ships a four-step ladder and the adapter advertises all four,
    // so the row must offer all four. Drawing fewer is the defect: the
    // unselected steps become unreachable.
    expect(chips(row).map(chip => chip.textContent)).toEqual(['200K', '256K', '400K', '1M'])
  })

  it('leaves every chip clickable while more than one step is in force', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    renderSection(bench().operations)
    const row = await stepfunRow()
    // The whole ladder is in force by default, so turning any step OFF is a
    // legal move and no chip may be disabled. This is the assertion that
    // fails when the chips and the pressed set come from separate sources.
    expect(chips(row).filter(chip => chip.disabled)).toHaveLength(0)
    expect(chips(row).every(chip => chip.getAttribute('aria-pressed') === 'true')).toBe(true)
  })

  it('writes the step a person turns off', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    const b = bench()
    renderSection(b.operations)
    const row = await stepfunRow()
    fireEvent.click(chips(row)[0] as HTMLElement)
    await waitFor(() => expect(b.writes).toHaveLength(1))
    expect(b.writes[0]?.[0]).toEqual({
      op: 'set',
      path: ['modelContexts', 'step-3.7-flash'],
      value: [262144, 409600, 1048576],
    })
  })

  it('disables only the last remaining chip', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    // A single stored step: turning it off would leave the model with no menu
    // entry at all, so this is the one case that must refuse.
    const b = bench({ 'step-3.7-flash': [204800] })
    renderSection(b.operations)
    const row = await stepfunRow()
    const states = chips(row).map(chip => ({ label: chip.textContent, disabled: chip.disabled, on: chip.getAttribute('aria-pressed') }))
    expect(states.filter(chip => chip.on === 'true').map(chip => chip.label)).toEqual(['200K'])
    expect(states.filter(chip => chip.disabled).map(chip => chip.label)).toEqual(['200K'])
  })
})
