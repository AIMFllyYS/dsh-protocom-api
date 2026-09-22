/**
 * Fusion dual-model settings section: a status card on the settings page whose
 * Configure button opens the seat editor. The editor stages both seats and the
 * two switches locally and commits them as ONE revision-fenced mutation, so a
 * half-configured pair is never stored. Saving also soft-applies the leader
 * (default model, then the current top-level Session) unless the deployment
 * turned that off — the composer can still switch away, which is what makes it
 * soft rather than a lock.
 *
 * Model options come from the Host catalog the composer itself uses, so the
 * list is exactly the enabled providers' selectable models, and each context
 * variant (`::ctx@N`) is its own row because choosing a context is choosing
 * that row.
 */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { contextLabel, matchRegistry } from '../model-registry.ts'
import type { RegistryEntry, RegistryPricing } from '../model-registry.ts'
import { decodeVariantId, stripVariantId } from '../context-variants.ts'
import { FAMILIES } from '../family.ts'
import type {
  FusionCatalog,
  FusionCatalogModel,
  FusionDraft,
  FusionOperations,
  FusionSeat,
  FusionSectionState,
  FusionStoredSeat,
} from './fusion-operations.ts'
import type { en } from './locale.ts'

/** Injected dependencies of the Fusion section (slot `inject`). */
export interface FusionInjected {
  /** The Host operations the editor invokes. */
  operations: FusionOperations
  /** Section copy. */
  t: (key: keyof typeof en) => string
  /** The section's heading copy, resolved through `t` at inject time. */
  copy: { title: string; intro: string }
}

/** Props delivered by the slot outlet. */
export type FusionSectionProps = Partial<InjectFace<FusionInjected>>

type Translator = (key: keyof typeof en) => string

type LoadState =
  | { phase: 'loading' }
  | { phase: 'ready'; catalog: FusionCatalog }
  | { phase: 'error'; message: string }

/** One selectable catalog row: an exact route plus the facts the editor shows. */
interface RouteOption {
  key: string
  provider: string
  providerName: string
  model: string
  modelName: string
  /** Resolved context window in tokens, when the id names a variant or the registry knows one. */
  contextWindow: number | undefined
  efforts: readonly { id: string; name: string }[]
  defaultEffort: string | undefined
  pricing: RegistryPricing | undefined
}

/** The registry describing one provider route, when a family owns it. */
function registryFor(provider: string): readonly RegistryEntry[] {
  for (const family of FAMILIES) {
    if (family.groupOf(provider) !== undefined) return family.registry
  }
  return []
}

function routeOption(provider: string, providerName: string, model: FusionCatalogModel): RouteOption {
  const decoded = decodeVariantId(model.id)
  const entry = matchRegistry(stripVariantId(model.id), registryFor(provider))
  return {
    key: `${provider}\u0000${model.id}`,
    provider,
    providerName,
    model: model.id,
    modelName: model.name,
    contextWindow: decoded.contextWindow ?? entry?.contextWindow,
    efforts: model.reasoning?.efforts ?? [],
    defaultEffort: model.reasoning?.defaultEffort,
    pricing: entry?.pricing,
  }
}

/** Flatten the catalog into per-route rows. */
function routeOptions(catalog: FusionCatalog): RouteOption[] {
  return catalog.groups.flatMap(group => group.models.map(model => routeOption(group.id, group.name, model)))
}

/** The catalog row a stored seat names, when that route is still offered. */
function optionFor(options: readonly RouteOption[], seat: FusionStoredSeat | undefined): RouteOption | undefined {
  if (seat?.provider === undefined || seat.model === undefined) return undefined
  return options.find(option => option.provider === seat.provider && option.model === seat.model)
}

/** Whether a stored seat names both halves of a route. */
function seatComplete(seat: FusionStoredSeat | FusionSeat | undefined): seat is FusionSeat {
  return seat?.provider !== undefined && seat.provider !== ''
    && seat.model !== undefined && seat.model !== ''
}

/** Format one per-million-token price for the cost strip. */
function price(value: number): string {
  return `$${value % 1 === 0 ? value.toFixed(0) : value.toFixed(2)}`
}

/** The stored section as an editable draft, with defaults resolved. */
function draftFrom(state: FusionSectionState): FusionDraft {
  const value = state.value
  return {
    enabled: value?.enabled ?? false,
    leader: seatComplete(value?.leader) ? { ...value.leader } as FusionSeat : undefined,
    coder: seatComplete(value?.coder) ? { ...value.coder } as FusionSeat : undefined,
    includeForks: value?.includeForks ?? true,
    applyLeader: value?.applyLeader ?? true,
  }
}

