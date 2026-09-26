// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AccountView, ProtocomSection } from '../src/client/ProtocomSection.tsx'
import { en } from '../src/client/locale.ts'
import { PROTOCOM } from '../src/family.ts'
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
  return render(<ProtocomSection
    operations={operations}
    t={(key) => en[key]}
    family={PROTOCOM}
    copy={{ title: en.title, intro: en.intro }}
  />)
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
    // The endpoint confirmation and the retry budget share this button and one
    // atomic write, so a rejected number cannot leave a new base URL applied.
    expect(ops).toEqual([
      { op: 'set', path: ['allowCustomBaseURL'], value: true },
      { op: 'set', path: ['baseURL'], value: 'https://evil.example' },
      { op: 'set', path: ['retryMaxAttempts'], value: 20 },
      { op: 'set', path: ['retryMaxDelayMs'], value: 3_600_000 },
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
      { op: 'set', path: ['retryMaxAttempts'], value: 20 },
      { op: 'set', path: ['retryMaxDelayMs'], value: 3_600_000 },
    ])
  })
})

describe('Command Code account strip (R2)', () => {
  const LIVE_VIEW = {
    credits: { reachable: true },
    usage: { reachable: true },
    account: {
      credits: {
        monthlyCredits: 19.8371169506,
        purchasedCredits: 0,
        freeCredits: 0,
        fiveHour: { used: 2.6085937488, cap: 14, remaining: 11.39, percent: 19, exceeded: false, resetAt: 1790427300847 },
        weekly: { used: 32.0923563887, cap: 35, remaining: 2.91, percent: 92, exceeded: false, resetAt: 1790452415913 },
      },
      usage: {
        requests: 5197,
        cost: 50.1628830494,
        successRatePercent: 100,
        tokensIn: 578644478,
        tokensOut: 5416957,
        tokens: 584061435,
      },
    },
  }

  it('renders credits, both windows, and the usage totals', () => {
    const { container } = render(<AccountView view={LIVE_VIEW as never} phase="ready" error={undefined} onRefresh={() => {}} t={(key) => en[key]} />)
    const text = container.textContent ?? ''
    // The monthly figure is a BALANCE, so it renders as an amount.
    expect(text).toContain('$19.84')
    // Both rolling windows carry dollars, not percentages alone.
    expect(text).toContain('$2.61')
    expect(text).toContain('$14.00')
    expect(text).toContain('$32.09')
    expect(text).toContain('$35.00')
    expect(text).toContain('5197')
    expect(text).toContain('100%')
    expect(text).toContain('$50.16')
  })

  it('warns when the credential itself was rejected', () => {
    const { container } = render(<AccountView view={{ ...LIVE_VIEW, credentialRejected: true } as never} phase="ready" error={undefined} onRefresh={() => {}} t={(key) => en[key]} />)
    // This is the one failure an operator can act on, so it is called out.
    expect(container.textContent).toContain(en.accountCredential)
  })

  it('reports a half that could not be read without blanking the other', () => {
    const { container } = render(<AccountView view={{ ...LIVE_VIEW, usage: { reachable: false, error: 'usage endpoint down' } } as never} phase="ready" error={undefined} onRefresh={() => {}} t={(key) => en[key]} />)
    expect(container.textContent).toContain('usage endpoint down')
    // The credits half still rendered.
    expect(container.textContent).toContain('$19.84')
  })

  it('renders nothing numeric while the first read is in flight', () => {
    const { container } = render(<AccountView view={undefined} phase="loading" error={undefined} onRefresh={() => {}} t={(key) => en[key]} />)
    expect(container.textContent).toContain(en.refreshing)
    expect(container.textContent).not.toContain('$')
  })

  it('surfaces a whole-read failure', () => {
    const { container } = render(<AccountView view={undefined} phase="error" error="HTTP 502" onRefresh={() => {}} t={(key) => en[key]} />)
    expect(container.textContent).toContain('HTTP 502')
  })
})

