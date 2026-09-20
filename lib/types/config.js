/**
 * Plugin config, validated by the same-named schemastery schema and doubling
 * as the `protocom-api` settings-section shape. The `groups` dict is keyed by
 * the four fixed group keys; each group becomes one provider route
 * (`protocom-<key>`) when enabled, with its own credential reference.
 *
 * @module dsh-protocom-api/config
 */
import z from '@deepseek-ai/schemastery';
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { DEFAULT_BASE_URL, DEFAULT_BASE_URL_ORIGIN, GROUP_DEFAULTS, GROUP_KEYS, providerOf } from "./groups.js";
import { DEFAULT_RECOMMENDED, identityKey } from "./model-registry.js";
export { DEFAULT_BASE_URL, DEFAULT_BASE_URL_ORIGIN, GROUP_DEFAULTS, GROUP_KEYS, groupOf, providerOf } from "./groups.js";
/**
 * Idle interval after which one provider stream is aborted. Mirrors the
 * first-party adapters' watchdog default so a stalled endpoint cannot pin a
 * request — and its socket and agent step — open forever.
 */
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000;
/**
 * The only credential references this plugin resolves: its own namespaced
 * environment-variable names. An open shape let a rewritten `baseURL` pair any
 * `process.env` name with an arbitrary endpoint, turning the environment
 * fallback into an exfiltration primitive.
 */
export const PROTOCOM_CREDENTIAL_REF = /^PROTOCOM_[A-Z0-9_]+$/;
const group = z.object({
    enabled: z.boolean().default(false),
    apiKey: z.string().role('credential-ref'),
    protocol: z.union(['chat-completions', 'responses']),
    contextLengths: z.array(z.number().step(1).min(1)),
    showBalance: z.boolean().default(true),
});
/** Runtime schema for {@link Config}. */
export const Config = z.object({
    baseURL: z.string().default(DEFAULT_BASE_URL),
    allowCustomBaseURL: z.boolean(),
    streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
    groups: z.dict(group).default({}),
    hiddenModels: z.array(z.string()).default([]),
    recommendedModels: z.array(z.string()).default([...DEFAULT_RECOMMENDED]),
    modelContexts: z.dict(z.array(z.number().step(1).min(1))).default({}),
});
/**
 * The one explicit resolve step from raw config to validated connection
 * facts. Programmatic construction may bypass Schemastery normalization, so
 * every bound is re-judged here.
 * @param config - raw plugin config or resolved settings snapshot.
 * @returns validated connection facts for all four groups.
 */
