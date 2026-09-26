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
import { DEFAULT_BASE_URL } from "./groups.js";
import { DEFAULT_RECOMMENDED, GO_DEFAULT_RECOMMENDED, identityKey } from "./model-registry.js";
import { GO_DEFAULT_BASE_URL, PROTOCOM } from "./family.js";
import { MAX_KEYS_PER_GROUP } from "./key-pool.js";
export { DEFAULT_BASE_URL, DEFAULT_BASE_URL_ORIGIN, GROUP_DEFAULTS, GROUP_KEYS, groupOf, providerOf } from "./groups.js";
export { FAMILIES, GO_CREDENTIAL_REF, GO_DEFAULT_BASE_URL, GO_DEFAULT_BASE_URL_ORIGIN, GO_PROVIDER, OPENCODE_GO, PROTOCOM } from "./family.js";
/**
 * Idle interval after which one provider stream is aborted. Mirrors the
 * first-party adapters' watchdog default so a stalled endpoint cannot pin a
 * request — and its socket and agent step — open forever.
 */
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000;
/**
 * Retry semantics live in their own import-free module because the browser
 * client edits the same numbers: re-exported here so a Host consumer names one
 * module, and asserted below so the browser's own copy of the timer bound cannot
 * drift from the authority.
 */
export { DEFAULT_RETRY_MAX_ATTEMPTS, DEFAULT_RETRY_MAX_DELAY_MS, MAX_RETRY_ATTEMPTS, MAX_RETRY_DELAY_MS, RETRY_INITIAL_DELAY_MS, RETRY_JITTER_RATIO, RETRYABLE_FAILURE_CODES, } from "./retry.js";
import { DEFAULT_RETRY_MAX_ATTEMPTS, DEFAULT_RETRY_MAX_DELAY_MS, MAX_RETRY_ATTEMPTS, MAX_RETRY_DELAY_MS, RETRY_INITIAL_DELAY_MS, } from "./retry.js";
// The browser bundle cannot import the timeout package, so `retry.ts` carries
// its own copy of the timer bound. This is the one place both are visible, so
// the copy is proven equal to the authority at module load rather than trusted.
if (MAX_RETRY_DELAY_MS !== MAX_TIMER_DELAY_MS) {
    throw new Error('dsh-protocom-api: retry.ts MAX_RETRY_DELAY_MS must equal the harness MAX_TIMER_DELAY_MS');
}
/**
 * The only credential references the Protocom family resolves: its own
 * namespaced environment-variable names. An open shape let a rewritten
 * `baseURL` pair any `process.env` name with an arbitrary endpoint, turning
 * the environment fallback into an exfiltration primitive. The Go family's
 * own namespace is `OPENCODE_` (see `family.ts`).
 */
export const PROTOCOM_CREDENTIAL_REF = /^PROTOCOM_[A-Z0-9_]+$/;
const group = z.object({
    enabled: z.boolean().default(false),
    apiKey: z.string().role('credential-ref'),
    protocol: z.union(['chat-completions', 'responses']),
    contextLengths: z.array(z.number().step(1).min(1)),
    showBalance: z.boolean().default(true),
    replayReasoning: z.boolean().default(false),
    assistantTextReplay: z.union(['keep', 'drop', 'user']).default('keep'),
    // No schema default for apiKeys: Schemastery normalizes an absent array to
    // `[]`, and the resolver treats an empty array as "no extra keys", which is
    // exactly the single-key behavior an absent field means.
    apiKeys: z.array(z.string().role('credential-ref')),
    keyPolicy: z.union(['sticky', 'round-robin']).default('sticky'),
});
/**
 * The settings-section schema for one family: every field shares its shape
 * across families, while `baseURL` and `recommendedModels` default to the
 * family's own shipped values.
 */
function sectionSchema(baseURL, recommended) {
    return z.object({
        baseURL: z.string().default(baseURL),
        allowCustomBaseURL: z.boolean(),
        streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
        retryMaxAttempts: z.number().step(1).min(0).max(MAX_RETRY_ATTEMPTS).default(DEFAULT_RETRY_MAX_ATTEMPTS),
        retryMaxDelayMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_RETRY_MAX_DELAY_MS),
        groups: z.dict(group).default({}),
        hiddenModels: z.array(z.string()).default([]),
        recommendedModels: z.array(z.string()).default([...recommended]),
        modelContexts: z.dict(z.array(z.number().step(1).min(1))).default({}),
        visionModels: z.dict(z.boolean()).default({}),
    });
}
/** Settings-section schema for the `protocom-api` namespace. */
export const ProtocomSection = sectionSchema(DEFAULT_BASE_URL, DEFAULT_RECOMMENDED);
/** Settings-section schema for the `opencode-go` namespace. */
export const GoSection = sectionSchema(GO_DEFAULT_BASE_URL, GO_DEFAULT_RECOMMENDED);
/**
 * One Fusion seat. No field carries a schema default: Schemastery normalizes
 * an absent seat to an empty object, and `resolveFusionSeat` reads that empty
 * object as "this seat is unset" — a defaulted `provider: ''` would make the
 * two indistinguishable.
 */
