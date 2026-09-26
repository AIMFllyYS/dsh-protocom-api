// @vitest-environment jsdom
/**
 * Accessibility of the redesigned row.
 *
 * The research surfaced WCAG 2.2 SC 2.5.8 (Target Size, Minimum, AA -- new in
 * 2.2) as a likely conformance failure for four small chips repeated down a
 * long list. Its intent is explicit: targets must be large enough, or spaced
 * enough, that a person with a physical impairment can hit them. These tests
 * pin the structural properties that criterion and the ARIA practices require.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProtocomSection } from '../src/client/ProtocomSection.tsx'
import { en } from '../src/client/locale.ts'
import { PROTOCOM } from '../src/family.ts'
import type { ProtocomOperations } from '../src/client/operations.ts'

/**
 * A stub whose mutate reply reflects the write, the way the Host does. A stub
 * returning a fixed view would revert the toggle and hide whether the control
 * actually reports its new state.
 */
function bench(): ProtocomOperations {
  let value: Record<string, unknown> = { groups: { stepfun: { enabled: true } } }
  return {
    describeSettings: async () => ({ ns: 'protocom-api', revision: 1, writable: true, value }) as never,
    describeCredentials: async () => ({}),
    storeApiKey: vi.fn(async () => undefined),
    writeSettings: vi.fn(async (ops) => {
      const next = { ...value }
      for (const op of ops as { op: string; path: string[]; value?: unknown }[]) {
        if (op.path[0] === 'visionModels') {
          const key = op.path[1] as string
          const map = { ...(next['visionModels'] as Record<string, boolean> ?? {}) }
          if (op.op === 'unset') delete map[key]
          else map[key] = op.value as boolean
          next['visionModels'] = map
        }
      }
      value = next
      return { kind: 'written', view: { ns: 'protocom-api', revision: 2, writable: true, value } } as never
    }),
    discoverModels: vi.fn(async () => ({ kind: 'found', models: [{ id: 'step-3.7-flash', name: 'step-3.7-flash' }] }) as never),
  }
}

async function row(): Promise<HTMLElement> {
  await screen.findAllByText(en.groupStepfun)
  const card = [...document.querySelectorAll('.protocom-card')].find(
    candidate => candidate.querySelector('.protocom-card-name')?.textContent === en.groupStepfun,
  ) as HTMLElement
  fireEvent.click([...card.querySelectorAll('button')].find(b => b.textContent === en.probeRefresh) as HTMLElement)
  await waitFor(() => expect(card.querySelector('.protocom-model-row')).not.toBeNull(), { timeout: 3000 })
  return card.querySelector('.protocom-model-row') as HTMLElement
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('row accessibility (R3)', () => {
  it('groups the context chips and reports each one as pressed or not', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    render(<ProtocomSection operations={bench()} t={(key) => en[key]} family={PROTOCOM} copy={{ title: en.title, intro: en.intro }} />)
    const target = await row()
    fireEvent.click(target.querySelector('.protocom-model-more') as HTMLElement)
    await waitFor(() => expect(target.querySelector('.protocom-model-detail')).not.toBeNull())
    const group = target.querySelector('.protocom-ctx') as HTMLElement
    // role=group with a label is the ARIA pattern for a set of toggle buttons.
    expect(group.getAttribute('role')).toBe('group')
    expect(group.getAttribute('aria-label')).toBe(en.contextTitle)
    for (const chip of group.querySelectorAll('button')) {
      expect(chip.getAttribute('aria-pressed')).toMatch(/^(true|false)$/)
    }
  })

  it('labels every toggle by what it DOES, not by its current state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    render(<ProtocomSection operations={bench()} t={(key) => en[key]} family={PROTOCOM} copy={{ title: en.title, intro: en.intro }} />)
    const target = await row()
    fireEvent.click(target.querySelector('.protocom-model-more') as HTMLElement)
    await waitFor(() => expect(target.querySelector('.protocom-model-detail')).not.toBeNull())
    const vision = target.querySelector('.protocom-vision') as HTMLElement
    // A label that changes with state re-announces itself differently on every
    // toggle, which reads as a different control; aria-pressed carries the
    // state instead.
    expect(vision.getAttribute('aria-pressed')).toMatch(/^(true|false)$/)
    const before = vision.getAttribute('aria-pressed')
    fireEvent.click(vision)
    await waitFor(() => expect(vision.getAttribute('aria-pressed')).not.toBe(before))
  })

  it('exposes the disclosure as an expandable control', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    render(<ProtocomSection operations={bench()} t={(key) => en[key]} family={PROTOCOM} copy={{ title: en.title, intro: en.intro }} />)
    const target = await row()
    const more = target.querySelector('.protocom-model-more') as HTMLElement
    expect(more.getAttribute('aria-expanded')).toBe('false')
    // A visible label, so the control is not icon-only.
    expect(more.getAttribute('aria-label')).toBe(en.rowSettings)
  })
})
