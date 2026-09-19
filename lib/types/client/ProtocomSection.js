import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Protocom API settings section: one card per group (enable switch, API key,
 * read-only protocol tag, model probe with context-variant checkboxes, and
 * the balance strip), plus the advanced baseURL override. Every mutation
 * writes through the wire (settings.mutate / credentials.set); the page
 * reloads its snapshot after each landed write.
 */
import { useEffect, useState } from 'react';
import { defaultKeyRef, GROUP_DEFAULTS, GROUP_KEYS, providerOf } from "../groups.js";
import { catalogEntry, contextLabel } from "../model-registry.js";
import { toggleLength, variantChoicesFor } from "./variants.js";
function sectionOf(view) {
    const value = view?.value;
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function groupValueOf(section, key) {
    const raw = section.groups?.[key] ?? {};
    return {
        enabled: raw.enabled ?? false,
        protocol: raw.protocol ?? GROUP_DEFAULTS[key].protocol,
        contextLengths: raw.contextLengths ?? [],
        showBalance: raw.showBalance ?? true,
    };
}
function formatAmount(value, unit) {
    return unit === 'USD' ? `$${value.toFixed(2)}` : `${value}${unit === undefined ? '' : ` ${unit}`}`;
}
/** The balance strip of one group card. */
function BalanceView({ group, balance, phase, error, onRefresh, t }) {
    const items = [];
    if (balance !== undefined) {
        if (balance.remaining !== undefined)
            items.push([t('remaining'), formatAmount(balance.remaining, balance.unit)]);
        if (balance.limit !== undefined)
            items.push([t('limit'), formatAmount(balance.limit, balance.unit)]);
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
    return (_jsxs("div", { className: "protocom-balance", children: [_jsxs("div", { className: "protocom-balance-head", children: [_jsx("span", { children: t('balance') }), _jsx("button", { type: "button", className: "protocom-button", disabled: phase === 'loading', onClick: onRefresh, children: phase === 'loading' ? t('refreshing') : t('refresh') })] }), phase === 'error' ? _jsx("p", { className: "protocom-error", children: `${t('loadFailed')}: ${error ?? ''}` }) : null, phase === 'ready' && items.length === 0 ? _jsx("p", { className: "protocom-notice", children: t('none') }) : null, items.length === 0 ? null : (_jsx("div", { className: "protocom-balance-grid", children: items.map(([label, value]) => (_jsxs("span", { className: "protocom-balance-item", children: [`${label} `, _jsx("b", { children: value })] }, label))) }))] }));
}
/** One group's card. */
function GroupCard({ groupKey, group, credential, writable, revision, baseURL, operations, t, onChanged }) {
    const ref = defaultKeyRef(groupKey);
    const [keyDraft, setKeyDraft] = useState('');
    const [keyBusy, setKeyBusy] = useState(false);
    const [keyMessage, setKeyMessage] = useState(undefined);
    const [cardError, setCardError] = useState(undefined);
    const [probe, setProbe] = useState({ phase: 'idle' });
    const [balance, setBalance] = useState({ phase: 'idle', data: undefined, error: undefined });
    const write = async (ops) => {
        setCardError(undefined);
        const outcome = await operations.writeSettings(ops, revision);
        if (outcome.kind !== 'written') {
            setCardError(outcome.message);
            // A conflict means the card's snapshot is stale: reload so the next
            // toggle rides the current revision instead of wedging on the old one.
            await onChanged();
            return;
        }
        await onChanged();
    };
    const loadBalance = async () => {
        setBalance(previous => ({ ...previous, phase: 'loading', error: undefined }));
        try {
            const response = await fetch(`/api/protocom-api/balance?group=${groupKey}`);
            if (!response.ok) {
                const body = await response.json().catch(() => undefined);
                throw new Error(body?.error ?? `HTTP ${response.status}`);
            }
            const data = await response.json();
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
        void operations.storeApiKey(groupKey, ref, keyDraft)
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
    const runProbe = () => {
        if (probe.phase === 'loading')
            return;
        setProbe({ phase: 'loading' });
        void operations.discoverModels({
            provider: providerOf(groupKey),
            ...baseURL === undefined ? {} : { baseURL },
        }).then((outcome) => {
            setProbe(outcome.kind === 'found'
                ? { phase: 'ready', models: outcome.models }
                : { phase: 'error', message: outcome.message });
        });
    };
    const credentialConfigured = credential?.configured === true;
    return (_jsxs("li", { className: "protocom-card", children: [_jsxs("div", { className: "protocom-card-head", children: [_jsx("span", { className: "protocom-card-name", children: t(`group${groupKey.charAt(0).toUpperCase()}${groupKey.slice(1)}`) }), _jsx("span", { className: "protocom-tag", title: t('protocol'), children: group.protocol }), _jsxs("label", { className: "protocom-toggle", children: [_jsx("input", { type: "checkbox", checked: group.enabled, disabled: !writable, onChange: () => { void write([{ op: 'set', path: ['groups', groupKey, 'enabled'], value: !group.enabled }]); } }), t('enabled')] })] }), _jsxs("div", { className: "protocom-field", children: [_jsx("span", { className: "protocom-field-label", children: t('apiKey') }), _jsx("input", { type: "password", className: "protocom-input", value: keyDraft, placeholder: credentialConfigured ? t('keyConfigured') : t('keyPlaceholder'), "aria-label": `${t('apiKey')} (${ref})`, disabled: !writable || credential?.writable === false, onChange: event => { setKeyDraft(event.target.value); } }), _jsx("button", { type: "button", className: "protocom-button", disabled: !writable || keyBusy || keyDraft.length === 0, onClick: saveKey, children: keyBusy ? t('savingKey') : t('saveKey') })] }), _jsx("span", { className: "protocom-key-state", children: credentialConfigured ? `${t('keyConfigured')} (${ref})` : `${t('keyMissing')} (${ref})` }), keyMessage === undefined ? null : (_jsx("p", { className: keyMessage.kind === 'ok' ? 'protocom-status' : 'protocom-error', children: keyMessage.kind === 'ok' ? keyMessage.text : `${t('keyFailed')}: ${keyMessage.text}` })), cardError === undefined ? null : _jsx("p", { className: "protocom-error", children: cardError }), _jsx("div", { className: "protocom-field", children: _jsx("button", { type: "button", className: "protocom-button", disabled: probe.phase === 'loading', onClick: runProbe, children: probe.phase === 'loading' ? t('probing') : t('probe') }) }), probe.phase === 'error' ? _jsx("p", { className: "protocom-error", children: `${t('probeFailed')}: ${probe.message}` }) : null, probe.phase === 'ready' && probe.models.length === 0 ? _jsx("p", { className: "protocom-notice", children: t('probeEmpty') }) : null, probe.phase === 'ready' && probe.models.length > 0
                ? (_jsxs(_Fragment, { children: [_jsxs("table", { className: "protocom-probe-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t('colModel') }), _jsx("th", { children: t('colId') }), _jsx("th", { children: t('colVariants') })] }) }), _jsx("tbody", { children: probe.models.map((model) => {
                                        const entry = catalogEntry({ id: model.id, ...model.name === undefined ? {} : { displayName: model.name } }, GROUP_DEFAULTS[groupKey].reasoning);
                                        return (_jsxs("tr", { children: [_jsx("td", { children: entry.displayName }), _jsx("td", { children: model.id }), _jsx("td", { children: variantChoicesFor(model.id).map(length => (_jsxs("label", { className: "protocom-variant", children: [_jsx("input", { type: "checkbox", checked: group.contextLengths.includes(length), disabled: !writable, onChange: () => {
                                                                    const next = toggleLength(group.contextLengths, length);
                                                                    void write(next.length === 0
                                                                        ? [{ op: 'unset', path: ['groups', groupKey, 'contextLengths'] }]
                                                                        : [{ op: 'set', path: ['groups', groupKey, 'contextLengths'], value: next }]);
                                                                } }), contextLabel(length)] }, length))) })] }, model.id));
                                    }) })] }), _jsx("p", { className: "protocom-notice", children: t('probeHint') })] }))
                : null, balanceVisible
                ? (_jsx(BalanceView, { group: groupKey, balance: balance.data, phase: balance.phase, error: balance.error, onRefresh: () => { void loadBalance(); }, t: t }))
                : null] }));
}
/**
 * Render the Protocom API section content column.
 * @param props - slot-delivered injected dependencies.
 * @returns the section, or null while the shell has not injected yet.
 */