const fusionSeat = z.object({
    provider: z.string(),
    model: z.string(),
    reasoningEffort: z.string(),
});
/**
 * Settings-section schema for the `model-fusion` namespace, and the shape of
 * the plugin's own `fusion` config slice. Only `enabled` defaults here; the
 * seat-required-when-enabled rule is a cross-field constraint Schemastery
 * cannot express, so `resolveFusion` is the authority and runs on every write.
 */
export const FusionSection = z.object({
    enabled: z.boolean().default(false),
    leader: fusionSeat,
    coder: fusionSeat,
    includeForks: z.boolean().default(true),
    applyLeader: z.boolean().default(true),
});
/** Runtime schema for the plugin's yml configuration. */
export const Config = z.object({
    baseURL: z.string().default(DEFAULT_BASE_URL),
    allowCustomBaseURL: z.boolean(),
    streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
    groups: z.dict(group).default({}),
    hiddenModels: z.array(z.string()).default([]),
    recommendedModels: z.array(z.string()).default([...DEFAULT_RECOMMENDED]),
    modelContexts: z.dict(z.array(z.number().step(1).min(1))).default({}),
    visionModels: z.dict(z.boolean()).default({}),
    opencode: GoSection,
    fusion: FusionSection,
});
/**
 * The one explicit resolve step from raw config to validated connection
 * facts. Programmatic construction may bypass Schemastery normalization, so
 * every bound is re-judged here.
 * @param config - raw plugin config or resolved settings snapshot.
 * @returns validated connection facts for all four groups.
 */
