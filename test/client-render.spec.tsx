// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ProtocomSection } from '../src/client/ProtocomSection.tsx'
import { en } from '../src/client/locale.ts'
import type { ProtocomOperations } from '../src/client/operations.ts'

const VIEW = {
  ns: 'protocom-api',
  revision: 1,
  value: {
    baseURL: 'https://relay.protocom.org',
    groups: { aggregate: { enabled: true, showBalance: true } },
  },
}

function makeOperations(overrides: Partial<ProtocomOperations> = {}): ProtocomOperations {
  return {
    describeSettings: async () => VIEW as never,
    describeCredentials: async () => ({}),
    storeApiKey: vi.fn(async () => undefined),
    writeSettings: vi.fn(async () => ({ kind: 'written', view: VIEW }) as never),
    discoverModels: vi.fn(async () => ({ kind: 'found', models: [] }) as never),
    ...overrides,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function renderSection(operations: ProtocomOperations) {
  return render(<ProtocomSection operations={operations} t={(key) => en[key]} />)
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('balance strip robustness (P2-3)', () => {
  it('does not crash on a malformed balance payload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ remaining: null, expiresAt: 123, balance: 'nope' })))
    renderSection(makeOperations())
    // The malformed fields are dropped, so the strip renders its empty state
    // instead of reaching toFixed/slice on a null and unmounting the page.
    await waitFor(() => expect(screen.getAllByText(en.none).length).toBeGreaterThan(0))
    expect((await screen.findAllByText(en.balance)).length).toBeGreaterThan(0)
  })

  it('reports a fenced (401/403/404) balance route as unavailable rather than a failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unauthorized', { status: 401 })))
    renderSection(makeOperations())
    await waitFor(() => expect(screen.getAllByText(new RegExp(en.balanceUnavailable)).length).toBeGreaterThan(0))
  })

  it('renders third-party balance strings as text, not markup', async () => {
    const hostile = '</b><img src=x onerror=alert(1)>'
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ balance: 1, unit: hostile })))
    const { container } = renderSection(makeOperations())
    await waitFor(() => expect(container.textContent).toContain(hostile))
    expect(container.querySelector('img')).toBeNull()
  })
})

describe('API key draft handling (P2-3)', () => {
  async function typeAndSave(operations: ProtocomOperations, secret: string) {
    const { container } = renderSection(operations)
    const input = await screen.findByLabelText(/PROTOCOM_AGGREGATE_API_KEY/) as HTMLInputElement
    fireEvent.change(input, { target: { value: secret } })
    const card = input.closest('li') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: en.saveKey }))
    return { container, input }
  }

  it('clears the draft after a successful save and never renders the value', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})))
    const storeApiKey = vi.fn(async () => undefined)
    const { container, input } = await typeAndSave(makeOperations({ storeApiKey }), 'sk-super-secret')
    await waitFor(() => expect(input.value).toBe(''))
    expect(container.textContent).not.toContain('sk-super-secret')
    expect(storeApiKey).toHaveBeenCalledOnce()
  })

  it('keeps the draft and never renders the value when the write fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})))
    const { container, input } = await typeAndSave(
      makeOperations({ storeApiKey: vi.fn(async () => 'refused') }),
      'sk-super-secret',
    )
    await waitFor(() => expect(input.value).toBe('sk-super-secret'))
    expect(container.textContent).not.toContain('sk-super-secret')
  })

  it('guards the settings write with the snapshot revision', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})))
    const storeApiKey = vi.fn(async () => undefined)
    await typeAndSave(makeOperations({ storeApiKey }), 'sk-super-secret')
    expect(storeApiKey).toHaveBeenCalledWith('aggregate', 'PROTOCOM_AGGREGATE_API_KEY', 'sk-super-secret', 1)
  })
})