export function resolveAdapterOptions(config) {
    const baseURL = resolveBaseURL((config.baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, '').replace(/\/v1$/, ''));
    // Origin pin: with no explicit confirmation, the stored credential may only
    // travel to the endpoint this adapter ships for. This is the difference
    // between "the key is encrypted in transit" and "the key cannot be
    // redirected by a single settings write at all".
    if (config.allowCustomBaseURL !== true && new URL(baseURL).origin !== DEFAULT_BASE_URL_ORIGIN) {
        throw new Error(`protocom-api: baseURL "${baseURL}" points away from the shipped endpoint (${DEFAULT_BASE_URL_ORIGIN});`
            + ' set allowCustomBaseURL: true to confirm this deployment really sends its API key there');
    }
    const streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS;
    if (!Number.isFinite(streamIdleTimeoutMs) || streamIdleTimeoutMs <= 0 || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) {
        throw new Error(`protocom-api: streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`);
    }
    const supplied = config.groups ?? {};
    for (const key of Object.keys(supplied)) {
        if (!GROUP_KEYS.includes(key)) {
            throw new Error(`protocom-api: unknown group "${key}"; expected one of ${GROUP_KEYS.join(', ')}`);
        }
    }
    const groups = new Map();
    for (const key of GROUP_KEYS) {
        const source = supplied[key] ?? {};
        const defaults = GROUP_DEFAULTS[key];
        if (source.contextLengths !== undefined) {
            if (source.contextLengths.some(length => !Number.isSafeInteger(length) || length <= 0)) {
                throw new Error(`protocom-api: group "${key}" contextLengths must be positive integers`);
            }
            if (new Set(source.contextLengths).size !== source.contextLengths.length) {
                throw new Error(`protocom-api: group "${key}" contextLengths must not contain duplicates`);
            }
        }
        // A group's shipped ladder (StepFun's published 200K/256K/400K/1M) applies
        // when the deployment has not chosen its own.
        const effectiveLengths = source.contextLengths ?? defaults.contextLengths;
        let apiKeyRef;
        if (source.apiKey !== undefined) {
            // Namespacing is a security bound, not a style rule: the reference is
            // what the `process.env` fallback reads, so an open shape reaches any
            // environment variable the launching process holds.
            if (!PROTOCOM_CREDENTIAL_REF.test(source.apiKey)) {
                throw new Error(`protocom-api: group "${key}" apiKey must match ${String(PROTOCOM_CREDENTIAL_REF)}`);
            }
            try {
                apiKeyRef = credentialRef(source.apiKey);
            }
            catch (error) {
                throw new Error(`protocom-api: group "${key}" apiKey is not a valid credential reference`, { cause: error });
            }
        }
        groups.set(key, {
            key,
            provider: providerOf(key),
            displayName: defaults.displayName,
            enabled: source.enabled ?? false,
            protocol: source.protocol ?? defaults.protocol,
            ...apiKeyRef === undefined ? {} : { apiKeyRef },
            ...effectiveLengths === undefined ? {} : { contextLengths: [...effectiveLengths] },
            showBalance: source.showBalance ?? true,
        });
    }
    const hidden = config.hiddenModels ?? [];
    for (const id of hidden) {
        if (typeof id !== 'string' || id.length === 0) {
            throw new Error('protocom-api: hiddenModels entries must be non-empty model ids');
        }
    }
    const recommended = config.recommendedModels ?? DEFAULT_RECOMMENDED;
    for (const id of recommended) {
        if (typeof id !== 'string' || id.length === 0) {
            throw new Error('protocom-api: recommendedModels entries must be non-empty model ids');
        }
    }
    const contexts = new Map();
    for (const [id, lengths] of Object.entries(config.modelContexts ?? {})) {
        if (id.length === 0) {
            throw new Error('protocom-api: modelContexts keys must be non-empty model ids');
        }
        if (lengths.length === 0) {
            throw new Error(`protocom-api: modelContexts["${id}"] must list at least one length`);
        }
        if (lengths.some(length => !Number.isSafeInteger(length) || length <= 0)) {
            throw new Error(`protocom-api: modelContexts["${id}"] lengths must be positive integers`);
        }
        if (new Set(lengths).size !== lengths.length) {
            throw new Error(`protocom-api: modelContexts["${id}"] lengths must not repeat`);
        }
        // Keyed by identity so an alias spelling configures the same model once.
        contexts.set(identityKey(id), [...lengths].sort((left, right) => left - right));
    }
    return {
        baseURL,
        streamIdleTimeoutMs,
        groups,
        modelContexts: contexts,
        hiddenModels: new Set(hidden),
        // Aliases collapse to one key, so picking either id recommends the model
        // once and the ordering cannot depend on which spelling was stored.
        recommendedModels: [...new Set(recommended.map(identityKey))],
    };
}
/**
 * Whether a WHATWG-normalized hostname names the local loopback authority.
 * The harness keeps its own copy package-internal, so this mirrors it: the
 * judgement must run on the parsed hostname (WHATWG rewrites `2130706433` and
 * `0x7f000001` to `127.0.0.1`), never on the raw string.
 */
function isLoopbackHostname(hostname) {
    if (hostname === 'localhost' || hostname === '[::1]')
        return true;
    const parts = hostname.split('.');
    return parts.length === 4
        && parts[0] === '127'
        && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
/**
 * Validate one endpoint root. Plain http is allowed only for a loopback host,
 * so the stored bearer token can never be sent in the clear to a remote
 * endpoint; userinfo, query strings, and fragments are refused because they
 * let a value that reads as one endpoint actually resolve to another.
 * @param raw - endpoint root, already stripped of trailing slashes and `/v1`.
 * @returns the same string once every bound passes.
 */
export function resolveBaseURL(raw) {
    let url;
    try {
        url = new URL(raw);
    }
    catch {
        throw new Error('protocom-api: baseURL must be an absolute http(s) URL');
    }
    if (url.username !== '' || url.password !== '') {
        throw new Error('protocom-api: baseURL must not carry userinfo');
    }
    if (url.search !== '' || url.hash !== '') {
        throw new Error('protocom-api: baseURL must not carry a query string or fragment');
    }
    if (url.protocol === 'http:' ? !isLoopbackHostname(url.hostname) : url.protocol !== 'https:') {
        throw new Error('protocom-api: baseURL must use https; plain http is allowed only for a loopback host');
    }
    return raw;
}