describe('key pool editing (R2)', () => {
  /** The aggregate group card, which every test here edits. */
  async function poolCard(): Promise<HTMLElement> {
    const card = (await screen.findByText(en.groupAggregate)).closest('li') as HTMLElement
    return card
  }

  it('writes the pool as a list of credential references', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})))
    const writeSettings = vi.fn(async () => ({ kind: 'written', view: VIEW }) as never)
    renderSection(makeOperations({ writeSettings }))
    const card = await poolCard()
    const pool = within(card).getByLabelText(en.keyPool) as HTMLTextAreaElement
    fireEvent.change(pool, { target: { value: 'PROTOCOM_A_KEY\n\nPROTOCOM_B_KEY\n' } })
    fireEvent.click(within(card).getByRole('button', { name: en.keyPoolApply }))
    await waitFor(() => expect(writeSettings).toHaveBeenCalledOnce())
    const [ops] = writeSettings.mock.calls[0] as [{ op: string; path: string[]; value?: unknown }[]]
    // Blank lines are dropped rather than stored as empty references.
    expect(ops).toEqual([
      { op: 'set', path: ['groups', 'aggregate', 'apiKeys'], value: ['PROTOCOM_A_KEY', 'PROTOCOM_B_KEY'] },
    ])
  })

  it('clears the pool when every line is removed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})))
    const writeSettings = vi.fn(async () => ({ kind: 'written', view: VIEW }) as never)
    renderSection(makeOperations({ writeSettings }))
    const card = await poolCard()
    const pool = within(card).getByLabelText(en.keyPool) as HTMLTextAreaElement
    fireEvent.change(pool, { target: { value: '   ' } })
    fireEvent.click(within(card).getByRole('button', { name: en.keyPoolApply }))
    await waitFor(() => expect(writeSettings).toHaveBeenCalledOnce())
    const [ops] = writeSettings.mock.calls[0] as [{ op: string; path: string[] }[]]
    // An empty pool is a clear, not an empty array: the field re-inherits.
    expect(ops).toEqual([{ op: 'unset', path: ['groups', 'aggregate', 'apiKeys'] }])
  })

  it('refuses a repeated reference before reaching the Host', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})))
    const writeSettings = vi.fn(async () => ({ kind: 'written', view: VIEW }) as never)
    renderSection(makeOperations({ writeSettings }))
    const card = await poolCard()
    const pool = within(card).getByLabelText(en.keyPool) as HTMLTextAreaElement
    fireEvent.change(pool, { target: { value: 'PROTOCOM_A_KEY\nPROTOCOM_A_KEY' } })
    fireEvent.click(within(card).getByRole('button', { name: en.keyPoolApply }))
    await waitFor(() => expect(within(card).getByText(new RegExp(en.keyPoolDuplicate))).toBeTruthy())
    expect(writeSettings).not.toHaveBeenCalled()
  })

  it('shows the stored policy and writes a change to it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})))
    const writeSettings = vi.fn(async () => ({ kind: 'written', view: VIEW }) as never)
    renderSection(makeOperations({ writeSettings }))
    const card = await poolCard()
    const policy = within(card).getByLabelText(en.keyPolicy) as HTMLSelectElement
    // Sticky is the cache-preserving default and what an unstated field means.
    expect(policy.value).toBe('sticky')
    fireEvent.change(policy, { target: { value: 'round-robin' } })
    await waitFor(() => expect(writeSettings).toHaveBeenCalledOnce())
    const [ops] = writeSettings.mock.calls[0] as [{ op: string; path: string[]; value?: unknown }[]]
    expect(ops).toEqual([
      { op: 'set', path: ['groups', 'aggregate', 'keyPolicy'], value: 'round-robin' },
    ])
  })
})

describe('retry budget editing (R1)', () => {
  /** Open the advanced block, where the retry fields live. */
  function openAdvanced(): void {
    for (const details of document.querySelectorAll('details.protocom-advanced')) {
      ;(details as HTMLDetailsElement).open = true
    }
  }

  it('writes a changed attempt count and wait in the same atomic write', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})))
    const writeSettings = vi.fn(async () => ({ kind: 'written', view: VIEW }) as never)
    renderSection(makeOperations({ writeSettings }))
    openAdvanced()
    const attempts = await screen.findByLabelText(en.retryMaxAttempts) as HTMLInputElement
    const delay = await screen.findByLabelText(en.retryMaxDelayMs) as HTMLInputElement
    // The stored section names no retry fields, so the inputs show the defaults
    // the resolver applies rather than an empty box.
    expect(attempts.value).toBe('20')
    expect(delay.value).toBe('3600000')
    fireEvent.change(attempts, { target: { value: '40' } })
    fireEvent.change(delay, { target: { value: '7200000' } })
    fireEvent.click(screen.getByRole('button', { name: en.apply }))
    await waitFor(() => expect(writeSettings).toHaveBeenCalledOnce())
    const [ops] = writeSettings.mock.calls[0] as [{ op: string; path: string[]; value: unknown }[]]
    expect(ops).toEqual(expect.arrayContaining([
      { op: 'set', path: ['retryMaxAttempts'], value: 40 },
      { op: 'set', path: ['retryMaxDelayMs'], value: 7_200_000 },
    ]))
  })

  it('refuses a non-integer attempt count instead of writing anything', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})))
    const writeSettings = vi.fn(async () => ({ kind: 'written', view: VIEW }) as never)
    renderSection(makeOperations({ writeSettings }))
    openAdvanced()
    const attempts = await screen.findByLabelText(en.retryMaxAttempts) as HTMLInputElement
    fireEvent.change(attempts, { target: { value: '2.5' } })
    fireEvent.click(screen.getByRole('button', { name: en.apply }))
    await waitFor(() => expect(screen.getAllByText(en.retryInvalidAttempts).length).toBeGreaterThan(0))
    expect(writeSettings).not.toHaveBeenCalled()
  })

  it('refuses a wait below the first backoff rung', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})))
    const writeSettings = vi.fn(async () => ({ kind: 'written', view: VIEW }) as never)
    renderSection(makeOperations({ writeSettings }))
    openAdvanced()
    const delay = await screen.findByLabelText(en.retryMaxDelayMs) as HTMLInputElement
    fireEvent.change(delay, { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: en.apply }))
    await waitFor(() => expect(screen.getAllByText(en.retryInvalidDelay).length).toBeGreaterThan(0))
    expect(writeSettings).not.toHaveBeenCalled()
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

  it('shows nothing before a group has been interrogated', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})))
    // A group with no key is never probed, and must not borrow the registry:
    // that is the twenty-eight-row noise this section exists to remove.
    renderSection(makeOperations())
    const grok = await groupCard(en.groupGrok)
    expect(grok.querySelectorAll('.protocom-model-row')).toHaveLength(0)
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
