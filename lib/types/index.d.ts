/**
 * Register a {@link ProtocomAdapter} per provider family — the Protocom
 * official API's four group routes and the OpenCode Go subscription's single
 * `opencode-go` route — on `ctx.llm`, with connection facts resolved per
 * request instead of frozen at load: each family layers its `cordis.yml`
 * config slice under its own user-settings section (`protocom-api`,
 * `opencode-go`) and resolves each group's API key through the optional
 * credential seam (`ctx.credentials`), so a changed endpoint, group set, or
 * key reaches the very next request without restarting anything. The route
 * set itself is the one registration-captured fact — it re-registers in place
 * via `handle.replace` when the enabled groups change. The balance/usage
 * endpoints ride the optional `connection` service so the active carrier's
 * own trust fence (Host/Origin plus browser auth, or the desktop IPC
 * boundary) guards them.
 *
 * @module dsh-protocom-api
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Config } from './config.ts';
export { ProtocomAdapter } from './adapter.ts';
export type { ProtocomAdapterOptions } from './adapter.ts';
export { BalanceService, balanceFetchHandler, parseBalanceView, parseRateMultiplier, parseUsage } from './balance.ts';
export type { BalanceHooks, GroupBalance } from './balance.ts';
export { normalizeUsage } from './balance-view.ts';
export { GoUsageService, goUsageFetchHandler } from './go-usage.ts';
export type { GoUsageHooks } from './go-usage.ts';
export { parseGoUsage } from './usage-view.ts';
export type { GoQuotaWindow, GoUsageView } from './usage-view.ts';
export { Config, DEFAULT_BASE_URL, DEFAULT_BASE_URL_ORIGIN, DEFAULT_STREAM_IDLE_TIMEOUT_MS, FAMILIES, GO_CREDENTIAL_REF, GO_DEFAULT_BASE_URL, GO_DEFAULT_BASE_URL_ORIGIN, FusionSection, GoSection, GROUP_DEFAULTS, GROUP_KEYS, groupOf, OPENCODE_GO, PROTOCOM, PROTOCOM_CREDENTIAL_REF, ProtocomSection, providerOf, resolveAdapterOptions, resolveBaseURL, } from './config.ts';
export type { FamilyGroupDefaults, GroupConfig, GroupKey, Protocol, ProviderFamily, ResolvedGroup, ResolvedProtocomOptions, SectionConfig, } from './config.ts';
export { FUSION_NS, resolveFusion, resolveFusionSeat, sameFusionSeat } from './fusion.ts';
export type { FusionConfig, FusionSeatConfig, ResolvedFusion, ResolvedFusionSeat } from './fusion.ts';
export { fuseCallConfig, mountFusion, subagentFacts } from './fusion-host.ts';
export type { FusionSource, SubagentSessionFacts } from './fusion-host.ts';
export { decodeVariantId, encodeVariantId, stripVariantId, variantLengths } from './context-variants.ts';
export { discoverModels, endpointOrigin, fetchUpstreamModels, parseModelsListing } from './discovery.ts';
export type { DiscoveryHooks } from './discovery.ts';
export { acceptsImages, catalogEntry, CONTEXT_LADDER, contextChoicesFor, contextLabel, DEFAULT_RECOMMENDED, displayNameWithContext, FALLBACK_CONTEXT_WINDOW, GO_DEFAULT_RECOMMENDED, GO_REFUSED_MODEL_IDS, GO_REGISTRY, groupCatalog, identityKey, matchRegistry, modelIdentities, REFUSED_CHAT_MODEL_IDS, REGISTRY, servesChat, servesGroup, } from './model-registry.ts';
export type { CatalogModel, GroupCatalogModel, GroupCatalogOptions, ModelIdentity, RegistryEntry, RegistryPricing, RegistryReasoning, UpstreamModel, } from './model-registry.ts';
export { ThinkTagExtractor } from './protocol/chat-completions.ts';
export type { ChatStreamBehavior, ThinkingMode } from './protocol/chat-completions.ts';
export declare const name = "protocom-api";
export declare const inject: string[];
export declare function apply(ctx: Context, config: Config): void;
