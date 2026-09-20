/**
 * Register a {@link ProtocomAdapter} for the four Protocom official API group
 * routes on `ctx.llm`, with connection facts resolved per request instead of
 * frozen at load: the plugin layers its `cordis.yml` entry config under the
 * optional `protocom-api` user-settings section (`ctx.settings`) and resolves
 * each group's API key through the optional credential seam
 * (`ctx.credentials`), so a changed endpoint, group set, or key reaches the
 * very next request without restarting anything. The route set itself is the
 * one registration-captured fact — it re-registers in place via
 * `handle.replace` when the enabled groups change. The balance endpoint rides
 * the optional `webServer` service and answers loopback clients only.
 *
 * @module dsh-protocom-api
 */
import { assertUsableApiKey, LlmError } from '@deepseek-ai/dsh-llm';
import { ProtocomAdapter } from "./adapter.js";
import { BalanceService, balanceRouteHandler } from "./balance.js";
import { Config, GROUP_KEYS, GROUP_DEFAULTS, providerOf, resolveAdapterOptions } from "./config.js";
import { discoverModels } from "./discovery.js";
export { ProtocomAdapter } from "./adapter.js";
export { BalanceService, balanceRouteHandler, parseRateMultiplier, parseUsage } from "./balance.js";
export { Config, DEFAULT_BASE_URL, GROUP_DEFAULTS, GROUP_KEYS, groupOf, providerOf, resolveAdapterOptions } from "./config.js";
export { decodeVariantId, encodeVariantId, stripVariantId, variantLengths } from "./context-variants.js";
export { discoverModels, fetchUpstreamModels, parseModelsListing } from "./discovery.js";
export { catalogEntry, contextLabel, DEFAULT_RECOMMENDED, displayNameWithContext, FALLBACK_CONTEXT_WINDOW, identityKey, matchRegistry, modelIdentities, REGISTRY, } from "./model-registry.js";
export const name = 'protocom-api';
export const inject = ['llm'];
const NS = 'protocom-api';
export function apply(ctx, config) {
    let current = () => config;
    let lastRaw;
    let lastGood;
    const options = () => {
        const raw = current();
        if (raw === lastRaw && lastGood !== undefined)
            return lastGood;
        try {
            const next = resolveAdapterOptions(raw);
            lastRaw = raw;
            lastGood = next;
            return next;
        }
        catch (error) {
            // Static composition resolves before anything registers, so this branch
            // only sees a live settings snapshot failing a beyond-schema bound:
            // keep serving the last good facts and say so once per bad snapshot.
            if (lastGood === undefined)
                throw error;
            lastRaw = raw;
            ctx.logger.error('protocom-api: keeping the last good configuration after an invalid settings section');
            ctx.logger.error(error);
            return lastGood;
        }
    };
    options();
    const resolveApiKey = async (group) => {
        // Every credential fact comes from the caller's snapshot, so a rejected
        // settings generation cannot leak its key onto the previous endpoint.
        const ref = group.apiKeyRef;
        if (ref === undefined) {
            throw new LlmError(`protocom-api: no API key configured for provider route "${group.provider}";`
                + ` set groups.${group.key}.apiKey in the "${NS}" settings section to a credential reference`, 'MISSING_CREDENTIAL');
        }
        const credentials = ctx.get('credentials');
        if (credentials !== undefined) {
            const hit = await credentials.resolve(ref);
            if (hit?.value !== undefined)
                return assertUsableApiKey(hit.value, 'dsh-protocom-api', ref);
        }
        const ambient = process.env[ref];
        if (ambient !== undefined && ambient.length > 0) {
            return assertUsableApiKey(ambient, 'dsh-protocom-api', ref);
        }
        throw new LlmError(`protocom-api: no API key for provider route "${group.provider}"; store ${ref} through the credentials`
            + ` service, or export ${ref} in the launching environment`, 'MISSING_CREDENTIAL');
    };
    const adapter = new ProtocomAdapter({
        options,
        resolveApiKey,
        // Optional seam, like credentials: a deployment without the attachment
        // service still runs, it just refuses image input instead of dropping it.
        resolveAttachments: () => ctx.get('attachments'),
    });
    const balance = new BalanceService({ options, resolveApiKey });
    let syncRoutes = () => { };
    ctx.effect(() => {
        const directory = ctx.llm.registerConfigurableProviders(GROUP_KEYS.map(key => ({
            provider: providerOf(key),
            displayName: GROUP_DEFAULTS[key].displayName,
            settingsNs: NS,
            settingsPath: ['groups', key],
        })));
        const discovery = ctx.llm.registerModelDiscovery(NS, (request, signal) => discoverModels(request, signal, {
            baseURL: () => options().baseURL,
            resolveApiKey: async (provider) => {
                const group = [...options().groups.values()].find(candidate => candidate.provider === provider);
                if (group === undefined)
                    return undefined;
                if (!group.enabled) {
                    throw new Error(`protocom-api: group "${group.key}" is disabled; toggle it on in the "${NS}" settings section before discovering models`);
                }
                return await resolveApiKey(group);
            },
        }));
        // The adapter registers lazily: `registerAdapter` refuses an empty route
        // set, so an all-disabled configuration mounts nothing; the first enabled
        // configuration registers, and every later change is an atomic `replace`
        // (which legally accepts the empty set), never a dispose-then-register
        // that would publish a gap.
        let registration;
        const sync = () => {
            const routes = [...options().groups.values()]
                .filter(group => group.enabled)
                .map(group => group.provider);
            if (registration === undefined) {
                if (routes.length === 0)
                    return;
                registration = ctx.llm.registerAdapter(routes, adapter);
            }
            else {
                registration.replace(routes);
            }
        };
        syncRoutes = sync;
        sync();
        return () => {
            syncRoutes = () => { };
            registration?.();
            directory();
            discovery();
        };
    });
    ctx.inject(['settings'], (settingsCtx) => {
        settingsCtx.settings.installSection(ctx, NS, Config, config, {
            setSource: (source) => {
                current = source;
            },
            onChange: () => {
                syncRoutes();
                adapter.invalidateListings();
                balance.invalidate();
            },
        });
    });
    ctx.inject(['webServer'], (webCtx) => {
        webCtx.effect(() => webCtx.webServer.register({
            kind: 'exact',
            path: '/api/protocom-api/balance',
            handler: balanceRouteHandler(balance, { options, resolveApiKey }),
        }));
    });
}
