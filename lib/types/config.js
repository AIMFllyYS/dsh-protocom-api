/**
 * Plugin config, validated by the same-named schemastery schema and doubling
 * as the `protocom-api` settings-section shape. The `groups` dict is keyed by
 * the four fixed group keys; each group becomes one provider route
 * (`protocom-<key>`) when enabled, with its own credential reference.
 *
 * @module dsh-protocom-api/config
 */
import z from '@deepseek-ai/schemastery';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { GROUP_DEFAULTS, GROUP_KEYS, providerOf } from "./groups.js";
export { GROUP_DEFAULTS, GROUP_KEYS, groupOf, providerOf } from "./groups.js";
/** Protocom official API endpoint base. */
export const DEFAULT_BASE_URL = 'https://relay.protocom.org';
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
    groups: z.dict(group).default({}),
});
/**
 * The one explicit resolve step from raw config to validated connection
 * facts. Programmatic construction may bypass Schemastery normalization, so
 * every bound is re-judged here.
 * @param config - raw plugin config or resolved settings snapshot.
 * @returns validated connection facts for all four groups.
 */
export function resolveAdapterOptions(config) {
    const baseURL = (config.baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, '').replace(/\/v1$/, '');
    if (!/^https?:\/\//.test(baseURL)) {
        throw new Error('protocom-api: baseURL must be an http(s) URL');
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
        let apiKeyRef;
        if (source.apiKey !== undefined) {
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
            ...source.contextLengths === undefined ? {} : { contextLengths: [...source.contextLengths] },
            showBalance: source.showBalance ?? true,
        });
    }
    return { baseURL, groups };
}