/** One seat's slot on the cost strip: its published price, when it has one. */
export interface CostRow {
  key: 'seatLeader' | 'seatCoder'
  pricing: RegistryPricing | undefined
  /** Share of the combined input+output price, as a percentage of the priced total. */
  share: number
}

/**
 * Compute the cost strip's shares.
 *
 * Pricing comes from this plugin's own registry, and no entry currently carries
 * a `pricing` block — the endpoints publish no price list this plugin can
 * verify, so every row renders its "no published price" state today. The
 * computation is real rather than stubbed so that filling in registry pricing
 * is all it takes for the strip to light up.
 * @param leader - the leader seat's published price, if any.
 * @param coder - the coder seat's published price, if any.
 * @returns one row per seat, in strip order, and the priced total.
 */
export function costBreakdown(
  leader: RegistryPricing | undefined,
  coder: RegistryPricing | undefined,
): { rows: CostRow[]; total: number } {
  const priced = [leader, coder].filter((entry): entry is RegistryPricing => entry !== undefined)
  const total = priced.reduce((sum, entry) => sum + entry.input + entry.output, 0)
  const shareOf = (pricing: RegistryPricing | undefined): number => {
    if (pricing === undefined || total === 0) return 0
    return ((pricing.input + pricing.output) / total) * 100
  }
  return {
    rows: [
      { key: 'seatLeader', pricing: leader, share: shareOf(leader) },
      { key: 'seatCoder', pricing: coder, share: shareOf(coder) },
    ],
    total,
  }
}

/** The cost strip: the two seats' published prices and their relative weight. */
function CostStrip({ leader, coder, t }: {
  leader: RouteOption | undefined
  coder: RouteOption | undefined
  t: Translator
}): ReactNode {
  const { rows } = costBreakdown(leader?.pricing, coder?.pricing)
  return (
    <div className="protocom-fusion-cost">
      <span className="protocom-fusion-cost-title">{t('costTitle')}</span>
      <div className="protocom-fusion-bar" role="presentation">
        {rows.map(row => (row.pricing === undefined
          ? null
          : (
            <span
              key={row.key}
              className="protocom-fusion-bar-part"
              style={{ width: `${row.share}%` }}
              title={t(row.key)}
            />
          )))}
      </div>
      {rows.map(row => (
        <div key={row.key} className="protocom-fusion-cost-row">
          <span className="protocom-fusion-cost-seat">{t(row.key)}</span>
          <span className="protocom-fusion-cost-prices">
            {row.pricing === undefined
              ? t('costUnknown')
              : `${t('costInput')} ${price(row.pricing.input)} · ${t('costCache')} ${row.pricing.cacheRead === undefined ? t('costUnknown') : price(row.pricing.cacheRead)} · ${t('costOutput')} ${price(row.pricing.output)}`}
          </span>
        </div>
      ))}
    </div>
  )
}

