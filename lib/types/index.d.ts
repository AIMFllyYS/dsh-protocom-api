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
 * the optional `connection` service so the active carrier's own trust fence
 * (Host/Origin plus browser auth, or the desktop IPC boundary) guards it.
 *
 * @module dsh-protocom-api
 */
import type { Context } from '@deepseek-ai/cordis';
import { Config } from './config.ts';
export { ProtocomAdapter } from './adapter.ts';
export type { ProtocomAdapterOptions } from './adapter.ts';
export { BalanceService, balanceFetchHandler, parseBalanceView, parseRateMultiplier, parseUsage } from './balance.ts';
export type { BalanceHooks, GroupBalance } from './balance.ts';
export { normalizeUsage } from './balance-view.ts';
export { Config, DEFAULT_BASE_URL, DEFAULT_BASE_URL_ORIGIN, DEFAULT_STREAM_IDLE_TIMEOUT_MS, GROUP_DEFAULTS, GROUP_KEYS, groupOf, PROTOCOM_CREDENTIAL_REF, providerOf, resolveAdapterOptions, resolveBaseURL, } from './config.ts';
export type { GroupConfig, GroupKey, Protocol, ResolvedGroup, ResolvedProtocomOptions } from './config.ts';
export { decodeVariantId, encodeVariantId, stripVariantId, variantLengths } from './context-variants.ts';
export { discoverModels, endpointOrigin, fetchUpstreamModels, parseModelsListing } from './discovery.ts';
export type { DiscoveryHooks } from './discovery.ts';
export { catalogEntry, CONTEXT_LADDER, contextChoicesFor, contextLabel, DEFAULT_RECOMMENDED, displayNameWithContext, FALLBACK_CONTEXT_WINDOW, identityKey, matchRegistry, modelIdentities, REGISTRY, } from './model-registry.ts';
export type { CatalogModel, ModelIdentity, RegistryEntry, RegistryPricing, RegistryReasoning, UpstreamModel, } from './model-registry.ts';
export declare const name = "protocom-api";
export declare const inject: string[];
export declare function apply(ctx: Context, config: Config): void;
