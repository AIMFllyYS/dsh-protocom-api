// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { FusionSection, costBreakdown } from '../src/client/FusionSection.tsx'
import { en } from '../src/client/locale.ts'
import type {
  FusionCatalog,
  FusionDraft,
  FusionOperations,
  FusionSectionState,
} from '../src/client/fusion-operations.ts'

const CATALOG: FusionCatalog = {
  groups: [
    {
      id: 'opencode-go-sub',
      name: 'OpenCode Go',
      models: [
        {
          id: 'deepseek-v4.1-flash::ctx@1048576',
          name: 'DeepSeek V4.1 Flash [1M]',
          reasoning: { efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }], defaultEffort: 'high' },
        },
      ],
    },
    {
      id: 'protocom-aggregate',
      name: 'Protocom Aggregate',
      models: [
        { id: 'z-ai/glm-5.3-flash::ctx@262144', name: 'GLM 5.3 Flash [256K]', reasoning: { efforts: [{ id: 'low', name: 'Low' }] } },
        { id: 'kimi-k3', name: 'Kimi K3' },
      ],
    },
  ],
  failures: [],
  routableProviders: ['opencode-go-sub', 'protocom-aggregate'],
}

/** A section snapshot with everything the editor reads. */
function stateOf(value: FusionSectionState['value'], revision = 4): FusionSectionState {
  return { status: 'ready', value, revision, writable: true }
}

function makeOperations(overrides: Partial<FusionOperations> & { state?: FusionSectionState } = {}): FusionOperations {
  const { state, ...rest } = overrides
  return {
    loadCatalog: vi.fn(async () => ({ kind: 'found', catalog: CATALOG }) as const),
    section: () => state ?? stateOf({ enabled: false }),
    subscribe: () => () => {},
    saveFusion: vi.fn(async () => ({ kind: 'written' }) as const),
    applyLeader: vi.fn(async () => []),
    ...rest,
  }
}

function renderSection(operations: FusionOperations) {
  return render(<FusionSection
    operations={operations}
    t={(key) => en[key]}
    copy={{ title: en.titleFusion, intro: en.introFusion }}
  />)
}

/** Open the editor and wait for the catalog-backed options to exist. */
async function openEditor(operations: FusionOperations) {
  const utils = renderSection(operations)
  await waitFor(() => expect(screen.queryByText(en.loading)).toBeNull())
  fireEvent.click(screen.getByRole('button', { name: en.configure }))
  return utils
}

afterEach(() => { cleanup() })

