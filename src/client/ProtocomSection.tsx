/**
 * Provider settings section — shared by the Protocom and OpenCode Go
 * families: one collapsible card per group. A card carries the group's own
 * enable switch, API key, and — the step that follows saving a key — the
 * exact models that group contributes to the model menu, one control row
 * each for visibility, context lengths, image input, and menu priority. The
 * endpoint's raw listing (model ↔ upstream id) stays behind a collapsed row:
 * it is a diagnostic, not a setting. Every mutation writes through the wire
 * (settings.mutate / credentials.set) scoped to the family's own namespace;
 * the page reloads its snapshot after each landed write.
 */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { CredentialInfo, LlmDiscoveredModel, SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import type { ProviderFamily } from '../family.ts'
import type { Protocol } from '../groups.ts'
import {
  DEFAULT_RETRY_MAX_ATTEMPTS,
  DEFAULT_RETRY_MAX_DELAY_MS,
  MAX_RETRY_ATTEMPTS,
  MAX_RETRY_DELAY_MS,
  RETRY_INITIAL_DELAY_MS,
} from '../retry.ts'
import { variantLengths } from '../context-variants.ts'
import { parseBalanceView } from '../balance-view.ts'
import type { GroupBalance } from '../balance-view.ts'
import { parseGoUsage } from '../usage-view.ts'
import type { GoQuotaWindow, GoUsageView } from '../usage-view.ts'
import { parseCommandCodeAccountView } from '../commandcode-view.ts'
import type { CommandCodeAccountView } from '../commandcode-view.ts'
import {
  CONTEXT_LADDER,
  contextLabel,
  groupCatalog,
  identityKey,
  matchRegistry,
  servesChat,
} from '../model-registry.ts'
import type { GroupCatalogModel, UpstreamModel } from '../model-registry.ts'
import { PROTOCOM_ENTRY_ID } from './operations.ts'
import type { ProtocomOperations } from './operations.ts'
import type { en } from './locale.ts'

/** Injected dependencies of {`link ProviderSection} (slot `inject`). */
export interface ProtocomInjected {
  /** The Host operations the section invokes, scoped to the family. */
  operations: ProtocomOperations
  /** Section copy. */
  t: (key: keyof typeof en) => string
  /** Which provider family this section instance serves. */
  family: ProviderFamily
  /** The family's heading copy, resolved through `t` at inject time. */
  copy: { title: string; intro: string }
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
  /** Extra credential references forming this group's key pool. */
  apiKeys?: string[]
  /** How the pool picks a key: `sticky` (cache-warm) or `round-robin`. */
  keyPolicy?: string
}

/** The plugin's redacted section value. */
interface SectionValue {
  baseURL?: string
  allowCustomBaseURL?: boolean
  retryMaxAttempts?: number
  retryMaxDelayMs?: number
  groups?: Record<string, GroupSectionValue>
  hiddenModels?: string[]
  recommendedModels?: string[]
  modelContexts?: Record<string, number[]>
  visionModels?: Record<string, boolean>
}

interface PageState {
  phase: 'loading' | 'ready' | 'error'
  view?: SettingsNamespaceView
  credentials: Record<string, CredentialInfo>
  error?: string
}

/** One group's interrogation of its own endpoint listing. */
type ProbeState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; models: readonly LlmDiscoveredModel[] }
  | { phase: 'error'; message: string }

function sectionOf(view: SettingsNamespaceView | undefined): SectionValue {
  const value = view?.value
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as SectionValue : {}
}

function groupValueOf(section: SectionValue, key: string, family: ProviderFamily): Required<GroupSectionValue> {
  const raw = section.groups?.[key] ?? {}
  const defaults = family.defaults[key]
  return {
    enabled: raw.enabled ?? false,
    protocol: raw.protocol ?? defaults?.protocol ?? 'chat-completions',
    // The card shows the effective lengths, so a group that ships a ladder
    // (StepFun) reads as configured before the deployment stores its own. A
    // normalized empty array means unset, matching the adapter's resolution.
    contextLengths: raw.contextLengths?.length ? raw.contextLengths : [...defaults?.contextLengths ?? []],
    showBalance: raw.showBalance ?? true,
    apiKeys: raw.apiKeys ?? [],
    keyPolicy: raw.keyPolicy ?? 'sticky',
  }
}

function formatAmount(value: number, unit: string | undefined): string {
  return unit === 'USD' ? `$${value.toFixed(2)}` : `${value}${unit === undefined ? '' : ` ${unit}`}`
}

