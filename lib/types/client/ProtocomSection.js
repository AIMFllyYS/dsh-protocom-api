import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
import { useEffect, useState } from 'react';
import { variantLengths } from "../context-variants.js";
import { parseBalanceView } from "../balance-view.js";
import { parseGoUsage } from "../usage-view.js";
import { CONTEXT_LADDER, contextLabel, groupCatalog, identityKey, matchRegistry, servesChat, } from "../model-registry.js";
function sectionOf(view) {
    const value = view?.value;
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function groupValueOf(section, key, family) {
    const raw = section.groups?.[key] ?? {};
    const defaults = family.defaults[key];
    return {
        enabled: raw.enabled ?? false,
        protocol: raw.protocol ?? defaults?.protocol ?? 'chat-completions',
        // The card shows the effective lengths, so a group that ships a ladder
        // (StepFun) reads as configured before the deployment stores its own.
        contextLengths: raw.contextLengths ?? [...defaults?.contextLengths ?? []],
        showBalance: raw.showBalance ?? true,
    };
}
function formatAmount(value, unit) {
    return unit === 'USD' ? `$${value.toFixed(2)}` : `${value}${unit === undefined ? '' : ` ${unit}`}`;
}
/** The quota strip of a Go group card: the subscription's three rate windows. */
export function QuotaView({ usage, phase, error, onRefresh, t }) {
    const windows = [
        [t('quotaRolling'), usage?.rolling],
        [t('quotaWeekly'), usage?.weekly],
        [t('quotaMonthly'), usage?.monthly],
    ];
    const rows = windows.filter((pair) => pair[1] !== undefined);
    return (_jsxs("div", { className: "protocom-balance", children: [_jsxs("div", { className: "protocom-balance-head", children: [_jsx("span", { children: t('usageQuota') }), _jsx("button", { type: "button", className: "protocom-button", disabled: phase === 'loading', onClick: onRefresh, children: phase === 'loading' ? t('refreshing') : t('refresh') })] }), phase === 'error' ? _jsx("p", { className: "protocom-error", children: `${t('loadFailed')}: ${error ?? ''}` }) : null, phase === 'ready' && rows.length === 0 ? _jsx("p", { className: "protocom-notice", children: t('none') }) : null, rows.map(([label, window]) => {
                const percent = window.percent ?? 0;
                const limited = window.status === 'rate-limited';
                return (_jsxs("div", { className: "protocom-quota-row", children: [_jsx("span", { className: "protocom-quota-label", children: label }), _jsx("span", { className: "protocom-quota-bar", children: _jsx("span", { className: limited || percent > 80 ? 'protocom-quota-fill is-warn' : 'protocom-quota-fill', style: { width: `${Math.min(100, Math.max(0, percent))}%` } }) }), _jsxs("span", { className: "protocom-quota-num", children: [`${percent}%`, _jsx("small", { children: limited ? t('quotaRateLimited') : (window.resetsAt === undefined ? '' : `${t('quotaResets')} ${window.resetsAt.slice(0, 10)}`) })] })] }, label));
            })] }));
}
/** The balance strip of one group card. */
export function BalanceView({ group, balance, phase, error, onRefresh, t }) {
    const items = [];
    const heroQuota = balance !== undefined
        && balance.remaining !== undefined
        && balance.limit !== undefined
        && balance.limit > 0;
    if (balance !== undefined) {
        if (!heroQuota) {
            if (balance.remaining !== undefined)
                items.push([t('remaining'), formatAmount(balance.remaining, balance.unit)]);
            if (balance.limit !== undefined)
                items.push([t('limit'), formatAmount(balance.limit, balance.unit)]);
        }
        if (balance.balance !== undefined)
            items.push([t('balanceAmount'), formatAmount(balance.balance, balance.unit)]);
        if (balance.planName !== undefined)
            items.push([t('plan'), balance.planName]);
        if (balance.todayRequests !== undefined || balance.todayCost !== undefined) {
            const parts = [
                balance.todayRequests === undefined ? undefined : `${balance.todayRequests} ${t('requests')}`,
                balance.todayCost === undefined ? undefined : formatAmount(balance.todayCost, balance.unit ?? 'USD'),
            ].filter((part) => part !== undefined);
            items.push([t('today'), parts.join(' · ')]);
        }
        if (balance.rpm !== undefined || balance.tpm !== undefined) {
            items.push([t('rateWindow'), `RPM ${balance.rpm ?? t('none')} · TPM ${balance.tpm ?? t('none')}`]);
        }
        if (balance.expiresAt !== undefined)
            items.push([t('expiresAt'), balance.expiresAt.slice(0, 10)]);
        if (balance.rateMultiplier !== undefined)
            items.push([t('rateMultiplier'), `×${balance.rateMultiplier}`]);
        if (balance.groupRateMultiplier !== undefined)
            items.push([t('groupRateMultiplier'), `×${balance.groupRateMultiplier}`]);
    }
    void group;
    return (_jsxs("div", { className: "protocom-balance", children: [_jsxs("div", { className: "protocom-balance-head", children: [_jsx("span", { children: t('balance') }), _jsx("button", { type: "button", className: "protocom-button", disabled: phase === 'loading', onClick: onRefresh, children: phase === 'loading' ? t('refreshing') : t('refresh') })] }), phase === 'error' ? _jsx("p", { className: "protocom-error", children: `${t('loadFailed')}: ${error ?? ''}` }) : null, phase === 'ready' && items.length === 0 && !heroQuota ? _jsx("p", { className: "protocom-notice", children: t('none') }) : null, heroQuota && balance !== undefined ? (_jsxs("div", { className: "protocom-quota", children: [_jsxs("div", { className: "protocom-quota-hero", children: [formatAmount(balance.remaining, balance.unit), _jsx("small", { children: `/ ${formatAmount(balance.limit, balance.unit)} ${t('limit')}` })] }), _jsx("div", { className: "protocom-quota-bar", children: _jsx("div", { className: (balance.limit - balance.remaining) / balance.limit > 0.8
                                ? 'protocom-quota-fill is-warn'
                                : 'protocom-quota-fill', style: { width: `${Math.min(100, Math.max(0, ((balance.limit - balance.remaining) / balance.limit) * 100))}%` } }) })] })) : null, items.length === 0 ? null : (_jsx("div", { className: "protocom-balance-grid", children: items.map(([label, value]) => (_jsxs("span", { className: "protocom-balance-item", children: [`${label} `, _jsx("b", { children: value })] }, label))) }))] }));
}
/** How many rows a group may hold before its list offers a filter box. */
const FILTER_THRESHOLD = 8;
/** One model's control row inside its group's card. */
function ModelRow({ model, group, family, hidden, recommended, contexts, vision, writable, busy, t, onWrite }) {
    const key = identityKey(model.upstreamId, family.registry);
    const hiddenSet = new Set(hidden);
    const shown = model.ids.every(id => !hiddenSet.has(id));
    const starred = recommended.includes(key);
    // The lengths this model offers when nothing is stored: the group's own
    // ladder narrowed to the model's window, or its full window when the group
    // ships no ladder. Exactly what the adapter advertises, so the row and the
    // menu cannot disagree.
    const fallback = variantLengths(model.contextOptions, group.contextLengths) ?? [model.contextWindow];
    const stored = contexts[key];
    const selected = (stored ?? fallback).filter(length => length <= model.contextWindow);
    const chosen = selected.length > 0 ? selected : fallback;
    const ladder = model.contextOptions ?? CONTEXT_LADDER;
    const images = vision[key] ?? model.vision;
    const meta = [
        ...model.reasoning === undefined ? [] : [t('tagReasoning')],
    ].join(' · ');
    const toggleShown = () => {
        const rest = hidden.filter(id => !model.ids.includes(id));
        const next = shown ? [...rest, ...model.ids] : rest;
        onWrite(next.length === 0
            ? [{ op: 'unset', path: ['hiddenModels'] }]
            : [{ op: 'set', path: ['hiddenModels'], value: next }]);
    };
    const writeContexts = (next) => {
        const isDefault = next.length === fallback.length && next.every((length, index) => length === fallback[index]);
        onWrite(isDefault
            ? [{ op: 'unset', path: ['modelContexts', key] }]
            : [{ op: 'set', path: ['modelContexts', key], value: next }]);
    };
    const toggleVision = () => {
        // On is the permissive default, so unsetting is how a model goes back to
        // "whatever the endpoint does"; off is the explicit text-only verdict.
        onWrite(images
            ? [{ op: 'set', path: ['visionModels', key], value: false }]
            : [{ op: 'unset', path: ['visionModels', key] }]);
    };
    const toggleStar = () => {
        const rest = recommended.filter(id => id !== key);
        const next = starred ? rest : [...rest, key];
        onWrite(next.length === 0
            ? [{ op: 'unset', path: ['recommendedModels'] }]
            : [{ op: 'set', path: ['recommendedModels'], value: next }]);
    };
    return (_jsxs("div", { className: shown ? 'protocom-model-row' : 'protocom-model-row is-off', title: model.ids.join('\n'), children: [_jsxs("label", { className: "protocom-model-pick", children: [_jsx("input", { type: "checkbox", checked: shown, disabled: !writable || busy, "aria-label": model.displayName, onChange: toggleShown }), _jsx("span", { className: "protocom-model-dot" }), _jsx("span", { className: "protocom-model-name", children: model.displayName })] }), meta.length === 0 ? null : _jsx("span", { className: "protocom-model-meta", children: meta }), _jsx("span", { className: "protocom-model-spacer" }), shown
                ? (_jsx("span", { className: "protocom-ctx", role: "group", "aria-label": t('contextTitle'), children: ladder.map((length) => {
                        const on = chosen.includes(length);
                        const last = on && chosen.length === 1;
                        return (_jsx("button", { type: "button", className: on ? 'is-on' : undefined, "aria-pressed": on, disabled: !writable || busy || last, title: last ? t('contextLastTitle') : t('contextTitle'), onClick: () => {
                                writeContexts(on
                                    ? chosen.filter(value => value !== length)
                                    : [...chosen, length].sort((left, right) => left - right));
                            }, children: contextLabel(length) }, length));
                    }) }))
                : null, _jsx("button", { type: "button", className: images ? 'protocom-vision is-on' : 'protocom-vision', disabled: !writable || busy, "aria-pressed": images, title: t('visionTitle'), onClick: toggleVision, children: images ? t('tagVision') : t('visionOff') }), _jsx("button", { type: "button", className: starred ? 'protocom-model-star is-on' : 'protocom-model-star', disabled: !writable || busy, "aria-pressed": starred, title: starred ? t('unstarTitle') : t('starTitle'), onClick: toggleStar, children: "\u2605" })] }));
}
/** One group's card: credentials, its own menu models, and its balance. */
function GroupCard({ groupKey, group, family, credential, writable, revision, probe, hidden, recommended, contexts, vision, operations, t, onChanged, onProbe }) {
    const ref = family.keyRef(groupKey);
    const [keyDraft, setKeyDraft] = useState('');
    const [keyBusy, setKeyBusy] = useState(false);
    const [keyMessage, setKeyMessage] = useState(undefined);
    const [cardError, setCardError] = useState(undefined);
    const [busy, setBusy] = useState(false);
    const [open, setOpen] = useState(true);
    const [filter, setFilter] = useState('');
    const [balance, setBalance] = useState({ phase: 'idle', data: undefined, error: undefined });
    const write = (ops) => {
        setCardError(undefined);
        setBusy(true);
        void operations.writeSettings(ops, revision)
            .then(async (outcome) => {
            if (outcome.kind !== 'written') {
                setCardError(outcome.message);
                // A conflict means the card's snapshot is stale: reload so the next
                // toggle rides the current revision instead of wedging on the old one.
            }
            await onChanged();
        })
            .finally(() => { setBusy(false); });
    };
    const loadBalance = async () => {
        setBalance(previous => ({ ...previous, phase: 'loading', error: undefined }));
        try {
            const response = await fetch(`${family.telemetryPath}?group=${groupKey}`);
            // The route is fenced by the Host carrier, so an unauthenticated request
            // or a profile without the connection service answers 401/403/404. That
            // is "no account surface here", not a failure worth a red message.
            const unavailable = family.telemetryKind === 'quota' ? t('quotaUnavailable') : t('balanceUnavailable');
            if (response.status === 401 || response.status === 403 || response.status === 404) {
                setBalance({ phase: 'error', data: undefined, error: unavailable });
                return;
            }
            if (!response.ok) {
                const body = await response.json().catch(() => undefined);
                throw new Error(typeof body?.error === 'string' ? body.error : `HTTP ${response.status}`);
            }
            // The body is a trust boundary: re-validate rather than asserting, so a
            // malformed reply cannot reach toFixed/slice and crash the strip.
            const raw = await response.json();
            const data = family.telemetryKind === 'quota' ? parseGoUsage(raw) : parseBalanceView(raw);
            if (data === undefined)
                throw new Error(unavailable);
            setBalance({ phase: 'ready', data, error: undefined });
        }
        catch (error) {
            setBalance({ phase: 'error', data: undefined, error: error instanceof Error ? error.message : String(error) });
        }
    };
    const balanceVisible = group.enabled && group.showBalance;
    useEffect(() => {
        if (balanceVisible && balance.phase === 'idle')
            void loadBalance();
        // Loading once per enablement is the intent; the strip re-reads on Refresh.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [balanceVisible]);
    const saveKey = () => {
        if (keyDraft.length === 0 || keyBusy)
            return;
        setKeyBusy(true);
        setKeyMessage(undefined);
        void operations.storeApiKey(groupKey, ref, keyDraft, revision)
            .then(async (failure) => {
            if (failure !== undefined) {
                setKeyMessage({ kind: 'error', text: failure });
                return;
            }
            setKeyDraft('');
            setKeyMessage({ kind: 'ok', text: t('keySaved') });
            await onChanged();
        })
            .finally(() => { setKeyBusy(false); });
    };
    const credentialConfigured = credential?.configured === true;
    const listing = probe.phase === 'ready' ? probe.models : undefined;
    // The group's own menu, projected exactly as the adapter projects it, so the
    // rows below are the entries the picker will show. Hidden ids stay in the
    // list — that is how one gets un-hidden — and the recommendation orders it.
    const rows = groupCatalog(groupKey, listing?.map((model) => ({
        id: model.id,
        ...model.name === undefined ? {} : { displayName: model.name },
    })), {
        recommended,
        family,
        // Only once the group has actually been interrogated: an unprobed group
        // must not present every other group's models as its own menu.
        registryFallback: probe.phase === 'ready' || probe.phase === 'error',
    });
    const needle = filter.trim().toLowerCase();
    const visibleRows = needle.length === 0
        ? rows
        : rows.filter(row => row.displayName.toLowerCase().includes(needle) || row.ids.some(id => id.toLowerCase().includes(needle)));
    const groupIds = rows.flatMap(row => [...row.ids]);
    const hiddenInGroup = groupIds.filter(id => hidden.includes(id));
    const entryCount = visibleRows.reduce((total, row) => {
        const stored = contexts[identityKey(row.upstreamId, family.registry)];
        const lengths = stored ?? variantLengths(row.contextOptions, group.contextLengths) ?? [row.contextWindow];
        return total + Math.max(1, lengths.length);
    }, 0);
    return (_jsxs("li", { className: group.enabled ? 'protocom-card' : 'protocom-card is-off', children: [_jsxs("div", { className: "protocom-card-head", children: [_jsxs("button", { type: "button", className: "protocom-card-toggle", "aria-expanded": open, title: open ? t('collapse') : t('expand'), onClick: () => { setOpen(!open); }, children: [_jsx("span", { className: "protocom-caret", "aria-hidden": "true", children: open ? '▾' : '▸' }), _jsx("span", { className: "protocom-card-name", children: t(`group${groupKey.charAt(0).toUpperCase()}${groupKey.slice(1)}`) })] }), _jsx("span", { className: "protocom-tag", title: t('protocol'), children: group.protocol }), _jsxs("span", { className: "protocom-head-state", children: [_jsx("span", { className: credentialConfigured ? 'protocom-dot is-on' : 'protocom-dot' }), credentialConfigured ? t('keyConfigured') : t('keyMissing'), _jsxs("label", { className: "protocom-switch", children: [_jsx("input", { type: "checkbox", role: "switch", checked: group.enabled, disabled: !writable || busy, "aria-label": t('enabled'), onChange: () => { write([{ op: 'set', path: ['groups', groupKey, 'enabled'], value: !group.enabled }]); } }), _jsx("span", { className: "protocom-switch-track", children: _jsx("span", { className: "protocom-switch-thumb" }) }), t('enabled')] })] })] }), open
                ? (_jsxs("div", { className: "protocom-card-body", children: [_jsxs("div", { className: "protocom-field", children: [_jsx("span", { className: "protocom-field-label", children: t('apiKey') }), _jsx("input", { type: "password", className: "protocom-input", value: keyDraft, placeholder: credentialConfigured ? t('keyConfigured') : t('keyPlaceholder'), "aria-label": `${t('apiKey')} (${ref})`, disabled: !writable || credential?.writable === false, autoComplete: "new-password", spellCheck: false, onChange: event => { setKeyDraft(event.target.value); } }), _jsx("button", { type: "button", className: "protocom-button protocom-button-primary", disabled: !writable || keyBusy || keyDraft.length === 0, onClick: saveKey, children: keyBusy ? t('savingKey') : t('saveKey') })] }), _jsx("span", { className: "protocom-key-state", children: credentialConfigured ? `${t('keyConfigured')} (${ref})` : `${t('keyMissing')} (${ref})` }), keyMessage === undefined ? null : (_jsx("p", { className: keyMessage.kind === 'ok' ? 'protocom-status' : 'protocom-error', children: keyMessage.kind === 'ok' ? keyMessage.text : `${t('keyFailed')}: ${keyMessage.text}` })), cardError === undefined ? null : _jsx("p", { className: "protocom-error", children: cardError }), _jsxs("div", { className: "protocom-models-head", children: [_jsx("span", { className: "protocom-models-title", children: t('models') }), _jsx("span", { className: "protocom-models-count", children: rows.length === 0
                                        ? ''
                                        : `${rows.length} ${t('modelCount')} · ${entryCount} ${t('menuEntries')}` }), _jsx("span", { className: "protocom-model-spacer" }), _jsx("button", { type: "button", className: "protocom-button", disabled: probe.phase === 'loading' || !writable, onClick: onProbe, children: probe.phase === 'loading' ? t('probing') : t('probeRefresh') }), _jsx("button", { type: "button", className: "protocom-button", disabled: !writable || busy || hiddenInGroup.length === 0, onClick: () => {
                                        const next = hidden.filter(id => !groupIds.includes(id));
                                        write(next.length === 0
                                            ? [{ op: 'unset', path: ['hiddenModels'] }]
                                            : [{ op: 'set', path: ['hiddenModels'], value: next }]);
                                    }, children: t('selectAll') }), _jsx("button", { type: "button", className: "protocom-button", disabled: !writable || busy || hiddenInGroup.length >= groupIds.length, onClick: () => { write([{ op: 'set', path: ['hiddenModels'], value: [...new Set([...hidden, ...groupIds])] }]); }, children: t('selectNone') })] }), _jsx("p", { className: "protocom-notice", children: t('modelsHint') }), probe.phase === 'error' ? (_jsx("p", { className: "protocom-error", children: `${t('probeFailed')}: ${probe.message}` })) : null, probe.phase === 'ready' && probe.models.length === 0 ? _jsx("p", { className: "protocom-notice", children: t('probeEmpty') }) : null, probe.phase !== 'ready' && !credentialConfigured ? _jsx("p", { className: "protocom-notice", children: t('probeNeedsKey') }) : null, probe.phase === 'error' ? _jsx("p", { className: "protocom-notice", children: t('listingFallback') }) : null, rows.length > FILTER_THRESHOLD
                            ? (_jsx("input", { type: "text", className: "protocom-input", value: filter, placeholder: t('filterModels'), "aria-label": t('filterModels'), onChange: event => { setFilter(event.target.value); } }))
                            : null, _jsx("div", { className: "protocom-models", children: visibleRows.map(row => (_jsx(ModelRow, { model: row, group: group, family: family, hidden: hidden, recommended: recommended, contexts: contexts, vision: vision, writable: writable, busy: busy, t: t, onWrite: write }, row.displayName))) }), _jsxs("details", { className: "protocom-advanced", children: [_jsx("summary", { children: t('probeDetails') }), _jsx("div", { className: "protocom-advanced-body", children: probe.phase === 'ready' && probe.models.length > 0
                                        ? (_jsxs("table", { className: "protocom-probe-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('colModel') }), _jsx("th", { children: t('colId') }), _jsx("th", { children: t('colServed') })] }) }), _jsx("tbody", { children: probe.models.map((model) => (_jsxs("tr", { children: [_jsx("td", { children: matchRegistry(model.id, family.registry)?.displayName
                                                                    ?? (model.name !== undefined && model.name !== model.id ? model.name : model.id) }), _jsx("td", { children: _jsx("span", { className: "protocom-probe-id", children: model.id }) }), _jsx("td", { children: servesChat(model.id, family.refused) ? t('servedYes') : t('servedNo') })] }, model.id))) })] }))
                                        : _jsx("p", { className: "protocom-notice", children: t('probeHint') }) })] }), balanceVisible
                            ? (family.telemetryKind === 'quota'
                                ? (_jsx(QuotaView, { usage: balance.data, phase: balance.phase, error: balance.error, onRefresh: () => { void loadBalance(); }, t: t }))
                                : (_jsx(BalanceView, { group: groupKey, balance: balance.data, phase: balance.phase, error: balance.error, onRefresh: () => { void loadBalance(); }, t: t })))
                            : null] }))
                : null] }));
}
/**
 * Render the Protocom API section content column.
 * `param props - slot-delivered injected dependencies.
 * `returns the section, or null while the shell has not injected yet.
 */