describe('Fusion section rendering (T5)', () => {
  it('renders the section heading and intro', async () => {
    renderSection(makeOperations())
    expect(await screen.findByText(en.titleFusion)).toBeTruthy()
    expect(screen.getByText(en.introFusion)).toBeTruthy()
    // The status card names the feature; the page heading already owns the title.
    expect(screen.getByText(en.statusTitle)).toBeTruthy()
  })

  it('shows the stored seats as a summary before the editor opens', async () => {
    const operations = makeOperations({
      state: stateOf({
        enabled: true,
        leader: { provider: 'opencode-go-sub', model: 'deepseek-v4.1-flash::ctx@1048576', reasoningEffort: 'high' },
        coder: { provider: 'protocom-aggregate', model: 'z-ai/glm-5.3-flash::ctx@262144' },
      }),
    })
    renderSection(operations)
    expect(await screen.findByText(new RegExp('deepseek-v4.1-flash::ctx@1048576 \\(high\\)'))).toBeTruthy()
    expect(screen.getByText(en.statusOn)).toBeTruthy()
  })

  it('groups the catalog by provider and offers each context variant as a row', async () => {
    await openEditor(makeOperations())
    const leader = screen.getByLabelText(en.seatLeader) as HTMLSelectElement
    const labels = [...leader.options].map(option => option.textContent)
    expect(labels).toContain('OpenCode Go · DeepSeek V4.1 Flash [1M]')
    expect(labels).toContain('Protocom Aggregate · GLM 5.3 Flash [256K]')
    // The bare-id model is a row of its own, so the picker never merges routes.
    expect(labels).toContain('Protocom Aggregate · Kimi K3')
  })

  it('shows the context badge parsed from the variant id', async () => {
    await openEditor(makeOperations({
      state: stateOf({
        enabled: true,
        leader: { provider: 'protocom-aggregate', model: 'z-ai/glm-5.3-flash::ctx@262144' },
      }),
    }))
    const badge = await screen.findByText(new RegExp(en.contextLabel))
    expect(badge.textContent).toContain('256K')
  })

  it('disables the effort list for a model that declares none', async () => {
    await openEditor(makeOperations({
      state: stateOf({
        enabled: true,
        coder: { provider: 'protocom-aggregate', model: 'kimi-k3' },
      }),
    }))
    const effort = screen.getByLabelText(`${en.seatCoder} ${en.effortLabel}`) as HTMLSelectElement
    expect(effort.disabled).toBe(true)
  })

  it('lists the selected model effort vocabulary with a model-default choice', async () => {
    await openEditor(makeOperations({
      state: stateOf({
        enabled: true,
        leader: { provider: 'opencode-go-sub', model: 'deepseek-v4.1-flash::ctx@1048576' },
      }),
    }))
    const effort = screen.getByLabelText(`${en.seatLeader} ${en.effortLabel}`) as HTMLSelectElement
    const labels = [...effort.options].map(option => option.textContent)
    expect(labels[0]).toContain(en.effortDefault)
    expect(labels).toContain('High')
    expect(labels).toContain('Low')
  })

  it('keeps a seat whose route left the catalog, marked unavailable', async () => {
    await openEditor(makeOperations({
      state: stateOf({
        enabled: true,
        coder: { provider: 'protocom-aggregate', model: 'removed-model' },
      }),
    }))
    expect(screen.getByLabelText(en.seatCoder)).toBeTruthy()
    expect(screen.getByText(en.seatUnavailable)).toBeTruthy()
  })

  it('reports a catalog load failure with a retry control', async () => {
    const operations = makeOperations({
      loadCatalog: vi.fn(async () => ({ kind: 'refused', message: 'provider down' }) as const),
    })
    renderSection(operations)
    expect(await screen.findByText(new RegExp(en.catalogFailed))).toBeTruthy()
    const retry = screen.getByRole('button', { name: en.retry })
    fireEvent.click(retry)
    await waitFor(() => expect(operations.loadCatalog).toHaveBeenCalledTimes(2))
  })

  it('flags a partial provider failure without hiding the good groups', async () => {
    const operations = makeOperations({
      loadCatalog: vi.fn(async () => ({
        kind: 'found',
        catalog: { ...CATALOG, failures: [{ id: 'broken', name: 'Broken', message: 'timeout' }] },
      }) as const),
    })
    await openEditor(operations)
    expect(screen.getByText(en.catalogPartial)).toBeTruthy()
    const leader = screen.getByLabelText(en.seatLeader) as HTMLSelectElement
    expect([...leader.options].some(option => option.textContent?.includes('DeepSeek V4.1 Flash'))).toBe(true)
  })

  it('renders the cost strip, reporting models whose price is unpublished', async () => {
    await openEditor(makeOperations({
      state: stateOf({
        enabled: true,
        leader: { provider: 'opencode-go-sub', model: 'deepseek-v4.1-flash::ctx@1048576' },
        coder: { provider: 'protocom-aggregate', model: 'z-ai/glm-5.3-flash::ctx@262144' },
      }),
    }))
    const strip = screen.getByText(en.costTitle).closest('.protocom-fusion-cost') as HTMLElement
    // No registry entry publishes a price today, so the honest render is the
    // unknown state on both seats rather than a fabricated figure.
    expect(within(strip).getAllByText(en.costUnknown).length).toBe(2)
  })

  it('proportions the cost bar by combined input and output price', () => {
    const { rows, total } = costBreakdown(
      { input: 1, output: 3, cacheRead: 0.1 },
      { input: 1, output: 1 },
    )
    expect(total).toBe(6)
    expect(rows[0]?.share).toBeCloseTo(66.67, 1)
    expect(rows[1]?.share).toBeCloseTo(33.33, 1)
    expect(rows[0]?.share + rows[1]?.share).toBeCloseTo(100, 5)
  })

  it('reports every share as zero when nothing is priced', () => {
    const { rows, total } = costBreakdown(undefined, undefined)
    expect(total).toBe(0)
    expect(rows.map(row => row.share)).toEqual([0, 0])
    expect(rows.every(row => row.pricing === undefined)).toBe(true)
  })
})