describe('custom endpoint confirmation (F-2)', () => {
  it('writes the confirmation atomically with the base URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})))
    const writeSettings = vi.fn(async () => ({ kind: 'written', view: VIEW }) as never)
    renderSection(makeOperations({ writeSettings }))
    const input = await screen.findByLabelText(en.baseUrl) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'https://evil.example' } })
    fireEvent.click(screen.getByLabelText(en.allowCustom))
    fireEvent.click(screen.getByRole('button', { name: en.apply }))
    await waitFor(() => expect(writeSettings).toHaveBeenCalledOnce())
    const [ops] = writeSettings.mock.calls[0] as [{ op: string; path: string[]; value: unknown }[]]
    expect(ops).toEqual([
      { op: 'set', path: ['allowCustomBaseURL'], value: true },
      { op: 'set', path: ['baseURL'], value: 'https://evil.example' },
    ])
  })

  it('refuses a custom endpoint until the confirmation is ticked', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})))
    const writeSettings = vi.fn(async () => ({ kind: 'written', view: VIEW }) as never)
    renderSection(makeOperations({ writeSettings }))
    const input = await screen.findByLabelText(en.baseUrl) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'https://evil.example' } })
    fireEvent.click(screen.getByRole('button', { name: en.apply }))
    await waitFor(() => expect(screen.getAllByText(en.allowCustomRequired).length).toBeGreaterThan(0))
    expect(writeSettings).not.toHaveBeenCalled()
  })

  it('clears the confirmation when the shipped endpoint is applied', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})))
    const writeSettings = vi.fn(async () => ({ kind: 'written', view: VIEW }) as never)
    renderSection(makeOperations({ writeSettings }))
    const input = await screen.findByLabelText(en.baseUrl) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'https://relay.protocom.org/v1' } })
    fireEvent.click(screen.getByRole('button', { name: en.apply }))
    await waitFor(() => expect(writeSettings).toHaveBeenCalledOnce())
    const [ops] = writeSettings.mock.calls[0] as [{ op: string; path: string[]; value?: unknown }[]]
    expect(ops).toEqual([
      { op: 'unset', path: ['allowCustomBaseURL'] },
      { op: 'set', path: ['baseURL'], value: 'https://relay.protocom.org/v1' },
    ])
  })
})