export function ProtocomSection(props) {
    const { operations, t, family, copy } = props;
    if (operations === undefined || t === undefined || family === undefined || copy === undefined)
        return null;
    return _jsx(Loaded, { operations: operations, t: t, family: family, copy: copy });
}
function Loaded({ operations, t, family, copy }) {
    const [state, setState] = useState({ phase: 'loading', credentials: {} });
    const [baseDraft, setBaseDraft] = useState(undefined);
    const [allowCustomDraft, setAllowCustomDraft] = useState(undefined);
    const [baseBusy, setBaseBusy] = useState(false);
    const [baseNotice, setBaseNotice] = useState(undefined);
    const [probes, setProbes] = useState({});
    const load = async () => {
        const view = await operations.describeSettings();
        if (view === undefined) {
            setState({ phase: 'error', credentials: {}, error: 'settings namespace unavailable' });
            return;
        }
        const credentials = await operations.describeCredentials(family.keys.map(key => family.keyRef(key)));
        setState({ phase: 'ready', view, credentials });
    };
    useEffect(() => {
        if (state.phase === 'loading')
            void load();
        // The initial load is the only automatic one; writes reload explicitly.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const baseURL = state.phase === 'ready' ? sectionOf(state.view).baseURL : undefined;
    const runProbe = (groupKey) => {
        setProbes(current => ({ ...current, [groupKey]: { phase: 'loading' } }));
        void operations.discoverModels({
            provider: family.providerOf(groupKey),
            ...baseURL === undefined ? {} : { baseURL },
        }).then((outcome) => {
            setProbes(current => ({
                ...current,
                [groupKey]: outcome.kind === 'found'
                    ? { phase: 'ready', models: outcome.models }
                    : { phase: 'error', message: outcome.message },
            }));
        });
    };
    const section = state.phase === 'ready' ? sectionOf(state.view) : {};
    // One interrogation per group that can answer: a disabled group has no route
    // and a keyless one has no credential, and the Host refuses both — that is a
    // refusal to show as a hint, not as an error banner on page load.
    const probeKey = family.keys
        .filter(key => groupValueOf(section, key, family).enabled
        && state.credentials[family.keyRef(key)]?.configured === true
        && probes[key] === undefined)
        .join(',');
    useEffect(() => {
        for (const key of probeKey.length === 0 ? [] : probeKey.split(','))
            void runProbe(key);
        // Probing once per group that becomes answerable is the intent; a manual
        // refresh goes through the card's own button.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [probeKey]);
    if (state.phase === 'loading')
        return _jsx("p", { className: "protocom-notice", children: t('loading') });
    if (state.phase === 'error') {
        return (_jsxs("div", { className: "protocom-section", children: [_jsx("p", { className: "protocom-error", children: `${t('loadFailed')}: ${state.error ?? ''}` }), _jsx("button", { type: "button", className: "protocom-button", onClick: () => { void load(); }, children: t('retry') })] }));
    }
    const view = state.view;
    const revision = view?.revision;
    const writable = revision !== undefined;
    const allowCustom = allowCustomDraft ?? section.allowCustomBaseURL ?? false;
    const applyBaseURL = () => {
        if (baseDraft === undefined || baseBusy)
            return;
        let origin;
        try {
            origin = new URL(baseDraft).origin;
        }
        catch {
            origin = undefined;
        }
        const needsCustom = origin !== undefined && origin !== family.origin;
        if (needsCustom && !allowCustom) {
            setBaseNotice({ kind: 'error', text: t('allowCustomRequired') });
            return;
        }
        setBaseBusy(true);
        setBaseNotice(undefined);
        // Both fields ride one atomic write so they can never diverge, and applying
        // the shipped endpoint *clears* the confirmation instead of leaving a
        // sticky opt-in that a later single-field write could ride on.
        void operations.writeSettings(needsCustom
            ? [
                { op: 'set', path: ['allowCustomBaseURL'], value: true },
                { op: 'set', path: ['baseURL'], value: baseDraft },
            ]
            : [
                { op: 'unset', path: ['allowCustomBaseURL'] },
                { op: 'set', path: ['baseURL'], value: baseDraft },
            ], revision)
            .then(async (outcome) => {
            if (outcome.kind !== 'written') {
                setBaseNotice({ kind: 'error', text: outcome.message });
                await load();
                return;
            }
            setBaseNotice({ kind: 'ok', text: t('saved') });
            await load();
        })
            .finally(() => { setBaseBusy(false); });
    };
    return (_jsxs("div", { className: "protocom-section", children: [_jsx("h2", { className: "protocom-title", children: copy.title }), _jsx("p", { className: "protocom-intro", children: copy.intro }), writable ? null : _jsx("p", { className: "protocom-notice", children: t('readOnly') }), _jsx("ul", { className: "protocom-groups", children: family.keys.map(key => (_jsx(GroupCard, { groupKey: key, family: family, group: groupValueOf(section, key, family), credential: state.credentials[family.keyRef(key)], writable: writable, revision: revision, probe: probes[key] ?? { phase: 'idle' }, hidden: section.hiddenModels ?? [], recommended: section.recommendedModels ?? family.recommended, contexts: section.modelContexts ?? {}, vision: section.visionModels ?? {}, operations: operations, t: t, onChanged: load, onProbe: () => { runProbe(key); } }, key))) }), _jsxs("details", { className: "protocom-advanced", children: [_jsx("summary", { children: t('advanced') }), _jsxs("div", { className: "protocom-advanced-body", children: [_jsx("span", { className: "protocom-field-label", children: t('baseUrl') }), _jsx("input", { type: "text", className: "protocom-input", value: baseDraft ?? baseURL ?? '', "aria-label": t('baseUrl'), disabled: !writable, onChange: event => { setBaseDraft(event.target.value); } }), _jsxs("label", { className: "protocom-check", children: [_jsx("input", { type: "checkbox", checked: allowCustom, disabled: !writable, "aria-label": t('allowCustom'), onChange: event => { setAllowCustomDraft(event.target.checked); } }), t('allowCustom')] }), _jsx("p", { className: "protocom-notice", children: t('allowCustomHint') }), _jsx("button", { type: "button", className: "protocom-button", disabled: !writable || baseBusy, onClick: applyBaseURL, children: baseBusy ? t('applying') : t('apply') })] }), baseNotice === undefined ? null : (_jsx("p", { className: baseNotice.kind === 'ok' ? 'protocom-status' : 'protocom-error', children: baseNotice.text }))] })] }));
}
