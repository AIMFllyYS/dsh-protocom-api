// @vitest-environment jsdom
/**
 * What one toggle costs.
 *
 * The report was that clicking a chip makes the whole page flash. The cause
 * was structural rather than cosmetic: every write finished by re-reading the
 * settings AND every group's credentials, then replacing the page state -- one
 * round trip and a full-subtree re-render, with every control disabled while
 * it ran. These tests measure the cost instead of the pixels.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProtocomSection } from '../src/client/ProtocomSection.tsx'
import { en } from '../src/client/locale.ts'
import { PROTOCOM } from '../src/family.ts'
import type { ProtocomOperations } from '../src/client/operations.ts'

/**
 * A stub whose mutate reply carries the committed Config, the way the Host
 * does, so the component can adopt it without asking again.
 */
function bench() {
  let contexts: Record<string, number[]> = {}
  let describes = 0
  const credentials = vi.fn(async () => ({}))
  const operations: ProtocomOperations = {
    describeSettings: async () => {
      describes += 1
      return { ns: 'protocom-api', revision: describes, writable: true, value: { groups: { stepfun: { enabled: true } }, modelContexts: contexts } } as never
    },
    describeCredentials: credentials,
    storeApiKey: vi.fn(async () => undefined),
    writeSettings: vi.fn(async (ops) => {
      for (const op of ops as { op: string; path: string[]; value?: unknown }[]) {
        if (op.path[0] !== 'modelContexts') continue
        if (op.op === 'unset') delete contexts[op.path[1] as string]
        else contexts = { ...contexts, [op.path[1] as string]: op.value as number[] }
      }
      // Section-shaped, exactly as operations.writeSettings projects it.
      return { kind: 'written', view: { ns: 'protocom-api', revision: describes + 1, writable: true, value: { groups: { stepfun: { enabled: true } }, modelContexts: contexts } } } as never
    }),
    discoverModels: vi.fn(async () => ({ kind: 'found', models: [{ id: 'step-3.7-flash', name: 'step-3.7-flash' }] }) as never),
  }
  return { operations, describes: () => describes, credentials }
}

function renderSection(operations: ProtocomOperations) {
  return render(<ProtocomSection
    operations={operations}
    t={(key) => en[key]}
    family={PROTOCOM}
    copy={{ title: en.title, intro: en.intro }}
  />)
}

/** Expand the StepFun card and run its discovery. */
async function stepfunRow(): Promise<HTMLElement> {
  await screen.findAllByText(en.groupStepfun)
  const cards = [...document.querySelectorAll('.protocom-card')]
  const card = cards.find(c => c.querySelector('.protocom-card-name')?.textContent === en.groupStepfun) as HTMLElement
  fireEvent.click([...card.querySelectorAll('button')].find(b => b.textContent === en.probeRefresh) as HTMLElement)
  await waitFor(() => expect(card.querySelector('.protocom-model-row')).not.toBeNull(), { timeout: 3000 })
  return card.querySelector('.protocom-model-row') as HTMLElement
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('one toggle costs one write (R3)', () => {
  it('does not re-read the settings after a committed write', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    const b = bench()
    renderSection(b.operations)
    const row = await stepfunRow()
    const before = b.describes()
    fireEvent.click(row.querySelector('.protocom-ctx button') as HTMLElement)
    await waitFor(() => expect(b.operations.writeSettings).toHaveBeenCalled())
    // Give any stray reload a chance to land before asserting it did not.
    await new Promise(resolve => setTimeout(resolve, 40))
    expect(b.describes()).toBe(before)
  })

  it('never re-reads credential state, which a settings write cannot change', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    const b = bench()
    renderSection(b.operations)
    const row = await stepfunRow()
    const before = b.credentials.mock.calls.length
    fireEvent.click(row.querySelector('.protocom-ctx button') as HTMLElement)
    await waitFor(() => expect(b.operations.writeSettings).toHaveBeenCalled())
    await new Promise(resolve => setTimeout(resolve, 40))
    expect(b.credentials.mock.calls.length).toBe(before)
  })

  it('still reflects the committed value after the write', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    const b = bench()
    renderSection(b.operations)
    await stepfunRow()
    // Re-query on every read: React replaces the row's DOM when the committed
    // view lands, so a captured node would report the pre-write state forever.
    // Scoped to the StepFun card: `document.querySelector` would return the
    // FIRST row in the DOM, which belongs to the aggregate card and legitimately
    // offers a single step.
    const chips = (): HTMLElement[] => {
      const card = [...document.querySelectorAll('.protocom-card')].find(
        candidate => candidate.querySelector('.protocom-card-name')?.textContent === en.groupStepfun,
      ) as HTMLElement
      const rows = [...card.querySelectorAll('.protocom-model-row')]
      // The uncurated id whose store entry the write targets.
      const row = rows.find(candidate => candidate.textContent?.includes('step-3.7-flash')) as HTMLElement
      return [...row.querySelectorAll('.protocom-ctx button')] as HTMLElement[]
    }
    expect(chips().every(chip => chip.getAttribute('aria-pressed') === 'true')).toBe(true)
    expect(chips().every(chip => !chip.disabled)).toBe(true)
    fireEvent.click(chips()[0] as HTMLElement)
    // The write lands, and the row re-reads from the REPLY rather than from a
    // fresh describe: that is what keeps the write count at one.
    await waitFor(() => expect(b.operations.writeSettings).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(
      chips().filter(chip => chip.getAttribute('aria-pressed') === 'true'),
    ).toHaveLength(3))
    expect(b.describes()).toBe(1)
  })
})
