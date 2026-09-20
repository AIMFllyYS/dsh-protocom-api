/**
 * Protocom API settings section: one card per group (enable switch, API key,
 * read-only protocol tag, model probe with context-variant checkboxes, and
 * the balance strip), plus the advanced baseURL override. Every mutation
 * writes through the wire (settings.mutate / credentials.set); the page
 * reloads its snapshot after each landed write.
 */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { CredentialInfo, LlmDiscoveredModel, SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import { defaultKeyRef, GROUP_DEFAULTS, GROUP_KEYS, providerOf } from '../groups.ts'
import type { GroupKey, Protocol } from '../groups.ts'
import { catalogEntry, contextLabel, DEFAULT_RECOMMENDED, modelIdentities } from '../model-registry.ts'
import type { GroupBalance } from '../balance.ts'
import type { ProtocomOperations } from './operations.ts'
import { toggleLength, variantChoicesFor } from './variants.ts'
import type { en } from './locale.ts'

/** Injected dependencies of {@link ProtocomSection} (slot `inject`). */
export interface ProtocomInjected {
  /** The Host operations the section invokes. */
  operations: ProtocomOperations
  /** Section copy. */
  t: (key: keyof typeof en) => string
}

/**
 * Props delivered by the slot outlet: the inject face spread flat (absent
 * pieces mean the shell has not injected yet, and the section renders null).
 */
export type ProtocomSectionProps = Partial<InjectFace<ProtocomInjected>>

type Translator = (key: keyof typeof en) => string

/** One group's redacted section value (the apiKey literal never rides). */
interface GroupSectionValue {
  enabled?: boolean
  protocol?: Protocol
  contextLengths?: number[]
  showBalance?: boolean
}

/** The plugin's redacted section value. */
interface SectionValue {
  baseURL?: string
  groups?: Record<string, GroupSectionValue>
  hiddenModels?: string[]
  recommendedModels?: string[]
}

interface PageState {
  phase: 'loading' | 'ready' | 'error'
  view?: SettingsNamespaceView
  credentials: Record<string, CredentialInfo>
  error?: string
}

function sectionOf(view: SettingsNamespaceView | undefined): SectionValue {
  const value = view?.value
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as SectionValue : {}
}

function groupValueOf(section: SectionValue, key: GroupKey): Required<GroupSectionValue> {
  const raw = section.groups?.[key] ?? {}
  return {
    enabled: raw.enabled ?? false,
    protocol: raw.protocol ?? GROUP_DEFAULTS[key].protocol,
    contextLengths: raw.contextLengths ?? [],
    showBalance: raw.showBalance ?? true,
  }
}

function formatAmount(value: number, unit: string | undefined): string {
  return unit === 'USD' ? `$${value.toFixed(2)}` : `${value}${unit === undefined ? '' : ` ${unit}`}`
}

/** The balance strip of one group card. */
function BalanceView({ group, balance, phase, error, onRefresh, t }: {
  group: GroupKey
  balance: GroupBalance | undefined
  phase: 'idle' | 'loading' | 'ready' | 'error'
  error: string | undefined
  onRefresh: () => void
  t: Translator
}): ReactNode {
  const items: [string, string][] = []
  const heroQuota = balance !== undefined
    && balance.remaining !== undefined
    && balance.limit !== undefined
    && balance.limit > 0
  if (balance !== undefined) {
    if (!heroQuota) {
      if (balance.remaining !== undefined) items.push([t('remaining'), formatAmount(balance.remaining, balance.unit)])
      if (balance.limit !== undefined) items.push([t('limit'), formatAmount(balance.limit, balance.unit)])
    }
    if (balance.balance !== undefined) items.push([t('balanceAmount'), formatAmount(balance.balance, balance.unit)])
    if (balance.planName !== undefined) items.push([t('plan'), balance.planName])
    if (balance.todayRequests !== undefined || balance.todayCost !== undefined) {
      const parts = [
        balance.todayRequests === undefined ? undefined : `${balance.todayRequests} ${t('requests')}`,
        balance.todayCost === undefined ? undefined : formatAmount(balance.todayCost, balance.unit ?? 'USD'),
      ].filter((part): part is string => part !== undefined)
      items.push([t('today'), parts.join(' · ')])
    }
    if (balance.rpm !== undefined || balance.tpm !== undefined) {
      items.push([t('rateWindow'), `RPM ${balance.rpm ?? t('none')} · TPM ${balance.tpm ?? t('none')}`])
    }
    if (balance.expiresAt !== undefined) items.push([t('expiresAt'), balance.expiresAt.slice(0, 10)])
    if (balance.rateMultiplier !== undefined) items.push([t('rateMultiplier'), `×${balance.rateMultiplier}`])
    if (balance.groupRateMultiplier !== undefined) items.push([t('groupRateMultiplier'), `×${balance.groupRateMultiplier}`])
  }
  void group
  return (
    <div className="protocom-balance">
      <div className="protocom-balance-head">
        <span>{t('balance')}</span>
        <button type="button" className="protocom-button" disabled={phase === 'loading'} onClick={onRefresh}>
          {phase === 'loading' ? t('refreshing') : t('refresh')}
        </button>
      </div>
      {phase === 'error' ? <p className="protocom-error">{`${t('loadFailed')}: ${error ?? ''}`}</p> : null}
      {phase === 'ready' && items.length === 0 && !heroQuota ? <p className="protocom-notice">{t('none')}</p> : null}
      {heroQuota && balance !== undefined ? (
        <div className="protocom-quota">
          <div className="protocom-quota-hero">
            {formatAmount(balance.remaining as number, balance.unit)}
            <small>{`/ ${formatAmount(balance.limit as number, balance.unit)} ${t('limit')}`}</small>
          </div>
          <div className="protocom-quota-bar">
            <div
              className={
                ((balance.limit as number) - (balance.remaining as number)) / (balance.limit as number) > 0.8
                  ? 'protocom-quota-fill is-warn'
                  : 'protocom-quota-fill'
              }
              style={{ width: `${Math.min(100, Math.max(0, (((balance.limit as number) - (balance.remaining as number)) / (balance.limit as number)) * 100))}%` }}
            />
          </div>
        </div>
      ) : null}
      {items.length === 0 ? null : (
        <div className="protocom-balance-grid">
          {items.map(([label, value]) => (
            <span key={label} className="protocom-balance-item">{`${label} `}<b>{value}</b></span>
          ))}
        </div>
      )}
    </div>
  )
}

/** One group's card. */
function GroupCard({ groupKey, group, credential, writable, revision, baseURL, operations, t, onChanged }: {
  groupKey: GroupKey
  group: Required<GroupSectionValue>
  credential: CredentialInfo | undefined
  writable: boolean
  revision: number | undefined
  baseURL: string | undefined
  operations: ProtocomOperations
  t: Translator
  onChanged: () => Promise<void>
}): ReactNode {
  const ref = defaultKeyRef(groupKey)
  const [keyDraft, setKeyDraft] = useState('')
  const [keyBusy, setKeyBusy] = useState(false)
  const [keyMessage, setKeyMessage] = useState<{ kind: 'ok' | 'error'; text: string } | undefined>(undefined)
  const [cardError, setCardError] = useState<string | undefined>(undefined)
  const [probe, setProbe] = useState<
    | { phase: 'idle' }
    | { phase: 'loading' }
    | { phase: 'ready'; models: readonly LlmDiscoveredModel[] }
    | { phase: 'error'; message: string }
  >({ phase: 'idle' })
  const [balance, setBalance] = useState<{
    phase: 'idle' | 'loading' | 'ready' | 'error'
    data: GroupBalance | undefined
    error: string | undefined
  }>({ phase: 'idle', data: undefined, error: undefined })

  const write = async (ops: Parameters<ProtocomOperations['writeSettings']>[0]): Promise<void> => {
    setCardError(undefined)
    const outcome = await operations.writeSettings(ops, revision)
    if (outcome.kind !== 'written') {
      setCardError(outcome.message)
      // A conflict means the card's snapshot is stale: reload so the next
      // toggle rides the current revision instead of wedging on the old one.
      await onChanged()
      return
    }
    await onChanged()
  }

  const loadBalance = async (): Promise<void> => {
    setBalance(previous => ({ ...previous, phase: 'loading', error: undefined }))
    try {
      const response = await fetch(`/api/protocom-api/balance?group=${groupKey}`)
      if (!response.ok) {
        const body = await response.json().catch(() => undefined) as { error?: string } | undefined
        throw new Error(body?.error ?? `HTTP ${response.status}`)
      }
      const data = await response.json() as GroupBalance
      setBalance({ phase: 'ready', data, error: undefined })
    } catch (error: unknown) {
      setBalance({ phase: 'error', data: undefined, error: error instanceof Error ? error.message : String(error) })
    }
  }

  const balanceVisible = group.enabled && group.showBalance
  useEffect(() => {
    if (balanceVisible && balance.phase === 'idle') void loadBalance()
    // Loading once per enablement is the intent; the strip re-reads on Refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balanceVisible])

  const saveKey = (): void => {
    if (keyDraft.length === 0 || keyBusy) return
    setKeyBusy(true)
    setKeyMessage(undefined)
    void operations.storeApiKey(groupKey, ref, keyDraft)
      .then(async (failure) => {
        if (failure !== undefined) {
          setKeyMessage({ kind: 'error', text: failure })
          return
        }
        setKeyDraft('')
        setKeyMessage({ kind: 'ok', text: t('keySaved') })
        await onChanged()
      })
      .finally(() => { setKeyBusy(false) })
  }

  const runProbe = (): void => {
    if (probe.phase === 'loading') return
    setProbe({ phase: 'loading' })
    void operations.discoverModels({
      provider: providerOf(groupKey),
      ...baseURL === undefined ? {} : { baseURL },
    }).then((outcome) => {
      setProbe(outcome.kind === 'found'
        ? { phase: 'ready', models: outcome.models }
        : { phase: 'error', message: outcome.message })
    })
  }

  const credentialConfigured = credential?.configured === true
  return (
    <li className={group.enabled ? 'protocom-card' : 'protocom-card is-off'}>
      <div className="protocom-card-head">
        <span className="protocom-card-name">{t(`group${groupKey.charAt(0).toUpperCase()}${groupKey.slice(1)}` as keyof typeof en)}</span>
        <span className="protocom-tag" title={t('protocol')}>{group.protocol}</span>
        <span className="protocom-head-state">
          <span className={credentialConfigured ? 'protocom-dot is-on' : 'protocom-dot'} />
          {credentialConfigured ? t('keyConfigured') : t('keyMissing')}
          <label className="protocom-switch">
            <input
              type="checkbox"
              role="switch"
              checked={group.enabled}
              disabled={!writable}
              aria-label={t('enabled')}
              onChange={() => { void write([{ op: 'set', path: ['groups', groupKey, 'enabled'], value: !group.enabled }]) }}
            />
            <span className="protocom-switch-track"><span className="protocom-switch-thumb" /></span>
            {t('enabled')}
          </label>
        </span>
      </div>
      <div className="protocom-field">
        <span className="protocom-field-label">{t('apiKey')}</span>
        <input
          type="password"
          className="protocom-input"
          value={keyDraft}
          placeholder={credentialConfigured ? t('keyConfigured') : t('keyPlaceholder')}
          aria-label={`${t('apiKey')} (${ref})`}
          disabled={!writable || credential?.writable === false}
          onChange={event => { setKeyDraft(event.target.value) }}
        />
        <button type="button" className="protocom-button protocom-button-primary" disabled={!writable || keyBusy || keyDraft.length === 0} onClick={saveKey}>
          {keyBusy ? t('savingKey') : t('saveKey')}
        </button>
      </div>
      <span className="protocom-key-state">{credentialConfigured ? `${t('keyConfigured')} (${ref})` : `${t('keyMissing')} (${ref})`}</span>
      {keyMessage === undefined ? null : (
        <p className={keyMessage.kind === 'ok' ? 'protocom-status' : 'protocom-error'}>
          {keyMessage.kind === 'ok' ? keyMessage.text : `${t('keyFailed')}: ${keyMessage.text}`}
        </p>
      )}
      {cardError === undefined ? null : <p className="protocom-error">{cardError}</p>}
      <div className="protocom-field">
        <button type="button" className="protocom-button protocom-button-primary" disabled={probe.phase === 'loading'} onClick={runProbe}>
          {probe.phase === 'loading' ? t('probing') : t('probe')}
        </button>
      </div>
      {probe.phase === 'error' ? <p className="protocom-error">{`${t('probeFailed')}: ${probe.message}`}</p> : null}
      {probe.phase === 'ready' && probe.models.length === 0 ? <p className="protocom-notice">{t('probeEmpty')}</p> : null}
      {probe.phase === 'ready' && probe.models.length > 0
        ? (
          <>
            <table className="protocom-probe-table">
              <thead>
                <tr>
                  <th>{t('colModel')}</th>
                  <th>{t('colId')}</th>
                  <th>{t('colVariants')}</th>
                </tr>
              </thead>
              <tbody>
                {probe.models.map((model) => {
                  const entry = catalogEntry(
                    { id: model.id, ...model.name === undefined ? {} : { displayName: model.name } },
                    GROUP_DEFAULTS[groupKey].reasoning,
                  )
                  return (
                    <tr key={model.id}>
                      <td>{entry.displayName}</td>
                      <td><span className="protocom-probe-id">{model.id}</span></td>
                      <td>
                        {variantChoicesFor(model.id).map(length => (
                          <label
                            key={length}
                            className={group.contextLengths.includes(length) ? 'protocom-chip is-on' : 'protocom-chip'}
                          >
                            <input
                              type="checkbox"
                              checked={group.contextLengths.includes(length)}
                              disabled={!writable}
                              onChange={() => {
                                const next = toggleLength(group.contextLengths, length)
                                void write(next.length === 0
                                  ? [{ op: 'unset', path: ['groups', groupKey, 'contextLengths'] }]
                                  : [{ op: 'set', path: ['groups', groupKey, 'contextLengths'], value: next }])
                              }}
                            />
                            {contextLabel(length)}
                          </label>
                        ))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="protocom-notice">{t('probeHint')}</p>
          </>
        )
        : null}
      {balanceVisible
        ? (
          <BalanceView
            group={groupKey}
            balance={balance.data}
            phase={balance.phase}
            error={balance.error}
            onRefresh={() => { void loadBalance() }}
            t={t}
          />
        )
        : null}
    </li>
  )
}

/**
 * The model-visibility card: every model the registry knows, one toggle each.
 * The catalog is the registry's, not the endpoint listing's, so this list is
 * complete even while the listing is short or unreachable; the switch only
 * removes an entry from the model menu.
 */
function ModelVisibilityCard({ hidden, recommended, writable, revision, operations, t, onChanged }: {
  hidden: readonly string[]
  recommended: readonly string[]
  writable: boolean
  revision: number | undefined
  operations: ProtocomOperations
  t: Translator
  onChanged: () => Promise<void>
}): ReactNode {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const hiddenSet = new Set(hidden)
  // One chip per model identity: the endpoint lists some models under two ids,
  // and hiding either alone would leave the other in the menu.
  const identities = modelIdentities()
  const everyId = identities.flatMap(identity => identity.ids)
  const recommendedSet = new Set(recommended)

  const write = (ops: Parameters<ProtocomOperations['writeSettings']>[0]): void => {
    if (busy) return
    setBusy(true)
    setError(undefined)
    void operations.writeSettings(ops, revision)
      .then(async (outcome) => {
        if (outcome.kind !== 'written') setError(outcome.message)
        await onChanged()
      })
      .finally(() => { setBusy(false) })
  }

  /** Hiding is a set; the empty set is the default, so it is unset rather than stored. */
  const writeHidden = (next: string[]): void => {
    write(next.length === 0
      ? [{ op: 'unset', path: ['hiddenModels'] }]
      : [{ op: 'set', path: ['hiddenModels'], value: next }])
  }

  /**
   * Starring appends, so the order the stars were set is the order the menu
   * leads with; unstarring removes every alias of the model.
   */
  const writeRecommended = (ids: readonly string[], starred: boolean): void => {
    const rest = recommended.filter(id => !ids.includes(id))
    const next = starred ? rest : [...rest, ids[0] as string]
    write(next.length === 0
      ? [{ op: 'unset', path: ['recommendedModels'] }]
      : [{ op: 'set', path: ['recommendedModels'], value: next }])
  }

  return (
    <li className="protocom-card">
      <div className="protocom-card-head">
        <span className="protocom-card-name">{t('models')}</span>
        <span className="protocom-head-state">
          <button
            type="button"
            className="protocom-button"
            disabled={!writable || busy || hidden.length === 0}
            onClick={() => { writeHidden([]) }}
          >
            {t('selectAll')}
          </button>
          <button
            type="button"
            className="protocom-button"
            disabled={!writable || busy || hidden.length >= everyId.length}
            onClick={() => { writeHidden([...everyId]) }}
          >
            {t('selectNone')}
          </button>
        </span>
      </div>
      <p className="protocom-notice">{t('modelsHint')}</p>
      {error === undefined ? null : <p className="protocom-error">{error}</p>}
      <div className="protocom-model-grid">
        {identities.map(({ displayName, ids, entry }) => {
          const shown = ids.every(id => !hiddenSet.has(id))
          const starred = recommendedSet.has(ids[0] as string)
          const meta = [
            contextLabel(entry.contextWindow),
            ...entry.vision === true ? [t('tagVision')] : [],
            ...entry.reasoning === undefined ? [] : [t('tagReasoning')],
          ].join(' · ')
          return (
            <div
              key={displayName}
              className={shown ? 'protocom-model-chip is-on' : 'protocom-model-chip is-off'}
              title={ids.join('\n')}
            >
              <label className="protocom-model-pick">
                <input
                  type="checkbox"
                  checked={shown}
                  disabled={!writable || busy}
                  aria-label={displayName}
                  onChange={() => {
                    const rest = hidden.filter(id => !ids.includes(id))
                    writeHidden(shown ? [...rest, ...ids] : rest)
                  }}
                />
                <span className="protocom-model-dot" />
                <span className="protocom-model-name">{displayName}</span>
                <span className="protocom-model-meta">{meta}</span>
              </label>
              <button
                type="button"
                className={starred ? 'protocom-model-star is-on' : 'protocom-model-star'}
                disabled={!writable || busy}
                aria-pressed={starred}
                title={starred ? t('unstarTitle') : t('starTitle')}
                onClick={() => { writeRecommended(ids, starred) }}
              >
                ★
              </button>
            </div>
          )
        })}
      </div>
    </li>
  )
}

/**
 * Render the Protocom API section content column.
 * @param props - slot-delivered injected dependencies.
 * @returns the section, or null while the shell has not injected yet.
 */
export function ProtocomSection(props: ProtocomSectionProps): ReactNode {
  const { operations, t } = props
  if (operations === undefined || t === undefined) return null
  return <Loaded operations={operations} t={t} />
}

function Loaded({ operations, t }: { operations: ProtocomOperations; t: Translator }): ReactNode {
  const [state, setState] = useState<PageState>({ phase: 'loading', credentials: {} })
  const [baseDraft, setBaseDraft] = useState<string | undefined>(undefined)
  const [baseBusy, setBaseBusy] = useState(false)
  const [baseNotice, setBaseNotice] = useState<{ kind: 'ok' | 'error'; text: string } | undefined>(undefined)

  const load = async (): Promise<void> => {
    const view = await operations.describeSettings()
    if (view === undefined) {
      setState({ phase: 'error', credentials: {}, error: 'settings namespace unavailable' })
      return
    }
    const credentials = await operations.describeCredentials(GROUP_KEYS.map(defaultKeyRef))
    setState({ phase: 'ready', view, credentials })
  }

  useEffect(() => {
    if (state.phase === 'loading') void load()
    // The initial load is the only automatic one; writes reload explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (state.phase === 'loading') return <p className="protocom-notice">{t('loading')}</p>
  if (state.phase === 'error') {
    return (
      <div className="protocom-section">
        <p className="protocom-error">{`${t('loadFailed')}: ${state.error ?? ''}`}</p>
        <button type="button" className="protocom-button" onClick={() => { void load() }}>{t('retry')}</button>
      </div>
    )
  }

  const view = state.view
  const section = sectionOf(view)
  const revision = view?.revision
  const writable = revision !== undefined
  const baseURL = section.baseURL

  const applyBaseURL = (): void => {
    if (baseDraft === undefined || baseBusy) return
    setBaseBusy(true)
    setBaseNotice(undefined)
    void operations.writeSettings([{ op: 'set', path: ['baseURL'], value: baseDraft }], revision)
      .then(async (outcome) => {
        if (outcome.kind !== 'written') {
          setBaseNotice({ kind: 'error', text: outcome.message })
          await load()
          return
        }
        setBaseNotice({ kind: 'ok', text: t('saved') })
        await load()
      })
      .finally(() => { setBaseBusy(false) })
  }

  return (
    <div className="protocom-section">
      <h2 className="protocom-title">{t('title')}</h2>
      <p className="protocom-intro">{t('intro')}</p>
      {writable ? null : <p className="protocom-notice">{t('readOnly')}</p>}
      <ul className="protocom-groups">
        {GROUP_KEYS.map(key => (
          <GroupCard
            key={key}
            groupKey={key}
            group={groupValueOf(section, key)}
            credential={state.credentials[defaultKeyRef(key)]}
            writable={writable}
            revision={revision}
            baseURL={baseURL}
            operations={operations}
            t={t}
            onChanged={load}
          />
        ))}
        <ModelVisibilityCard
          hidden={section.hiddenModels ?? []}
          recommended={section.recommendedModels ?? DEFAULT_RECOMMENDED}
          writable={writable}
          revision={revision}
          operations={operations}
          t={t}
          onChanged={load}
        />
      </ul>
      <details className="protocom-advanced">
        <summary>{t('advanced')}</summary>
        <div className="protocom-advanced-body">
          <span className="protocom-field-label">{t('baseUrl')}</span>
          <input
            type="text"
            className="protocom-input"
            value={baseDraft ?? baseURL ?? ''}
            aria-label={t('baseUrl')}
            disabled={!writable}
            onChange={event => { setBaseDraft(event.target.value) }}
          />
          <button type="button" className="protocom-button" disabled={!writable || baseBusy} onClick={applyBaseURL}>
            {baseBusy ? t('applying') : t('apply')}
          </button>
        </div>
        {baseNotice === undefined ? null : (
          <p className={baseNotice.kind === 'ok' ? 'protocom-status' : 'protocom-error'}>{baseNotice.text}</p>
        )}
      </details>
    </div>
  )
}