describe('Fusion save behavior (T5)', () => {
  it('writes the whole section in one revision-fenced mutation', async () => {
    const saveFusion = vi.fn(async (_draft: FusionDraft, _revision: number | undefined) => ({ kind: 'written' }) as const)
    // A stored pair is already configured, so toggling a switch is a complete
    // draft: the fence and the full-section write are what this asserts.
    const operations = makeOperations({
      saveFusion,
      state: stateOf({
        enabled: true,
        leader: { provider: 'opencode-go-sub', model: 'deepseek-v4.1-flash::ctx@1048576' },
        coder: { provider: 'protocom-aggregate', model: 'z-ai/glm-5.3-flash::ctx@262144' },
        applyLeader: false,
      }, 7),
    })
    await openEditor(operations)
    fireEvent.click(screen.getByLabelText(en.includeForks))
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => expect(saveFusion).toHaveBeenCalledOnce())
    const [draft, revision] = saveFusion.mock.calls[0] as [FusionDraft, number]
    expect(revision).toBe(7)
    expect(draft.enabled).toBe(true)
    expect(draft.includeForks).toBe(false)
    expect(draft.leader).toEqual({ provider: 'opencode-go-sub', model: 'deepseek-v4.1-flash::ctx@1048576' })
  })

  it('refuses to enable with a missing seat instead of writing a half pair', async () => {
    const saveFusion = vi.fn(async () => ({ kind: 'written' }) as const)
    await openEditor(makeOperations({ saveFusion }))
    fireEvent.click(screen.getByLabelText(en.enabled))
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => expect(screen.getByText(en.needBothSeats)).toBeTruthy())
    expect(saveFusion).not.toHaveBeenCalled()
  })

  it('soft-applies the leader seat when saving an enabled pair', async () => {
    const applyLeader = vi.fn(async () => [])
    const operations = makeOperations({
      applyLeader,
      state: stateOf({
        enabled: true,
        leader: { provider: 'opencode-go-sub', model: 'deepseek-v4.1-flash::ctx@1048576', reasoningEffort: 'high' },
        coder: { provider: 'protocom-aggregate', model: 'z-ai/glm-5.3-flash::ctx@262144' },
      }),
    })
    await openEditor(operations)
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => expect(applyLeader).toHaveBeenCalledOnce())
    expect(applyLeader).toHaveBeenCalledWith({
      provider: 'opencode-go-sub',
      model: 'deepseek-v4.1-flash::ctx@1048576',
      reasoningEffort: 'high',
    })
    expect(screen.getByText(en.saved)).toBeTruthy()
  })

  it('does not touch the leader when the operator turned the soft-apply off', async () => {
    const applyLeader = vi.fn(async () => [])
    const operations = makeOperations({
      applyLeader,
      state: stateOf({
        enabled: true,
        leader: { provider: 'opencode-go-sub', model: 'deepseek-v4.1-flash::ctx@1048576' },
        coder: { provider: 'protocom-aggregate', model: 'z-ai/glm-5.3-flash::ctx@262144' },
        applyLeader: false,
      }),
    })
    await openEditor(operations)
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => expect(operations.saveFusion).toHaveBeenCalledOnce())
    expect(applyLeader).not.toHaveBeenCalled()
  })

  it('reports a leader apply failure without pretending the save failed', async () => {
    const operations = makeOperations({
      applyLeader: vi.fn(async () => ['session selectModel refused']),
      state: stateOf({
        enabled: true,
        leader: { provider: 'opencode-go-sub', model: 'deepseek-v4.1-flash::ctx@1048576' },
        coder: { provider: 'protocom-aggregate', model: 'z-ai/glm-5.3-flash::ctx@262144' },
      }),
    })
    await openEditor(operations)
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => expect(screen.getByText(new RegExp(en.savedApplyFailed))).toBeTruthy())
  })

  /** A stored, enabled pair whose only staged change is the fork switch. */
  function configuredOperations(overrides: Partial<FusionOperations> = {}): FusionOperations {
    return makeOperations({
      ...overrides,
      state: stateOf({
        enabled: true,
        leader: { provider: 'opencode-go-sub', model: 'deepseek-v4.1-flash::ctx@1048576' },
        coder: { provider: 'protocom-aggregate', model: 'z-ai/glm-5.3-flash::ctx@262144' },
        applyLeader: false,
      }),
    })
  }

  it('surfaces a revision conflict and leaves the draft open', async () => {
    await openEditor(configuredOperations({
      saveFusion: vi.fn(async () => ({ kind: 'conflict', message: 'moved' }) as const),
    }))
    fireEvent.click(screen.getByLabelText(en.includeForks))
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => expect(screen.getByText(en.conflict)).toBeTruthy())
    // The editor stays open so the operator can compare against the new value.
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('surfaces a validation refusal from the Host', async () => {
    await openEditor(configuredOperations({
      saveFusion: vi.fn(async () => ({ kind: 'refused', message: 'coder route is not registered' }) as const),
    }))
    fireEvent.click(screen.getByLabelText(en.includeForks))
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => expect(screen.getByText(/coder route is not registered/)).toBeTruthy())
  })

  it('clears a seat through the unset choice', async () => {
    const saveFusion = vi.fn(async () => ({ kind: 'written' }) as const)
    const operations = makeOperations({
      saveFusion,
      state: stateOf({
        enabled: false,
        coder: { provider: 'protocom-aggregate', model: 'kimi-k3' },
      }),
    })
    await openEditor(operations)
    const coder = screen.getByLabelText(en.seatCoder) as HTMLSelectElement
    fireEvent.change(coder, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => expect(saveFusion).toHaveBeenCalledOnce())
    const [draft] = saveFusion.mock.calls[0] as [FusionDraft, number]
    expect(draft.coder).toBeUndefined()
  })

  it('drops the staged edits on cancel', async () => {
    const saveFusion = vi.fn(async () => ({ kind: 'written' }) as const)
    await openEditor(configuredOperations({ saveFusion }))
    fireEvent.click(screen.getByLabelText(en.includeForks))
    fireEvent.click(screen.getByRole('button', { name: en.cancel }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(saveFusion).not.toHaveBeenCalled()
  })
})
