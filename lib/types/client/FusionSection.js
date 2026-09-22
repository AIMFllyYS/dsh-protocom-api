import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
import { useEffect, useState } from 'react';
import { contextLabel, matchRegistry } from "../model-registry.js";
import { decodeVariantId, stripVariantId } from "../context-variants.js";
import { FAMILIES } from "../family.js";
/** The registry describing one provider route, when a family owns it. */
function registryFor(provider) {
    for (const family of FAMILIES) {
        if (family.groupOf(provider) !== undefined)
            return family.registry;
    }
    return [];
}
function routeOption(provider, providerName, model) {
    const decoded = decodeVariantId(model.id);
    const entry = matchRegistry(stripVariantId(model.id), registryFor(provider));
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
    };
}
/** Flatten the catalog into per-route rows. */
function routeOptions(catalog) {
    return catalog.groups.flatMap(group => group.models.map(model => routeOption(group.id, group.name, model)));
}
/** The catalog row a stored seat names, when that route is still offered. */
function optionFor(options, seat) {
    if (seat?.provider === undefined || seat.model === undefined)
        return undefined;
    return options.find(option => option.provider === seat.provider && option.model === seat.model);
}
/** Whether a stored seat names both halves of a route. */
function seatComplete(seat) {
    return seat?.provider !== undefined && seat.provider !== ''
        && seat.model !== undefined && seat.model !== '';
}
/** Format one per-million-token price for the cost strip. */
function price(value) {
    return `$${value % 1 === 0 ? value.toFixed(0) : value.toFixed(2)}`;
}
/** The stored section as an editable draft, with defaults resolved. */
function draftFrom(state) {
    const value = state.value;
    return {
        enabled: value?.enabled ?? false,
        leader: seatComplete(value?.leader) ? { ...value.leader } : undefined,
        coder: seatComplete(value?.coder) ? { ...value.coder } : undefined,
        includeForks: value?.includeForks ?? true,
        applyLeader: value?.applyLeader ?? true,
    };
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
export function costBreakdown(leader, coder) {
    const priced = [leader, coder].filter((entry) => entry !== undefined);
    const total = priced.reduce((sum, entry) => sum + entry.input + entry.output, 0);
    const shareOf = (pricing) => {
        if (pricing === undefined || total === 0)
            return 0;
        return ((pricing.input + pricing.output) / total) * 100;
    };
    return {
        rows: [
            { key: 'seatLeader', pricing: leader, share: shareOf(leader) },
            { key: 'seatCoder', pricing: coder, share: shareOf(coder) },
        ],
        total,
    };
}
/** The cost strip: the two seats' published prices and their relative weight. */
function CostStrip({ leader, coder, t }) {
    const { rows } = costBreakdown(leader?.pricing, coder?.pricing);
    return (_jsxs("div", { className: "protocom-fusion-cost", children: [_jsx("span", { className: "protocom-fusion-cost-title", children: t('costTitle') }), _jsx("div", { className: "protocom-fusion-bar", role: "presentation", children: rows.map(row => (row.pricing === undefined
                    ? null
                    : (_jsx("span", { className: "protocom-fusion-bar-part", style: { width: `${row.share}%` }, title: t(row.key) }, row.key)))) }), rows.map(row => (_jsxs("div", { className: "protocom-fusion-cost-row", children: [_jsx("span", { className: "protocom-fusion-cost-seat", children: t(row.key) }), _jsx("span", { className: "protocom-fusion-cost-prices", children: row.pricing === undefined
                            ? t('costUnknown')
                            : `${t('costInput')} ${price(row.pricing.input)} · ${t('costCache')} ${row.pricing.cacheRead === undefined ? t('costUnknown') : price(row.pricing.cacheRead)} · ${t('costOutput')} ${price(row.pricing.output)}` })] }, row.key)))] }));
}
/** One seat editor row: the route picker, its context badge, and its effort list. */
function SeatRow({ seat, options, value, disabled, unavailable, onChange, t }) {
    const selected = optionFor(options, value);
    const label = seat === 'leader' ? t('seatLeader') : t('seatCoder');
    const pickerId = `fusion-${seat}-model`;
    const effortId = `fusion-${seat}-effort`;
    return (_jsxs("div", { className: "protocom-fusion-seat", children: [_jsxs("div", { className: "protocom-fusion-seat-head", children: [_jsx("label", { className: "protocom-fusion-seat-label", htmlFor: pickerId, children: label }), selected?.contextWindow === undefined
                        ? null
                        : _jsxs("span", { className: "protocom-fusion-ctx", children: [t('contextLabel'), " ", contextLabel(selected.contextWindow)] }), unavailable ? _jsx("span", { className: "protocom-fusion-unavailable", children: t('seatUnavailable') }) : null] }), _jsxs("select", { id: pickerId, className: "protocom-input", "aria-label": label, disabled: disabled, value: selected?.key ?? '', onChange: (event) => {
                    const next = options.find(option => option.key === event.target.value);
                    if (next === undefined) {
                        onChange(undefined);
                        return;
                    }
                    // Switching the route clears the effort: the previous id belongs to
                    // the previous model's own vocabulary, which is the same rule the
                    // harness applies when a delegation changes a child's route.
                    onChange({ provider: next.provider, model: next.model });
                }, children: [_jsx("option", { value: "", children: t('seatUnset') }), options.map(option => (_jsx("option", { value: option.key, children: `${option.providerName} · ${option.modelName}` }, option.key)))] }), _jsxs("div", { className: "protocom-fusion-effort", children: [_jsx("label", { className: "protocom-fusion-effort-label", htmlFor: effortId, children: t('effortLabel') }), _jsxs("select", { id: effortId, className: "protocom-input", "aria-label": `${label} ${t('effortLabel')}`, disabled: disabled || selected === undefined || selected.efforts.length === 0, value: value?.reasoningEffort ?? '', onChange: (event) => {
                            if (selected === undefined)
                                return;
                            const effort = event.target.value;
                            onChange({
                                provider: selected.provider,
                                model: selected.model,
                                ...effort === '' ? {} : { reasoningEffort: effort },
                            });
                        }, children: [_jsx("option", { value: "", children: selected?.defaultEffort === undefined
                                    ? t('effortDefault')
                                    : `${t('effortDefault')} (${selected.defaultEffort})` }), (selected?.efforts ?? []).map(effort => (_jsx("option", { value: effort.id, children: effort.name }, effort.id)))] })] })] }));
}
/** One switch, matching the provider cards' own control. */
function Toggle({ id, checked, disabled, onChange, label }) {
    return (_jsxs("label", { className: "protocom-switch", htmlFor: id, children: [_jsx("input", { id: id, type: "checkbox", checked: checked, disabled: disabled, onChange: (event) => { onChange(event.target.checked); } }), _jsx("span", { className: "protocom-switch-track", children: _jsx("span", { className: "protocom-switch-thumb" }) }), _jsx("span", { children: label })] }));
}
/**
 * Render the Fusion settings section and, on demand, its seat editor.
 * @param props - locale copy, the injected Host operations, and the heading.
 * @returns the section, or nothing until the shell injects.
 */
export function FusionSection(props) {
    const { operations, t, copy } = props;
    if (operations === undefined || t === undefined || copy === undefined)
        return null;
    return _jsx(FusionBody, { operations: operations, t: t, copy: copy });
}
function FusionBody({ operations, t, copy }) {
    const [state, setState] = useState(() => operations.section());
    const [draft, setDraft] = useState(undefined);
    const [load, setLoad] = useState({ phase: 'loading' });
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState(undefined);
    useEffect(() => operations.subscribe(() => { setState(operations.section()); }), [operations]);
    useEffect(() => {
        let live = true;
        void (async () => {
            const outcome = await operations.loadCatalog();
            if (!live)
                return;
            setLoad(outcome.kind === 'found'
                ? { phase: 'ready', catalog: outcome.catalog }
                : { phase: 'error', message: outcome.message });
        })();
        return () => { live = false; };
    }, [operations]);
    const catalog = load.phase === 'ready' ? load.catalog : undefined;
    const options = catalog === undefined ? [] : routeOptions(catalog);
    const stored = draftFrom(state);
    const editing = draft !== undefined;
    const effective = draft ?? stored;
    /** Stage one edit over the draft (seeding it from the stored section first). */
    const patch = (change) => {
        setDraft(current => ({ ...(current ?? { ...stored }), ...change }));
    };
    const open = () => {
        setNotice(undefined);
        setDraft({ ...stored });
    };
    const save = async () => {
        if (draft === undefined || busy)
            return;
        if (draft.enabled && (!seatComplete(draft.leader) || !seatComplete(draft.coder))) {
            setNotice({ kind: 'error', text: t('needBothSeats') });
            return;
        }
        setBusy(true);
        setNotice(undefined);
        try {
            const written = await operations.saveFusion(draft, state.revision);
            if (written.kind !== 'written') {
                setNotice({
                    kind: 'error',
                    text: written.kind === 'conflict' ? t('conflict') : `${t('saveFailed')}: ${written.message}`,
                });
                return;
            }
            // The routing itself is committed now. Applying the leader is a separate,
            // softer act: a failure there is reported rather than rolling the section
            // back, because the pair the user chose is still what they asked to store.
            const failures = draft.enabled && draft.applyLeader && seatComplete(draft.leader)
                ? await operations.applyLeader(draft.leader)
                : [];
            setDraft(undefined);
            setNotice(failures.length === 0
                ? { kind: 'ok', text: t('saved') }
                : { kind: 'error', text: `${t('savedApplyFailed')}: ${failures.join(' ')}` });
        }
        finally {
            setBusy(false);
        }
    };
    const hasStoredSeats = seatComplete(stored.leader) || seatComplete(stored.coder);
    return (_jsxs("div", { className: "protocom-section", children: [_jsx("h2", { className: "protocom-title", children: copy.title }), _jsx("p", { className: "protocom-intro", children: copy.intro }), _jsxs("div", { className: "protocom-card", children: [_jsxs("div", { className: "protocom-card-head", children: [_jsx("span", { className: stored.enabled ? 'protocom-dot is-on' : 'protocom-dot' }), _jsx("span", { className: "protocom-card-name", children: t('statusTitle') }), _jsx("span", { className: "protocom-head-state", children: _jsx("span", { className: "protocom-tag", children: stored.enabled ? t('statusOn') : t('statusOff') }) }), _jsx("button", { type: "button", className: "protocom-button", onClick: open, disabled: busy || load.phase !== 'ready', children: t('configure') })] }), _jsx("p", { className: "protocom-notice", children: hasStoredSeats
                            ? `${t('seatLeader')}: ${seatSummary(stored.leader, t)} · ${t('seatCoder')}: ${seatSummary(stored.coder, t)}`
                            : t('noSeats') }), load.phase === 'loading' ? _jsx("p", { className: "protocom-notice", children: t('loading') }) : null, load.phase === 'error'
                        ? (_jsxs("p", { className: "protocom-error", children: [`${t('catalogFailed')}: ${load.message}`, ' ', _jsx("button", { type: "button", className: "protocom-button", onClick: () => {
                                        setLoad({ phase: 'loading' });
                                        void operations.loadCatalog().then((outcome) => {
                                            setLoad(outcome.kind === 'found' ? { phase: 'ready', catalog: outcome.catalog } : { phase: 'error', message: outcome.message });
                                        });
                                    }, children: t('retry') })] }))
                        : null, load.phase === 'ready' && load.catalog.failures.length > 0
                        ? _jsx("p", { className: "protocom-notice", children: t('catalogPartial') })
                        : null, state.status === 'unavailable'
                        ? _jsx("p", { className: "protocom-notice", children: t('sectionUnavailable') })
                        : null, notice === undefined
                        ? null
                        : _jsx("p", { className: notice.kind === 'ok' ? 'protocom-status' : 'protocom-error', children: notice.text })] }), editing
                ? (_jsx("div", { className: "protocom-fusion-modal", role: "dialog", "aria-label": t('modalTitle'), children: _jsxs("div", { className: "protocom-fusion-modal-body", children: [_jsx("h3", { className: "protocom-fusion-modal-title", children: t('modalTitle') }), _jsx("p", { className: "protocom-fusion-modal-intro", children: t('modalIntro') }), _jsx(Toggle, { id: "fusion-enabled", checked: effective.enabled, disabled: busy, onChange: (next) => { patch({ enabled: next }); }, label: t('enabled') }), _jsx(SeatRow, { seat: "leader", options: options, value: effective.leader, disabled: busy, unavailable: seatComplete(effective.leader) && optionFor(options, effective.leader) === undefined, onChange: (next) => { patch({ leader: next }); }, t: t }), _jsx(SeatRow, { seat: "coder", options: options, value: effective.coder, disabled: busy, unavailable: seatComplete(effective.coder) && optionFor(options, effective.coder) === undefined, onChange: (next) => { patch({ coder: next }); }, t: t }), _jsx(Toggle, { id: "fusion-forks", checked: effective.includeForks, disabled: busy, onChange: (next) => { patch({ includeForks: next }); }, label: t('includeForks') }), _jsx(Toggle, { id: "fusion-apply-leader", checked: effective.applyLeader, disabled: busy, onChange: (next) => { patch({ applyLeader: next }); }, label: t('applyLeader') }), _jsx(CostStrip, { leader: optionFor(options, effective.leader), coder: optionFor(options, effective.coder), t: t }), _jsxs("div", { className: "protocom-fusion-actions", children: [_jsx("button", { type: "button", className: "protocom-button", disabled: busy, onClick: () => { setDraft(undefined); setNotice(undefined); }, children: t('cancel') }), _jsx("button", { type: "button", className: "protocom-button protocom-button-primary", disabled: busy || !state.writable, onClick: () => { void save(); }, children: busy ? t('saving') : t('save') })] })] }) }))
                : null] }));
}
/** One seat's one-line summary, or its unset marker. */
function seatSummary(seat, t) {
    if (!seatComplete(seat))
        return t('seatUnset');
    return seat.reasoningEffort === undefined
        ? seat.model
        : `${seat.model} (${seat.reasoningEffort})`;
}