export function ProtocomSection(props) {
    const { operations, t } = props;
    if (operations === undefined || t === undefined)
        return null;
    return _jsx(Loaded, { operations: operations, t: t });
}
function Loaded({ operations, t }) {
    const [state, setState] = useState({ phase: 'loading', credentials: {} });
    const [baseDraft, setBaseDraft] = useState(undefined);
    const [baseBusy, setBaseBusy] = useState(false);
    const [baseNotice, setBaseNotice] = useState(undefined);
    const load = async () => {
        const view = await operations.describeSettings();
        if (view === undefined) {
            setState({ phase: 'error', credentials: {}, error: 'settings namespace unavailable' });
            return;
        }
        const credentials = await operations.describeCredentials(GROUP_KEYS.map(defaultKeyRef));
        setState({ phase: 'ready', view, credentials });
    };
    useEffect(() => {
        if (state.phase === 'loading')
            void load();
        // The initial load is the only automatic one; writes reload explicitly.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    if (state.phase === 'loading')
        return _jsx("p", { className: "protocom-notice", children: t('loading') });
    if (state.phase === 'error') {
        return (_jsxs("div", { className: "protocom-section", children: [_jsx("p", { className: "protocom-error", children: `${t('loadFailed')}: ${state.error ?? ''}` }), _jsx("button", { type: "button", className: "protocom-button", onClick: () => { void load(); }, children: t('retry') })] }));
    }
    const view = state.view;
    const section = sectionOf(view);
    const revision = view?.revision;
    const writable = revision !== undefined;
    const baseURL = section.baseURL;
    const applyBaseURL = () => {
        if (baseDraft === undefined || baseBusy)
            return;
        setBaseBusy(true);
        setBaseNotice(undefined);
        void operations.writeSettings([{ op: 'set', path: ['baseURL'], value: baseDraft }], revision)
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
    return (_jsxs("div", { className: "protocom-section", children: [_jsx("h2", { className: "protocom-title", children: t('title') }), _jsx("p", { className: "protocom-intro", children: t('intro') }), writable ? null : _jsx("p", { className: "protocom-notice", children: t('readOnly') }), _jsx("ul", { className: "protocom-groups", children: GROUP_KEYS.map(key => (_jsx(GroupCard, { groupKey: key, group: groupValueOf(section, key), credential: state.credentials[defaultKeyRef(key)], writable: writable, revision: revision, baseURL: baseURL, operations: operations, t: t, onChanged: load }, key))) }), _jsxs("details", { className: "protocom-advanced", children: [_jsx("summary", { children: t('advanced') }), _jsxs("div", { className: "protocom-advanced-body", children: [_jsx("span", { className: "protocom-field-label", children: t('baseUrl') }), _jsx("input", { type: "text", className: "protocom-input", value: baseDraft ?? baseURL ?? '', "aria-label": t('baseUrl'), disabled: !writable, onChange: event => { setBaseDraft(event.target.value); } }), _jsx("button", { type: "button", className: "protocom-button", disabled: !writable || baseBusy, onClick: applyBaseURL, children: baseBusy ? t('applying') : t('apply') })] }), baseNotice === undefined ? null : (_jsx("p", { className: baseNotice.kind === 'ok' ? 'protocom-status' : 'protocom-error', children: baseNotice.text }))] })] }));
}