describe('per-group model editing (issue 1)', () => {
  const TWO_GROUPS = {
    ns: 'protocom-api',
    revision: 2,
    value: {
      baseURL: 'https://relay.protocom.org',
      groups: { aggregate: { enabled: true }, stepfun: { enabled: true } },
    },
  }
  /** The ids the stepfun route lists, including one it refuses to serve. */
  const STEPFUN_LISTING = {
    kind: 'found',
    models: [
      { id: 'step-5-preview', name: 'Step 5 Preview' },
      { id: 'step-3.7-flash' },
      { id: 'stepaudio-2.5-tts' },
    ],
  }

  function listingOperations(overrides: Partial<ProtocomOperations> = {}): ProtocomOperations {
    return makeOperations({
      describeSettings: async () => TWO_GROUPS as never,
      describeCredentials: async () => ({
        PROTOCOM_AGGREGATE_API_KEY: { configured: true, writable: true },
        PROTOCOM_STEPFUN_API_KEY: { configured: true, writable: true },
      }) as never,
      discoverModels: vi.fn(async (request: { provider?: string }) => (request.provider === 'protocom-stepfun'
        ? STEPFUN_LISTING
        : { kind: 'found', models: [{ id: 'kimi-k3', name: 'Kimi K3' }] })) as never,
      ...overrides,
    })
  }

  async function groupCard(name: string): Promise<HTMLElement> {
    return (await screen.findByText(name)).closest('li') as HTMLElement
  }

  /** The bounded list of menu models inside one card. */
  function modelList(card: HTMLElement): HTMLElement {
    return card.querySelector('.protocom-models') as HTMLElement
  }

  it('lists each group its own models, in its own card', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})))
    renderSection(listingOperations())
    const stepfun = await groupCard(en.groupStepfun)
    await waitFor(() => expect(within(modelList(stepfun)).getByText('Step 5 Preview')).toBeTruthy())
    expect(within(modelList(stepfun)).getByText('step-3.7-flash')).toBeTruthy()
    // An id the endpoint refuses to serve is named in the raw table, never as
    // an editable row.
    expect(within(stepfun).queryByLabelText('stepaudio-2.5-tts')).toBeNull()
    // The aggregate card holds only what the aggregate route lists.
    const aggregate = await groupCard(en.groupAggregate)
    await waitFor(() => expect(within(modelList(aggregate)).getByText('Kimi K3')).toBeTruthy())
    expect(within(modelList(aggregate)).queryByText('Step 5 Preview')).toBeNull()
  })

  it('keeps the raw model/upstream-id mapping collapsed by default', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})))
    renderSection(listingOperations())
    const stepfun = await groupCard(en.groupStepfun)
    await waitFor(() => expect(within(modelList(stepfun)).getByText('Step 5 Preview')).toBeTruthy())
    const details = stepfun.querySelector('details') as HTMLDetailsElement
    expect(details.open).toBe(false)
    expect(details.querySelector('summary')?.textContent).toBe(en.probeDetails)
    // Both the name and the id cell carry it for an uncurated model.
    expect(within(details).getAllByText('stepaudio-2.5-tts').length).toBeGreaterThan(0)
  })

  it('hides a model from the group whose row it is', async () => {
    const writeSettings = vi.fn(async () => ({ kind: 'written', view: TWO_GROUPS }) as never)
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})))
    renderSection(listingOperations({ writeSettings }))
    const stepfun = await groupCard(en.groupStepfun)
    await waitFor(() => expect(within(modelList(stepfun)).getByLabelText('step-3.7-flash')).toBeTruthy())
    fireEvent.click(within(modelList(stepfun)).getByLabelText('step-3.7-flash'))
    await waitFor(() => expect(writeSettings).toHaveBeenCalledOnce())
    expect(writeSettings.mock.calls[0]?.[0]).toEqual([
      { op: 'set', path: ['hiddenModels'], value: ['step-3.7-flash'] },
    ])
  })

  it('declares a model text-only from its own row', async () => {
    const writeSettings = vi.fn(async () => ({ kind: 'written', view: TWO_GROUPS }) as never)
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})))
    renderSection(listingOperations({ writeSettings }))
    const stepfun = await groupCard(en.groupStepfun)
    await waitFor(() => expect(within(modelList(stepfun)).getByText('Step 5 Preview')).toBeTruthy())
    const row = within(modelList(stepfun)).getByText('Step 5 Preview').closest('.protocom-model-row') as HTMLElement
    expect(within(row).getByText(en.tagVision)).toBeTruthy()
    fireEvent.click(within(row).getByTitle(en.visionTitle))
    await waitFor(() => expect(writeSettings).toHaveBeenCalledOnce())
    expect(writeSettings.mock.calls[0]?.[0]).toEqual([
      { op: 'set', path: ['visionModels', 'step-5-preview'], value: false },
    ])
  })

  it('keeps the context ladder of the group a model belongs to', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})))
    renderSection(listingOperations())
    const stepfun = await groupCard(en.groupStepfun)
    await waitFor(() => expect(within(modelList(stepfun)).getByText('step-3.7-flash')).toBeTruthy())
    const row = within(modelList(stepfun)).getByText('step-3.7-flash').closest('.protocom-model-row') as HTMLElement
    expect(within(row).getAllByRole('button').map(button => button.textContent))
      .toEqual(['200K', '256K', '400K', '1M', en.tagVision, '★'])
  })

  it('reports the endpoint listing failure without emptying the card', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})))
    renderSection(listingOperations({
      discoverModels: vi.fn(async () => ({ kind: 'refused', message: 'HTTP 401' })) as never,
    }))
    const stepfun = await groupCard(en.groupStepfun)
    await waitFor(() => expect(within(stepfun).getAllByText(new RegExp(en.probeFailed)).length).toBeGreaterThan(0))
    // The registry-tagged model is what keeps the card usable meanwhile.
    expect(within(modelList(stepfun)).getByText('Step 5 Preview')).toBeTruthy()
  })
})