/** One seat editor row: the route picker, its context badge, and its effort list. */
function SeatRow({ seat, options, value, disabled, unavailable, onChange, t }: {
  seat: 'leader' | 'coder'
  options: readonly RouteOption[]
  value: FusionStoredSeat | undefined
  disabled: boolean
  unavailable: boolean
  onChange: (next: FusionSeat | undefined) => void
  t: Translator
}): ReactNode {
  const selected = optionFor(options, value)
  const label = seat === 'leader' ? t('seatLeader') : t('seatCoder')
  const pickerId = `fusion-${seat}-model`
  const effortId = `fusion-${seat}-effort`
  return (
    <div className="protocom-fusion-seat">
      <div className="protocom-fusion-seat-head">
        <label className="protocom-fusion-seat-label" htmlFor={pickerId}>{label}</label>
        {selected?.contextWindow === undefined
          ? null
          : <span className="protocom-fusion-ctx">{t('contextLabel')} {contextLabel(selected.contextWindow)}</span>}
        {unavailable ? <span className="protocom-fusion-unavailable">{t('seatUnavailable')}</span> : null}
      </div>
      <select
        id={pickerId}
        className="protocom-input"
        aria-label={label}
        disabled={disabled}
        value={selected?.key ?? ''}
        onChange={(event) => {
          const next = options.find(option => option.key === event.target.value)
          if (next === undefined) {
            onChange(undefined)
            return
          }
          // Switching the route clears the effort: the previous id belongs to
          // the previous model's own vocabulary, which is the same rule the
          // harness applies when a delegation changes a child's route.
          onChange({ provider: next.provider, model: next.model })
        }}
      >
        <option value="">{t('seatUnset')}</option>
        {options.map(option => (
          <option key={option.key} value={option.key}>
            {`${option.providerName} · ${option.modelName}`}
          </option>
        ))}
      </select>
      <div className="protocom-fusion-effort">
        <label className="protocom-fusion-effort-label" htmlFor={effortId}>{t('effortLabel')}</label>
        <select
          id={effortId}
          className="protocom-input"
          aria-label={`${label} ${t('effortLabel')}`}
          disabled={disabled || selected === undefined || selected.efforts.length === 0}
          value={value?.reasoningEffort ?? ''}
          onChange={(event) => {
            if (selected === undefined) return
            const effort = event.target.value
            onChange({
              provider: selected.provider,
              model: selected.model,
              ...effort === '' ? {} : { reasoningEffort: effort },
            })
          }}
        >
          <option value="">
            {selected?.defaultEffort === undefined
              ? t('effortDefault')
              : `${t('effortDefault')} (${selected.defaultEffort})`}
          </option>
          {(selected?.efforts ?? []).map(effort => (
            <option key={effort.id} value={effort.id}>{effort.name}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

/** One switch, matching the provider cards' own control. */
function Toggle({ id, checked, disabled, onChange, label }: {
  id: string
  checked: boolean
  disabled: boolean
  onChange: (next: boolean) => void
  label: string
}): ReactNode {
  return (
    <label className="protocom-switch" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => { onChange(event.target.checked) }}
      />
      <span className="protocom-switch-track"><span className="protocom-switch-thumb" /></span>
      <span>{label}</span>
    </label>
  )
}

/**
 * Render the Fusion settings section and, on demand, its seat editor.
 * @param props - locale copy, the injected Host operations, and the heading.
 * @returns the section, or nothing until the shell injects.
 */
export function FusionSection(props: FusionSectionProps): ReactNode {
  const { operations, t, copy } = props
  if (operations === undefined || t === undefined || copy === undefined) return null
  return <FusionBody operations={operations} t={t} copy={copy} />
}

function FusionBody({ operations, t, copy }: {
  operations: FusionOperations
  t: Translator
  copy: { title: string; intro: string }
}): ReactNode {
  const [state, setState] = useState<FusionSectionState>(() => operations.section())
  const [draft, setDraft] = useState<FusionDraft | undefined>(undefined)
  const [load, setLoad] = useState<LoadState>({ phase: 'loading' })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | undefined>(undefined)

  useEffect(() => operations.subscribe(() => { setState(operations.section()) }), [operations])

  useEffect(() => {
    let live = true
    void (async () => {
      const outcome = await operations.loadCatalog()
      if (!live) return
      setLoad(outcome.kind === 'found'
        ? { phase: 'ready', catalog: outcome.catalog }
        : { phase: 'error', message: outcome.message })
    })()
    return () => { live = false }
  }, [operations])

  const catalog = load.phase === 'ready' ? load.catalog : undefined
  const options = catalog === undefined ? [] : routeOptions(catalog)
  const stored = draftFrom(state)
  const editing = draft !== undefined
  const effective = draft ?? stored

  /** Stage one edit over the draft (seeding it from the stored section first). */
  const patch = (change: Partial<FusionDraft>): void => {
    setDraft(current => ({ ...(current ?? { ...stored }), ...change }))
  }

  const open = (): void => {
    setNotice(undefined)
    setDraft({ ...stored })
  }

  const save = async (): Promise<void> => {
    if (draft === undefined || busy) return
    if (draft.enabled && (!seatComplete(draft.leader) || !seatComplete(draft.coder))) {
      setNotice({ kind: 'error', text: t('needBothSeats') })
      return
    }
    setBusy(true)
    setNotice(undefined)
    try {
      const written = await operations.saveFusion(draft, state.revision)
      if (written.kind !== 'written') {
        setNotice({
          kind: 'error',
          text: written.kind === 'conflict' ? t('conflict') : `${t('saveFailed')}: ${written.message}`,
        })
        return
      }
      // The routing itself is committed now. Applying the leader is a separate,
      // softer act: a failure there is reported rather than rolling the section
      // back, because the pair the user chose is still what they asked to store.
      const failures = draft.enabled && draft.applyLeader && seatComplete(draft.leader)
        ? await operations.applyLeader(draft.leader)
        : []
      setDraft(undefined)
      setNotice(failures.length === 0
        ? { kind: 'ok', text: t('saved') }
        : { kind: 'error', text: `${t('savedApplyFailed')}: ${failures.join(' ')}` })
    } finally {
      setBusy(false)
    }
  }

  const hasStoredSeats = seatComplete(stored.leader) || seatComplete(stored.coder)
  return (
    <div className="protocom-section">
      <h2 className="protocom-title">{copy.title}</h2>
      <p className="protocom-intro">{copy.intro}</p>
      <div className="protocom-card">
        <div className="protocom-card-head">
          <span className={stored.enabled ? 'protocom-dot is-on' : 'protocom-dot'} />
          <span className="protocom-card-name">{t('statusTitle')}</span>
          <span className="protocom-head-state">
            <span className="protocom-tag">{stored.enabled ? t('statusOn') : t('statusOff')}</span>
          </span>
          <button
            type="button"
            className="protocom-button"
            onClick={open}
            disabled={busy || load.phase !== 'ready'}
          >
            {t('configure')}
          </button>
        </div>
        <p className="protocom-notice">
          {hasStoredSeats
            ? `${t('seatLeader')}: ${seatSummary(stored.leader, t)} · ${t('seatCoder')}: ${seatSummary(stored.coder, t)}`
            : t('noSeats')}
        </p>
        {load.phase === 'loading' ? <p className="protocom-notice">{t('loading')}</p> : null}
        {load.phase === 'error'
          ? (
            <p className="protocom-error">
              {`${t('catalogFailed')}: ${load.message}`}
              {' '}
              <button
                type="button"
                className="protocom-button"
                onClick={() => { setLoad({ phase: 'loading' }); void operations.loadCatalog().then((outcome) => {
                  setLoad(outcome.kind === 'found' ? { phase: 'ready', catalog: outcome.catalog } : { phase: 'error', message: outcome.message })
                }) }}
              >
                {t('retry')}
              </button>
            </p>
          )
          : null}
        {load.phase === 'ready' && load.catalog.failures.length > 0
          ? <p className="protocom-notice">{t('catalogPartial')}</p>
          : null}
        {state.status === 'unavailable'
          ? <p className="protocom-notice">{t('sectionUnavailable')}</p>
          : null}
        {notice === undefined
          ? null
          : <p className={notice.kind === 'ok' ? 'protocom-status' : 'protocom-error'}>{notice.text}</p>}
      </div>
      {editing
        ? (
          <div className="protocom-fusion-modal" role="dialog" aria-label={t('modalTitle')}>
            <div className="protocom-fusion-modal-body">
              <h3 className="protocom-fusion-modal-title">{t('modalTitle')}</h3>
              <p className="protocom-fusion-modal-intro">{t('modalIntro')}</p>
              <Toggle
                id="fusion-enabled"
                checked={effective.enabled}
                disabled={busy}
                onChange={(next) => { patch({ enabled: next }) }}
                label={t('enabled')}
              />
              <SeatRow
                seat="leader"
                options={options}
                value={effective.leader}
                disabled={busy}
                unavailable={seatComplete(effective.leader) && optionFor(options, effective.leader) === undefined}
                onChange={(next) => { patch({ leader: next }) }}
                t={t}
              />
              <SeatRow
                seat="coder"
                options={options}
                value={effective.coder}
                disabled={busy}
                unavailable={seatComplete(effective.coder) && optionFor(options, effective.coder) === undefined}
                onChange={(next) => { patch({ coder: next }) }}
                t={t}
              />
              <Toggle
                id="fusion-forks"
                checked={effective.includeForks}
                disabled={busy}
                onChange={(next) => { patch({ includeForks: next }) }}
                label={t('includeForks')}
              />
              <Toggle
                id="fusion-apply-leader"
                checked={effective.applyLeader}
                disabled={busy}
                onChange={(next) => { patch({ applyLeader: next }) }}
                label={t('applyLeader')}
              />
              <CostStrip
                leader={optionFor(options, effective.leader)}
                coder={optionFor(options, effective.coder)}
                t={t}
              />
              <div className="protocom-fusion-actions">
                <button
                  type="button"
                  className="protocom-button"
                  disabled={busy}
                  onClick={() => { setDraft(undefined); setNotice(undefined) }}
                >
                  {t('cancel')}
                </button>
                <button
                  type="button"
                  className="protocom-button protocom-button-primary"
                  disabled={busy || !state.writable}
                  onClick={() => { void save() }}
                >
                  {busy ? t('saving') : t('save')}
                </button>
              </div>
            </div>
          </div>
        )
        : null}
    </div>
  )
}

/** One seat's one-line summary, or its unset marker. */
function seatSummary(seat: FusionStoredSeat | undefined, t: Translator): string {
  if (!seatComplete(seat)) return t('seatUnset')
  return seat.reasoningEffort === undefined
    ? seat.model
    : `${seat.model} (${seat.reasoningEffort})`
}