/** The quota strip of a Go group card: the subscription's three rate windows. */
export function QuotaView({ usage, phase, error, onRefresh, t }: {
  usage: GoUsageView | undefined
  phase: 'idle' | 'loading' | 'ready' | 'error'
  error: string | undefined
  onRefresh: () => void
  t: Translator
}): ReactNode {
  const windows: [string, GoQuotaWindow | undefined][] = [
    [t('quotaRolling'), usage?.rolling],
    [t('quotaWeekly'), usage?.weekly],
    [t('quotaMonthly'), usage?.monthly],
  ]
  const rows = windows.filter((pair): pair is [string, GoQuotaWindow] => pair[1] !== undefined)
  return (
    <div className="protocom-balance">
      <div className="protocom-balance-head">
        <span>{t('usageQuota')}</span>
        <button type="button" className="protocom-button" disabled={phase === 'loading'} onClick={onRefresh}>
          {phase === 'loading' ? t('refreshing') : t('refresh')}
        </button>
      </div>
      {phase === 'error' ? <p className="protocom-error">{`${t('loadFailed')}: ${error ?? ''}`}</p> : null}
      {phase === 'ready' && rows.length === 0 ? <p className="protocom-notice">{t('none')}</p> : null}
      {rows.map(([label, window]) => {
        const percent = window.percent ?? 0
        const limited = window.status === 'rate-limited'
        return (
          <div key={label} className="protocom-quota-row">
            <span className="protocom-quota-label">{label}</span>
            <span className="protocom-quota-bar">
              <span
                className={limited || percent > 80 ? 'protocom-quota-fill is-warn' : 'protocom-quota-fill'}
                style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
              />
            </span>
            <span className="protocom-quota-num">
              {`${percent}%`}
              <small>{limited ? t('quotaRateLimited') : (window.resetsAt === undefined ? '' : `${t('quotaResets')} ${window.resetsAt.slice(0, 10)}`)}</small>
            </span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * The Command Code account strip: remaining credits, the two rolling dollar
 * windows, and the period's usage totals.
 *
 * Every figure is a dollar amount or a count the endpoint actually stated. The
 * monthly number is a BALANCE whose pool size is never published, so it renders
 * as an amount rather than being forced into a percentage.
 */
export function AccountView({ view, phase, error, onRefresh, t }: {
  view: CommandCodeAccountView | undefined
  phase: 'idle' | 'loading' | 'ready' | 'error'
  error: string | undefined
  onRefresh: () => void
  t: Translator
}): ReactNode {
  const credits = view?.account?.credits
  const usage = view?.account?.usage
  const money = (value: number | undefined): string => (value === undefined ? t('none') : '$' + value.toFixed(2))
  const windowRow = (label: string, window: { used: number; cap: number; percent: number; exceeded: boolean; resetAt?: number } | undefined) => (
    <div className="protocom-quota-row" key={label}>
      <span className="protocom-quota-label">{label}</span>
      <div className="protocom-quota-bar">
        <div
          className={window !== undefined && window.exceeded ? 'protocom-quota-fill is-warn' : 'protocom-quota-fill'}
          style={{ width: (window?.percent ?? 0) + '%' }}
        />
      </div>
      <span className="protocom-quota-num">
        {window === undefined ? t('none') : money(window.used) + ' ' + t('accountUsedOfCap') + ' ' + money(window.cap)}
        {window?.resetAt === undefined ? null : <small>{t('accountResets') + ' ' + new Date(window.resetAt).toLocaleString()}</small>}
      </span>
    </div>
  )
  return (
    <div className="protocom-balance">
      <div className="protocom-balance-head">
        <span>{t('accountCredits')}</span>
        <button type="button" className="protocom-button" disabled={phase === 'loading'} onClick={onRefresh}>
          {phase === 'loading' ? t('refreshing') : t('refresh')}
        </button>
      </div>
      {view?.credentialRejected === true ? <p className="protocom-error">{t('accountCredential')}</p> : null}
      {phase === 'error' ? <p className="protocom-error">{error ?? t('loadFailed')}</p> : null}
      {phase !== 'error' && view !== undefined && !view.credits.reachable
        ? <p className="protocom-notice">{view.credits.error ?? t('accountUnavailable')}</p>
        : null}
      {credits === undefined
        ? null
        : (
          <div className="protocom-quota">
            <div className="protocom-balance-grid">
              <span className="protocom-balance-item">
                {t('accountMonthly') + ' '}
                <b>{money(credits.monthlyCredits)}</b>
              </span>
              {credits.purchasedCredits === undefined || credits.purchasedCredits === 0
                ? null
                : (
                  <span className="protocom-balance-item">
                    {t('balance') + ' '}
                    <b>{money(credits.purchasedCredits)}</b>
                  </span>
                )}
            </div>
            {windowRow(t('accountFiveHour'), credits.fiveHour)}
            {windowRow(t('accountWeekly'), credits.weekly)}
          </div>
        )}
      {view !== undefined && !view.usage.reachable
        ? <p className="protocom-notice">{view.usage.error ?? t('accountUnavailable')}</p>
        : null}
      {usage === undefined
        ? null
        : (
          <div className="protocom-quota">
            <span className="protocom-balance-item">{t('accountUsage')}</span>
            <div className="protocom-balance-grid">
              <span className="protocom-balance-item">{t('accountRequests') + ' '}<b>{usage.requests ?? t('none')}</b></span>
              <span className="protocom-balance-item">
                {t('accountSuccessRate') + ' '}
                <b>{usage.successRatePercent === undefined ? t('none') : usage.successRatePercent + '%'}</b>
              </span>
              <span className="protocom-balance-item">{t('accountCost') + ' '}<b>{money(usage.cost)}</b></span>
              <span className="protocom-balance-item">
                {t('accountTokens') + ' '}
                <b>{usage.tokens ?? (usage.tokensIn ?? 0) + ' / ' + (usage.tokensOut ?? 0)}</b>
              </span>
            </div>
          </div>
        )}
    </div>
  )
}

/** The balance strip of one group card. */
export function BalanceView({ group, balance, phase, error, onRefresh, t }: {
  group: string
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

/** How many rows a group may hold before its list offers a filter box. */
const FILTER_THRESHOLD = 8

/** One model's control row inside its group's card. */
function ModelRow({ model, group, family, hidden, recommended, contexts, vision, writable, busy, t, onWrite }: {
  model: GroupCatalogModel
  group: Required<GroupSectionValue>
  family: ProviderFamily
  hidden: readonly string[]
  recommended: readonly string[]
  contexts: Readonly<Record<string, number[]>>
  vision: Readonly<Record<string, boolean>>
  writable: boolean
  busy: boolean
  t: Translator
  onWrite: (ops: Parameters<ProtocomOperations['writeSettings']>[0]) => void
}): ReactNode {
  const key = identityKey(model.upstreamId, family.registry)
  const hiddenSet = new Set(hidden)
  const shown = model.ids.every(id => !hiddenSet.has(id))
  const starred = recommended.includes(key)
  // The lengths this model offers when nothing is stored: the group's own
  // ladder narrowed to the model's window, or its full window when the group
  // ships no ladder. Exactly what the adapter advertises, so the row and the
  // menu cannot disagree.
  const fallback = variantLengths(model.contextOptions, group.contextLengths) ?? [model.contextWindow]
  const stored = contexts[key]
  const selected = (stored ?? fallback).filter(length => length <= model.contextWindow)
  const chosen = selected.length > 0 ? selected : fallback
  const ladder = model.contextOptions ?? CONTEXT_LADDER
  const images = vision[key] ?? model.vision
  const meta = [
    ...model.reasoning === undefined ? [] : [t('tagReasoning')],
  ].join(' · ')

  const toggleShown = (): void => {
    const rest = hidden.filter(id => !model.ids.includes(id))
    const next = shown ? [...rest, ...model.ids] : rest
    onWrite(next.length === 0
      ? [{ op: 'unset', path: ['hiddenModels'] }]
      : [{ op: 'set', path: ['hiddenModels'], value: next }])
  }

  const writeContexts = (next: number[]): void => {
    const isDefault = next.length === fallback.length && next.every((length, index) => length === fallback[index])
    onWrite(isDefault
      ? [{ op: 'unset', path: ['modelContexts', key] }]
      : [{ op: 'set', path: ['modelContexts', key], value: next }])
  }

  const toggleVision = (): void => {
    // On is the permissive default, so unsetting is how a model goes back to
    // "whatever the endpoint does"; off is the explicit text-only verdict.
    onWrite(images
      ? [{ op: 'set', path: ['visionModels', key], value: false }]
      : [{ op: 'unset', path: ['visionModels', key] }])
  }

  const toggleStar = (): void => {
    const rest = recommended.filter(id => id !== key)
    const next = starred ? rest : [...rest, key]
    onWrite(next.length === 0
      ? [{ op: 'unset', path: ['recommendedModels'] }]
      : [{ op: 'set', path: ['recommendedModels'], value: next }])
  }

  return (
    <div
      className={shown ? 'protocom-model-row' : 'protocom-model-row is-off'}
      title={model.ids.join('\n')}
    >
      <label className="protocom-model-pick">
        <input
          type="checkbox"
          checked={shown}
          disabled={!writable || busy}
          aria-label={model.displayName}
          onChange={toggleShown}
        />
        <span className="protocom-model-dot" />
        <span className="protocom-model-name">{model.displayName}</span>
      </label>
      {meta.length === 0 ? null : <span className="protocom-model-meta">{meta}</span>}
      <span className="protocom-model-spacer" />
      {/* The ladder stays visible while a model is listed so its context set
          reads as one control, not a hidden setting. */}
      {shown
        ? (
          <span className="protocom-ctx" role="group" aria-label={t('contextTitle')}>
            {ladder.map((length) => {
              const on = chosen.includes(length)
              const last = on && chosen.length === 1
              return (
                <button
                  key={length}
                  type="button"
                  className={on ? 'is-on' : undefined}
                  aria-pressed={on}
                  disabled={!writable || busy || last}
                  title={last ? t('contextLastTitle') : t('contextTitle')}
                  onClick={() => {
                    writeContexts(on
                      ? chosen.filter(value => value !== length)
                      : [...chosen, length].sort((left, right) => left - right))
                  }}
                >
                  {contextLabel(length)}
                </button>
              )
            })}
          </span>
        )
        : null}
      <button
        type="button"
        className={images ? 'protocom-vision is-on' : 'protocom-vision'}
        disabled={!writable || busy}
        aria-pressed={images}
        title={t('visionTitle')}
        onClick={toggleVision}
      >
        {images ? t('tagVision') : t('visionOff')}
      </button>
      <button
        type="button"
        className={starred ? 'protocom-model-star is-on' : 'protocom-model-star'}
        disabled={!writable || busy}
        aria-pressed={starred}
        title={starred ? t('unstarTitle') : t('starTitle')}
        onClick={toggleStar}
      >
        ★
      </button>
    </div>
  )
}

/** One group's card: credentials, its own menu models, and its balance. */
function GroupCard({ groupKey, group, family, credential, writable, revision, probe, hidden, recommended, contexts, vision, operations, t, onChanged, onProbe }: {
  groupKey: string
  group: Required<GroupSectionValue>
  family: ProviderFamily
  credential: CredentialInfo | undefined
  writable: boolean
  revision: number | undefined
  probe: ProbeState
  hidden: readonly string[]
  recommended: readonly string[]
  contexts: Readonly<Record<string, number[]>>
  vision: Readonly<Record<string, boolean>>
  operations: ProtocomOperations
  t: Translator
  onChanged: () => Promise<void>
  onProbe: () => void
}): ReactNode {
  const ref = family.keyRef(groupKey)
  const [keyDraft, setKeyDraft] = useState('')
  const [keyBusy, setKeyBusy] = useState(false)
  const [keyMessage, setKeyMessage] = useState<{ kind: 'ok' | 'error'; text: string } | undefined>(undefined)
  const [poolDraft, setPoolDraft] = useState<string | undefined>(undefined)
  const [poolNotice, setPoolNotice] = useState<{ kind: 'ok' | 'error'; text: string } | undefined>(undefined)
  /** The pool as the settings document states it; the draft wins while editing. */
  const [cardError, setCardError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(true)
  const [filter, setFilter] = useState('')
  const [balance, setBalance] = useState<{
    phase: 'idle' | 'loading' | 'ready' | 'error'
    data: GroupBalance | GoUsageView | CommandCodeAccountView | undefined
    error: string | undefined
  }>({ phase: 'idle', data: undefined, error: undefined })

  /**
   * Commit the pool textarea. Blank lines are dropped rather than stored as
   * empty references, and a repeat is refused locally so the operator sees
   * which line is at fault instead of a Host-level message about the group.
   */
  const savePool = (): void => {
    if (poolDraft === undefined) return
    const entries = poolDraft.split('\n').map(line => line.trim()).filter(line => line.length > 0)
    const seen = new Set<string>()
    for (const entry of entries) {
      if (seen.has(entry)) {
        setPoolNotice({ kind: 'error', text: `${t('keyPoolDuplicate')} ${entry}` })
        return
      }
      seen.add(entry)
    }
    setPoolNotice(undefined)
    setPoolDraft(undefined)
    write(entries.length === 0
      ? [{ op: 'unset', path: ['groups', groupKey, 'apiKeys'] }]
      : [{ op: 'set', path: ['groups', groupKey, 'apiKeys'], value: entries }])
  }

  const write = (ops: Parameters<ProtocomOperations['writeSettings']>[0]): void => {
    setCardError(undefined)
    setBusy(true)
    void operations.writeSettings(ops, revision)
      .then(async (outcome) => {
        if (outcome.kind !== 'written') {
          setCardError(outcome.message)
          // A conflict means the card's snapshot is stale: reload so the next
          // toggle rides the current revision instead of wedging on the old one.
        }
        await onChanged()
      })
      .finally(() => { setBusy(false) })
  }

  const loadBalance = async (): Promise<void> => {
    setBalance(previous => ({ ...previous, phase: 'loading', error: undefined }))
    try {
      const response = await fetch(`${family.telemetryPath}?group=${groupKey}`)
      // The route is fenced by the Host carrier, so an unauthenticated request
      // or a profile without the connection service answers 401/403/404. That
      // is "no account surface here", not a failure worth a red message.
      const unavailable = family.telemetryKind === 'quota'
        ? t('quotaUnavailable')
        : family.telemetryKind === 'account'
          ? t('accountUnavailable')
          : t('balanceUnavailable')
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        setBalance({ phase: 'error', data: undefined, error: unavailable })
        return
      }
      if (!response.ok) {
        const body = await response.json().catch(() => undefined) as { error?: string } | undefined
        throw new Error(typeof body?.error === 'string' ? body.error : `HTTP ${response.status}`)
      }
      // The body is a trust boundary: re-validate rather than asserting, so a
      // malformed reply cannot reach toFixed/slice and crash the strip.
      const raw: unknown = await response.json()
      const data = family.telemetryKind === 'quota'
        ? parseGoUsage(raw)
        : family.telemetryKind === 'account'
          ? parseCommandCodeAccountView(raw)
          : parseBalanceView(raw)
      if (data === undefined) throw new Error(unavailable)
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
    void operations.storeApiKey(groupKey, ref, keyDraft, revision)
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

  const credentialConfigured = credential?.configured === true
  const listing = probe.phase === 'ready' ? probe.models : undefined
  // The group's own menu, projected exactly as the adapter projects it, so the
  // rows below are the entries the picker will show. Hidden ids stay in the
  // list — that is how one gets un-hidden — and the recommendation orders it.
  const rows = groupCatalog(
    groupKey,
    listing?.map((model): UpstreamModel => ({
      id: model.id,
      ...model.name === undefined ? {} : { displayName: model.name },
    })),
    {
      recommended,
      family,
      // Only once the group has actually been interrogated: an unprobed group
      // must not present every other group's models as its own menu.
      registryFallback: probe.phase === 'ready' || probe.phase === 'error',
    },
  )
  const needle = filter.trim().toLowerCase()
  const visibleRows = needle.length === 0
    ? rows
    : rows.filter(row => row.displayName.toLowerCase().includes(needle) || row.ids.some(id => id.toLowerCase().includes(needle)))
  const groupIds = rows.flatMap(row => [...row.ids])
  const hiddenInGroup = groupIds.filter(id => hidden.includes(id))
  const entryCount = visibleRows.reduce((total, row) => {
    const stored = contexts[identityKey(row.upstreamId, family.registry)]
    const lengths = stored ?? variantLengths(row.contextOptions, group.contextLengths) ?? [row.contextWindow]
    return total + Math.max(1, lengths.length)
  }, 0)

  return (
    <li className={group.enabled ? 'protocom-card' : 'protocom-card is-off'}>
      <div className="protocom-card-head">
        <button
          type="button"
          className="protocom-card-toggle"
          aria-expanded={open}
          title={open ? t('collapse') : t('expand')}
          onClick={() => { setOpen(!open) }}
        >
          <span className="protocom-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
          <span className="protocom-card-name">{t(`group${groupKey.charAt(0).toUpperCase()}${groupKey.slice(1)}` as keyof typeof en)}</span>
        </button>
        <span className="protocom-tag" title={t('protocol')}>{group.protocol}</span>
        <span className="protocom-head-state">
          <span className={credentialConfigured ? 'protocom-dot is-on' : 'protocom-dot'} />
          {credentialConfigured ? t('keyConfigured') : t('keyMissing')}
          <label className="protocom-switch">
            <input
              type="checkbox"
              role="switch"
              checked={group.enabled}
              disabled={!writable || busy}
              aria-label={t('enabled')}
              onChange={() => { write([{ op: 'set', path: ['groups', groupKey, 'enabled'], value: !group.enabled }]) }}
            />
            <span className="protocom-switch-track"><span className="protocom-switch-thumb" /></span>
            {t('enabled')}
          </label>
        </span>
      </div>
      {open
        ? (
          <div className="protocom-card-body">
            <div className="protocom-field">
              <span className="protocom-field-label">{t('apiKey')}</span>
              <input
                type="password"
                className="protocom-input"
                value={keyDraft}
                placeholder={credentialConfigured ? t('keyConfigured') : t('keyPlaceholder')}
                aria-label={`${t('apiKey')} (${ref})`}
                disabled={!writable || credential?.writable === false}
                autoComplete="new-password"
                spellCheck={false}
                onChange={event => { setKeyDraft(event.target.value) }}
              />
              <button type="button" className="protocom-button protocom-button-primary" disabled={!writable || keyBusy || keyDraft.length === 0} onClick={saveKey}>
                {keyBusy ? t('savingKey') : t('saveKey')}
              </button>
            </div>
            <span className="protocom-key-state">{credentialConfigured ? `${t('keyConfigured')} (${ref})` : `${t('keyMissing')} (${ref})`}</span>
            {/* The pool is a list of credential REFERENCES, not secrets: the
                values are stored through the same credential seam as the
                primary key, so nothing secret rides the settings document. */}
            <div className="protocom-field">
              <span className="protocom-field-label">{t('keyPool')}</span>
              <textarea
                className="protocom-input protocom-keypool"
                rows={Math.max(2, (group.apiKeys?.length ?? 0) + 1)}
                value={poolDraft ?? (group.apiKeys ?? []).join('\n')}
                placeholder={t('keyPoolPlaceholder')}
                aria-label={t('keyPool')}
                disabled={!writable || busy}
                spellCheck={false}
                onChange={event => { setPoolDraft(event.target.value) }}
              />
              <button
                type="button"
                className="protocom-button"
                disabled={!writable || busy || poolDraft === undefined}
                onClick={savePool}
              >
                {t('keyPoolApply')}
              </button>
            </div>
            <p className="protocom-notice">{t('keyPoolHint')}</p>
            <div className="protocom-field">
              <span className="protocom-field-label">{t('keyPolicy')}</span>
              <select
                className="protocom-input"
                aria-label={t('keyPolicy')}
                value={group.keyPolicy ?? 'sticky'}
                disabled={!writable || busy}
                onChange={event => {
                  write([{ op: 'set', path: ['groups', groupKey, 'keyPolicy'], value: event.target.value }])
                }}
              >
                <option value="sticky">{t('keyPolicySticky')}</option>
                <option value="round-robin">{t('keyPolicyRoundRobin')}</option>
              </select>
            </div>
            {poolNotice === undefined ? null : (
              <p className={poolNotice.kind === 'ok' ? 'protocom-status' : 'protocom-error'}>{poolNotice.text}</p>
            )}
            {keyMessage === undefined ? null : (
              <p className={keyMessage.kind === 'ok' ? 'protocom-status' : 'protocom-error'}>
                {keyMessage.kind === 'ok' ? keyMessage.text : `${t('keyFailed')}: ${keyMessage.text}`}
              </p>
            )}
            {cardError === undefined ? null : <p className="protocom-error">{cardError}</p>}
            <div className="protocom-models-head">
              <span className="protocom-models-title">{t('models')}</span>
              <span className="protocom-models-count">
                {rows.length === 0
                  ? ''
                  : `${rows.length} ${t('modelCount')} · ${entryCount} ${t('menuEntries')}`}
              </span>
              <span className="protocom-model-spacer" />
              <button
                type="button"
                className="protocom-button"
                disabled={probe.phase === 'loading' || !writable}
                onClick={onProbe}
              >
                {probe.phase === 'loading' ? t('probing') : t('probeRefresh')}
              </button>
              <button
                type="button"
                className="protocom-button"
                disabled={!writable || busy || hiddenInGroup.length === 0}
                onClick={() => {
                  const next = hidden.filter(id => !groupIds.includes(id))
                  write(next.length === 0
                    ? [{ op: 'unset', path: ['hiddenModels'] }]
                    : [{ op: 'set', path: ['hiddenModels'], value: next }])
                }}
              >
                {t('selectAll')}
              </button>
              <button
                type="button"
                className="protocom-button"
                disabled={!writable || busy || hiddenInGroup.length >= groupIds.length}
                onClick={() => { write([{ op: 'set', path: ['hiddenModels'], value: [...new Set([...hidden, ...groupIds])] }]) }}
              >
                {t('selectNone')}
              </button>
            </div>
            <p className="protocom-notice">{t('modelsHint')}</p>
            {probe.phase === 'error' ? (
              <p className="protocom-error">{`${t('probeFailed')}: ${probe.message}`}</p>
            ) : null}
            {probe.phase === 'ready' && probe.models.length === 0 ? <p className="protocom-notice">{t('probeEmpty')}</p> : null}
            {probe.phase !== 'ready' && !credentialConfigured ? <p className="protocom-notice">{t('probeNeedsKey')}</p> : null}
            {probe.phase === 'error' ? <p className="protocom-notice">{t('listingFallback')}</p> : null}
            {rows.length > FILTER_THRESHOLD
              ? (
                <input
                  type="text"
                  className="protocom-input"
                  value={filter}
                  placeholder={t('filterModels')}
                  aria-label={t('filterModels')}
                  onChange={event => { setFilter(event.target.value) }}
                />
              )
              : null}
            <div className="protocom-models">
              {visibleRows.map(row => (
                <ModelRow
                  key={row.displayName}
                  model={row}
                  group={group}
                  family={family}
                  hidden={hidden}
                  recommended={recommended}
                  contexts={contexts}
                  vision={vision}
                  writable={writable}
                  busy={busy}
                  t={t}
                  onWrite={write}
                />
              ))}
            </div>
            <details className="protocom-advanced">
              <summary>{t('probeDetails')}</summary>
              <div className="protocom-advanced-body">
                {probe.phase === 'ready' && probe.models.length > 0
                  ? (
                    <table className="protocom-probe-table">
                      <thead>
                        <tr>
                          <th>{t('colModel')}</th>
                          <th>{t('colId')}</th>
                          <th>{t('colServed')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {probe.models.map((model) => (
                          <tr key={model.id}>
                            {/* The raw mapping, so a name the menu shows can
                                always be traced back to the id on the wire. */}
                            <td>{matchRegistry(model.id, family.registry)?.displayName
                              ?? (model.name !== undefined && model.name !== model.id ? model.name : model.id)}</td>
                            <td><span className="protocom-probe-id">{model.id}</span></td>
                            <td>{servesChat(model.id, family.refused) ? t('servedYes') : t('servedNo')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                  : <p className="protocom-notice">{t('probeHint')}</p>}
              </div>
            </details>
            {balanceVisible
              ? family.telemetryKind === 'quota'
                ? (
                  <QuotaView
                    usage={balance.data as GoUsageView | undefined}
                    phase={balance.phase}
                    error={balance.error}
                    onRefresh={() => { void loadBalance() }}
                    t={t}
                  />
                )
                : family.telemetryKind === 'account'
                  ? (
                    <AccountView
                      view={balance.data as CommandCodeAccountView | undefined}
                      phase={balance.phase}
                      error={balance.error}
                      onRefresh={() => { void loadBalance() }}
                      t={t}
                    />
                  )
                  : (
                    <BalanceView
                      group={groupKey}
                      balance={balance.data as GroupBalance | undefined}
                      phase={balance.phase}
                      error={balance.error}
                      onRefresh={() => { void loadBalance() }}
                      t={t}
                    />
                  )
              : null}
          </div>
        )
        : null}
    </li>
  )
}

/**
 * Render the Protocom API section content column.
 * `param props - slot-delivered injected dependencies.
 * `returns the section, or null while the shell has not injected yet.
 */
export function ProtocomSection(props: ProtocomSectionProps): ReactNode {
  const { operations, t, family, copy } = props
  if (operations === undefined || t === undefined || family === undefined || copy === undefined) return null
  return <Loaded operations={operations} t={t} family={family} copy={copy} />
}

function Loaded({ operations, t, family, copy }: {
  operations: ProtocomOperations
  t: Translator
  family: ProviderFamily
  copy: { title: string; intro: string }
}): ReactNode {
  const [state, setState] = useState<PageState>({ phase: 'loading', credentials: {} })
  const [baseDraft, setBaseDraft] = useState<string | undefined>(undefined)
  const [allowCustomDraft, setAllowCustomDraft] = useState<boolean | undefined>(undefined)
  const [baseBusy, setBaseBusy] = useState(false)
  const [baseNotice, setBaseNotice] = useState<{ kind: 'ok' | 'error'; text: string } | undefined>(undefined)
  const [retryAttemptsDraft, setRetryAttemptsDraft] = useState<string | undefined>(undefined)
  const [retryDelayDraft, setRetryDelayDraft] = useState<string | undefined>(undefined)
  const [probes, setProbes] = useState<Record<string, ProbeState>>({})

  const load = async (): Promise<void> => {
    const view = await operations.describeSettings()
    if (view === undefined) {
      // Name the entry: the actionable fact is WHICH row is missing, because a
      // row that is not being served is a deployment problem the operator can
      // see and fix, not a transient load failure to retry blindly.
      setState({
        phase: 'error',
        credentials: {},
        error: `${t('entryUnavailable')} (${PROTOCOM_ENTRY_ID})`,
      })
      return
    }
    const credentials = await operations.describeCredentials(family.keys.map(key => family.keyRef(key)))
    setState({ phase: 'ready', view, credentials })
  }

  useEffect(() => {
    if (state.phase === 'loading') void load()
    // The initial load is the only automatic one; writes reload explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const baseURL = state.phase === 'ready' ? sectionOf(state.view).baseURL : undefined

  const runProbe = (groupKey: string): void => {
    setProbes(current => ({ ...current, [groupKey]: { phase: 'loading' } }))
    void operations.discoverModels({
      provider: family.providerOf(groupKey),
      ...baseURL === undefined ? {} : { baseURL },
    }).then((outcome) => {
      setProbes(current => ({
        ...current,
        [groupKey]: outcome.kind === 'found'
          ? { phase: 'ready', models: outcome.models }
          : { phase: 'error', message: outcome.message },
      }))
    })
  }

  const section = state.phase === 'ready' ? sectionOf(state.view) : {}
  // One interrogation per group that can answer: a disabled group has no route
  // and a keyless one has no credential, and the Host refuses both — that is a
  // refusal to show as a hint, not as an error banner on page load.
  const probeKey = family.keys
    .filter(key => groupValueOf(section, key, family).enabled
      && state.credentials[family.keyRef(key)]?.configured === true
      && probes[key] === undefined)
    .join(',')
  useEffect(() => {
    for (const key of probeKey.length === 0 ? [] : probeKey.split(',')) void runProbe(key)
    // Probing once per group that becomes answerable is the intent; a manual
    // refresh goes through the card's own button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probeKey])

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
  const revision = view?.revision
  const writable = revision !== undefined
  const allowCustom = allowCustomDraft ?? section.allowCustomBaseURL ?? false

  /**
   * Apply the advanced block. The retry budget shares this control, so it must
   * work when the operator changed only a number and never touched the endpoint:
   * the effective base URL is the draft when there is one, the stored value
   * otherwise, and the shipped default as the last resort.
   */
  const applyBaseURL = (): void => {
    if (baseBusy) return
    const nextBaseURL = baseDraft ?? baseURL ?? family.baseURL
    let origin: string | undefined
    try {
      origin = new URL(nextBaseURL).origin
    } catch {
      origin = undefined
    }
    const needsCustom = origin !== undefined && origin !== family.origin
    if (needsCustom && !allowCustom) {
      setBaseNotice({ kind: 'error', text: t('allowCustomRequired') })
      return
    }
    // The retry budget shares this button, so both numbers are validated before
    // anything is written: a rejected attempt count must not leave a new base
    // URL — or a new wait — half-applied.
    const attempts = Number(retryAttemptsDraft ?? retryMaxAttempts)
    const delay = Number(retryDelayDraft ?? retryMaxDelayMs)
    if (!Number.isSafeInteger(attempts) || attempts < 0 || attempts > MAX_RETRY_ATTEMPTS) {
      setBaseNotice({ kind: 'error', text: t('retryInvalidAttempts') })
      return
    }
    if (!Number.isFinite(delay) || delay < RETRY_INITIAL_DELAY_MS || delay > MAX_RETRY_DELAY_MS) {
      setBaseNotice({ kind: 'error', text: t('retryInvalidDelay') })
      return
    }
    setBaseBusy(true)
    setBaseNotice(undefined)
    // Every field rides one atomic write so none can diverge, and applying the
    // shipped endpoint *clears* the confirmation instead of leaving a sticky
    // opt-in that a later single-field write could ride on.
    void operations.writeSettings([
      ...needsCustom
        ? [
          { op: 'set' as const, path: ['allowCustomBaseURL'], value: true },
          { op: 'set' as const, path: ['baseURL'], value: nextBaseURL },
        ]
        : [
          { op: 'unset' as const, path: ['allowCustomBaseURL'] },
          { op: 'set' as const, path: ['baseURL'], value: nextBaseURL },
        ],
      { op: 'set' as const, path: ['retryMaxAttempts'], value: attempts },
      { op: 'set' as const, path: ['retryMaxDelayMs'], value: delay },
    ], revision)
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

  const retryMaxAttempts = section.retryMaxAttempts ?? DEFAULT_RETRY_MAX_ATTEMPTS
  const retryMaxDelayMs = section.retryMaxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS

  return (
    <div className="protocom-section">
      <h2 className="protocom-title">{copy.title}</h2>
      <p className="protocom-intro">{copy.intro}</p>
      {writable ? null : <p className="protocom-notice">{t('readOnly')}</p>}
      <ul className="protocom-groups">
        {family.keys.map(key => (
          <GroupCard
            key={key}
            groupKey={key}
            family={family}
            group={groupValueOf(section, key, family)}
            credential={state.credentials[family.keyRef(key)]}
            writable={writable}
            revision={revision}
            probe={probes[key] ?? { phase: 'idle' }}
            hidden={section.hiddenModels ?? []}
            recommended={section.recommendedModels ?? family.recommended}
            contexts={section.modelContexts ?? {}}
            vision={section.visionModels ?? {}}
            operations={operations}
            t={t}
            onChanged={load}
            onProbe={() => { runProbe(key) }}
          />
        ))}
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
          <label className="protocom-check">
            <input
              type="checkbox"
              checked={allowCustom}
              disabled={!writable}
              aria-label={t('allowCustom')}
              onChange={event => { setAllowCustomDraft(event.target.checked) }}
            />
            {t('allowCustom')}
          </label>
          <p className="protocom-notice">{t('allowCustomHint')}</p>
          <button type="button" className="protocom-button" disabled={!writable || baseBusy} onClick={applyBaseURL}>
            {baseBusy ? t('applying') : t('apply')}
          </button>
        </div>
        {baseNotice === undefined ? null : (
          <p className={baseNotice.kind === 'ok' ? 'protocom-status' : 'protocom-error'}>{baseNotice.text}</p>
        )}
        <div className="protocom-advanced-body">
          <span className="protocom-field-label">{t('retryMaxAttempts')}</span>
          <input
            type="number"
            className="protocom-input"
            min={0}
            max={MAX_RETRY_ATTEMPTS}
            value={retryAttemptsDraft ?? String(retryMaxAttempts)}
            aria-label={t('retryMaxAttempts')}
            disabled={!writable}
            onChange={event => { setRetryAttemptsDraft(event.target.value) }}
          />
        </div>
        <p className="protocom-notice">{t('retryMaxAttemptsHint')}</p>
        <div className="protocom-advanced-body">
          <span className="protocom-field-label">{t('retryMaxDelayMs')}</span>
          <input
            type="number"
            className="protocom-input"
            min={RETRY_INITIAL_DELAY_MS}
            value={retryDelayDraft ?? String(retryMaxDelayMs)}
            aria-label={t('retryMaxDelayMs')}
            disabled={!writable}
            onChange={event => { setRetryDelayDraft(event.target.value) }}
          />
        </div>
        <p className="protocom-notice">{t('retryMaxDelayMsHint')}</p>
      </details>
    </div>
  )
}