export function resolveAdapterOptions(config, family = PROTOCOM) {
    const baseURL = resolveBaseURL((config.baseURL ?? family.baseURL).replace(/\/+$/, '').replace(/\/v1$/, ''));
    // Origin pin: with no explicit confirmation, the stored credential may only
    // travel to the endpoint this adapter ships for. This is the difference
    // between "the key is encrypted in transit" and "the key cannot be
    // redirected by a single settings write at all".
    if (config.allowCustomBaseURL !== true && new URL(baseURL).origin !== family.origin) {
        throw new Error(`${family.ns}: baseURL "${baseURL}" points away from the shipped endpoint (${family.origin});`
            + ' set allowCustomBaseURL: true to confirm this deployment really sends its API key there');
    }
    const streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS;
    if (!Number.isFinite(streamIdleTimeoutMs) || streamIdleTimeoutMs <= 0 || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) {
        throw new Error(`${family.ns}: streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`);
    }
    // Programmatic construction may bypass Schemastery, so every bound is
    // re-judged here exactly as the watchdog's is above.
    const retryMaxAttempts = config.retryMaxAttempts ?? DEFAULT_RETRY_MAX_ATTEMPTS;
    if (!Number.isSafeInteger(retryMaxAttempts) || retryMaxAttempts < 0 || retryMaxAttempts > MAX_RETRY_ATTEMPTS) {
        throw new Error(`${family.ns}: retryMaxAttempts must be an integer between 0 and ${MAX_RETRY_ATTEMPTS}`);
    }
    const retryMaxDelayMs = config.retryMaxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS;
    if (!Number.isFinite(retryMaxDelayMs) || retryMaxDelayMs < RETRY_INITIAL_DELAY_MS || retryMaxDelayMs > MAX_TIMER_DELAY_MS) {
        // Below the first rung the ladder would have to shrink, which the
        // harness policy refuses (`initialDelayMs <= maxDelayMs`); rejecting it
        // here names this plugin's setting instead of failing in the executor.
        throw new Error(`${family.ns}: retryMaxDelayMs must be at least ${RETRY_INITIAL_DELAY_MS} and no greater than ${MAX_TIMER_DELAY_MS}`);
    }
    const supplied = config.groups ?? {};
    for (const key of Object.keys(supplied)) {
        if (!family.keys.includes(key)) {
            throw new Error(`${family.ns}: unknown group "${key}"; expected one of ${family.keys.join(', ')}`);
        }
    }
    const groups = new Map();
    for (const key of family.keys) {
        const source = supplied[key] ?? {};
        const defaults = family.defaults[key] ?? { displayName: key, protocol: 'chat-completions' };
        if (source.contextLengths !== undefined) {
            if (source.contextLengths.some(length => !Number.isSafeInteger(length) || length <= 0)) {
                throw new Error(`${family.ns}: group "${key}" contextLengths must be positive integers`);
            }
            if (new Set(source.contextLengths).size !== source.contextLengths.length) {
                throw new Error(`${family.ns}: group "${key}" contextLengths must not contain duplicates`);
            }
        }
        // A group's shipped ladder (StepFun's published 200K/256K/400K/1M) applies
        // when the deployment has not chosen its own. schemastery normalizes a
        // missing `contextLengths` to `[]` in a described document, so the empty
        // array is "unset", not "zero variants" — a group can never serve none.
        const effectiveLengths = source.contextLengths?.length ? source.contextLengths : defaults.contextLengths;
        // Namespacing is a security bound, not a style rule: the reference is what
        // the `process.env` fallback reads, so an open shape reaches any environment
        // variable the launching process holds. Every entry of the pool is judged,
        // not just the first.
        const prospective = [
            ...source.apiKey === undefined ? [] : [source.apiKey],
            ...source.apiKeys ?? [],
        ];
        if (prospective.length > MAX_KEYS_PER_GROUP + 1) {
            throw new Error(`${family.ns}: group "${key}" configures more than ${MAX_KEYS_PER_GROUP} API keys`);
        }
        const apiKeyRefs = [];
        for (const candidate of prospective) {
            if (typeof candidate !== 'string' || candidate.length === 0) {
                throw new Error(`${family.ns}: group "${key}" apiKeys entries must be non-empty credential references`);
            }
            if (!family.credentialRef.test(candidate)) {
                throw new Error(`${family.ns}: group "${key}" apiKey "${candidate}" must match ${String(family.credentialRef)}`);
            }
            try {
                const ref = credentialRef(candidate);
                // A repeated reference would make the pool hand out the same key twice
                // and make cooldown bookkeeping ambiguous, so it is refused outright.
                if (apiKeyRefs.includes(ref)) {
                    throw new Error(`${family.ns}: group "${key}" repeats the credential reference "${candidate}"`);
                }
                apiKeyRefs.push(ref);
            }
            catch (error) {
                if (error instanceof Error && error.message.includes('repeats the credential reference'))
                    throw error;
                throw new Error(`${family.ns}: group "${key}" apiKey "${candidate}" is not a valid credential reference`, { cause: error });
            }
        }
        const apiKeyRef = apiKeyRefs[0];
        // Re-judged here because programmatic construction bypasses Schemastery,
        // exactly as the watchdog and retry bounds above are.
        const keyPolicy = source.keyPolicy ?? 'sticky';
        if (keyPolicy !== 'sticky' && keyPolicy !== 'round-robin') {
            throw new Error(`${family.ns}: group "${key}" keyPolicy must be "sticky" or "round-robin"`);
        }
        groups.set(key, {
            key,
            provider: family.providerOf(key),
            displayName: defaults.displayName,
            enabled: source.enabled ?? false,
            protocol: source.protocol ?? defaults.protocol,
            ...apiKeyRef === undefined ? {} : { apiKeyRef },
            apiKeyRefs,
            keyPolicy,
            ...effectiveLengths === undefined ? {} : { contextLengths: [...effectiveLengths] },
            showBalance: source.showBalance ?? true,
            replayReasoning: source.replayReasoning ?? false,
            assistantTextReplay: source.assistantTextReplay ?? 'keep',
        });
    }
    const hidden = config.hiddenModels ?? [];
    for (const id of hidden) {
        if (typeof id !== 'string' || id.length === 0) {
            throw new Error(`${family.ns}: hiddenModels entries must be non-empty model ids`);
        }
    }
    const recommended = config.recommendedModels ?? family.recommended;
    for (const id of recommended) {
        if (typeof id !== 'string' || id.length === 0) {
            throw new Error(`${family.ns}: recommendedModels entries must be non-empty model ids`);
        }
    }
    const contexts = new Map();
    for (const [id, lengths] of Object.entries(config.modelContexts ?? {})) {
        if (id.length === 0) {
            throw new Error(`${family.ns}: modelContexts keys must be non-empty model ids`);
        }
        if (lengths.length === 0) {
            throw new Error(`${family.ns}: modelContexts["${id}"] must list at least one length`);
        }
        if (lengths.some(length => !Number.isSafeInteger(length) || length <= 0)) {
            throw new Error(`${family.ns}: modelContexts["${id}"] lengths must be positive integers`);
        }
        if (new Set(lengths).size !== lengths.length) {
            throw new Error(`${family.ns}: modelContexts["${id}"] lengths must not repeat`);
        }
        // Keyed by identity so an alias spelling configures the same model once.
        contexts.set(identityKey(id, family.registry), [...lengths].sort((left, right) => left - right));
    }
    const vision = new Map();
    for (const [id, accepts] of Object.entries(config.visionModels ?? {})) {
        if (id.length === 0) {
            throw new Error(`${family.ns}: visionModels keys must be non-empty model ids`);
        }
        if (typeof accepts !== 'boolean') {
            throw new Error(`${family.ns}: visionModels["${id}"] must be a boolean`);
        }
        // Keyed by identity so a choice made against either alias spelling of one
        // model configures it once.
        vision.set(identityKey(id, family.registry), accepts);
    }
    return {
        family,
        baseURL,
        streamIdleTimeoutMs,
        retryMaxAttempts,
        retryMaxDelayMs,
        groups,
        modelContexts: contexts,
        visionModels: vision,
        hiddenModels: new Set(hidden),
        // Aliases collapse to one key, so picking either id recommends the model
        // once and the ordering cannot depend on which spelling was stored.
        recommendedModels: [...new Set(recommended.map(id => identityKey(id, family.registry)))],
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
