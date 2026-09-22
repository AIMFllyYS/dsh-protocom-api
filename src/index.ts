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

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import { assertUsableApiKey, LlmError } from '@deepseek-ai/dsh-llm'
import type { AdapterRegistrationHandle } from '@deepseek-ai/dsh-llm'
import type z from '@deepseek-ai/schemastery'
import { ProtocomAdapter } from './adapter.ts'
import { BalanceService, balanceFetchHandler } from './balance.ts'
import { GoUsageService, goUsageFetchHandler } from './go-usage.ts'
import { FusionSection, GoSection, OPENCODE_GO, PROTOCOM, ProtocomSection, resolveAdapterOptions } from './config.ts'
import type { Config, ResolvedGroup, ResolvedProtocomOptions, SectionConfig } from './config.ts'
import { mountFusion } from './fusion-host.ts'
import type { ProviderFamily } from './family.ts'
import { discoverModels } from './discovery.ts'

export { ProtocomAdapter } from './adapter.ts'
export type { ProtocomAdapterOptions } from './adapter.ts'
export { BalanceService, balanceFetchHandler, parseBalanceView, parseRateMultiplier, parseUsage } from './balance.ts'
export type { BalanceHooks, GroupBalance } from './balance.ts'
export { normalizeUsage } from './balance-view.ts'
export { GoUsageService, goUsageFetchHandler } from './go-usage.ts'
export type { GoUsageHooks } from './go-usage.ts'
export { parseGoUsage } from './usage-view.ts'
export type { GoQuotaWindow, GoUsageView } from './usage-view.ts'
export {
  Config,
  DEFAULT_BASE_URL,
  DEFAULT_BASE_URL_ORIGIN,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  FAMILIES,
  GO_CREDENTIAL_REF,
  GO_DEFAULT_BASE_URL,
  GO_DEFAULT_BASE_URL_ORIGIN,
  FusionSection,
  GoSection,
  GROUP_DEFAULTS,
  GROUP_KEYS,
  groupOf,
  OPENCODE_GO,
  PROTOCOM,
  PROTOCOM_CREDENTIAL_REF,
  ProtocomSection,
  providerOf,
  resolveAdapterOptions,
  resolveBaseURL,
} from './config.ts'
export type {
  FamilyGroupDefaults,
  GroupConfig,
  GroupKey,
  Protocol,
  ProviderFamily,
  ResolvedGroup,
  ResolvedProtocomOptions,
  SectionConfig,
} from './config.ts'
export { FUSION_NS, resolveFusion, resolveFusionSeat, sameFusionSeat } from './fusion.ts'
export type { FusionConfig, FusionSeatConfig, ResolvedFusion, ResolvedFusionSeat } from './fusion.ts'
export { fuseCallConfig, mountFusion, subagentFacts } from './fusion-host.ts'
export type { FusionSource, SubagentSessionFacts } from './fusion-host.ts'
export { decodeVariantId, encodeVariantId, stripVariantId, variantLengths } from './context-variants.ts'
export { discoverModels, endpointOrigin, fetchUpstreamModels, parseModelsListing } from './discovery.ts'
export type { DiscoveryHooks } from './discovery.ts'
export {
  acceptsImages,
  catalogEntry,
  CONTEXT_LADDER,
  contextChoicesFor,
  contextLabel,
  DEFAULT_RECOMMENDED,
  displayNameWithContext,
  FALLBACK_CONTEXT_WINDOW,
  GO_DEFAULT_RECOMMENDED,
  GO_REFUSED_MODEL_IDS,
  GO_REGISTRY,
  groupCatalog,
  identityKey,
  matchRegistry,
  modelIdentities,
  REFUSED_CHAT_MODEL_IDS,
  REGISTRY,
  servesChat,
  servesGroup,
} from './model-registry.ts'
export type {
  CatalogModel,
  GroupCatalogModel,
  GroupCatalogOptions,
  ModelIdentity,
  RegistryEntry,
  RegistryPricing,
  RegistryReasoning,
  UpstreamModel,
} from './model-registry.ts'
export { ThinkTagExtractor } from './protocol/chat-completions.ts'
export type { ChatStreamBehavior, ThinkingMode } from './protocol/chat-completions.ts'

export const name = 'protocom-api'
export const inject = ['llm']

/**
 * The slice of the Host's `connection` service this plugin registers on. The
 * package that owns the full type is browser-side and absent from headless
 * profiles, so the plugin names the shape it uses locally — the same convention
 * first-party plugins such as `open-in-app` follow — and deliberately keeps the
 * service out of its top-level `inject`: a missing service there deactivates
 * the whole plugin, whereas a scoped `ctx.inject` only omits the balance route.
 */
interface HostFetchRoute {
  readonly path: string
  readonly methods: readonly string[]
  readonly requestBody: 'buffered' | 'streaming'
  readonly fetch: (request: Request) => Promise<Response>
}

interface HostConnectionFetch {
  register(route: HostFetchRoute): () => Promise<void>
}

interface HostConnection {
  readonly fetch: HostConnectionFetch
}

/** The per-family account surface: a cached service plus its fenced route. */
interface FamilyTelemetry {
  /** Forget cached replies; called whenever the family's settings change. */
  invalidate(): void
  /** Register the family's fenced Fetch route, when the service exists. */
  mount(ctx: Context): void
}

/** The hooks one telemetry implementation closes over. */
interface TelemetryHooks {
  options: () => ResolvedProtocomOptions
  resolveApiKey: (group: ResolvedGroup) => Promise<string>
  log: (message: string) => void
}

/** Mount one provider family: adapter, routes, settings section, telemetry. */
function mountFamily(
  ctx: Context,
  family: ProviderFamily,
  schema: z<SectionConfig>,
  base: SectionConfig,
  telemetry: (hooks: TelemetryHooks) => FamilyTelemetry,
): void {
  const ns = family.ns
  let current: () => SectionConfig = () => base
  let lastRaw: SectionConfig | undefined
  let lastGood: ResolvedProtocomOptions | undefined
  const options = (): ResolvedProtocomOptions => {
    const raw = current()
    if (raw === lastRaw && lastGood !== undefined) return lastGood
    try {
      const next = resolveAdapterOptions(raw, family)
      lastRaw = raw
      lastGood = next
      return next
    } catch (error) {
      // Static composition resolves before anything registers, so this branch
      // only sees a live settings snapshot failing a beyond-schema bound:
      // keep serving the last good facts and say so once per bad snapshot.
      if (lastGood === undefined) throw error
      lastRaw = raw
      ctx.logger.error(`${ns}: keeping the last good configuration after an invalid settings section`)
      ctx.logger.error(error)
      return lastGood
    }
  }
  options()

  const resolveApiKey = async (group: ResolvedGroup): Promise<string> => {
    // Every credential fact comes from the caller's snapshot, so a rejected
    // settings generation cannot leak its key onto the previous endpoint.
    const ref = group.apiKeyRef
    if (ref === undefined) {
      throw new LlmError(
        `${ns}: no API key configured for provider route "${group.provider}";`
        + ` set groups.${group.key}.apiKey in the "${ns}" settings section to a credential reference`,
        'MISSING_CREDENTIAL',
      )
    }
    // Defence in depth: resolution already refuses a non-namespaced reference,
    // but the environment fallback is the sharp edge (it reads any `process.env`
    // key), so it re-checks rather than trusting its caller.
    if (!family.credentialRef.test(ref)) {
      throw new LlmError(`${ns}: credential reference "${ref}" is outside this family's credential namespace`, 'MISSING_CREDENTIAL')
    }
    const credentials = ctx.get('credentials')
    if (credentials !== undefined) {
      const hit = await credentials.resolve(ref)
      if (hit?.value !== undefined) return assertUsableApiKey(hit.value, 'dsh-protocom-api', ref)
    }
    const ambient = process.env[ref]
    if (ambient !== undefined && ambient.length > 0) {
      return assertUsableApiKey(ambient, 'dsh-protocom-api', ref)
    }
    throw new LlmError(
      `${ns}: no API key for provider route "${group.provider}"; store ${ref} through the credentials`
      + ` service, or export ${ref} in the launching environment`,
      'MISSING_CREDENTIAL',
    )
  }

  const adapter = new ProtocomAdapter({
    options,
    resolveApiKey,
    // Optional seam, like credentials: a deployment without the attachment
    // service still runs, it just refuses image input instead of dropping it.
    resolveAttachments: () => ctx.get('attachments'),
  })
  const quota = telemetry({ options, resolveApiKey, log: message => { ctx.logger.warn(message) } })

  let syncRoutes: () => void = () => {}
  ctx.effect(() => {
    const directory = ctx.llm.registerConfigurableProviders(family.keys.map(key => ({
      provider: family.providerOf(key),
      displayName: family.defaults[key]?.displayName ?? key,
      settingsNs: ns,
      settingsPath: ['groups', key],
    })))
    const discovery = ctx.llm.registerModelDiscovery(ns, (request, signal) => discoverModels(request, signal, {
      baseURL: () => options().baseURL,
      resolveApiKey: async (provider) => {
        const group = [...options().groups.values()].find(candidate => candidate.provider === provider)
        if (group === undefined) return undefined
        if (!group.enabled) {
          throw new Error(
            `${ns}: group "${group.key}" is disabled; toggle it on in the "${ns}" settings section before discovering models`,
          )
        }
        return await resolveApiKey(group)
      },
    }))
    // The adapter registers lazily: `registerAdapter` refuses an empty route
    // set, so an all-disabled configuration mounts nothing; the first enabled
    // configuration registers, and every later change is an atomic `replace`
    // (which legally accepts the empty set), never a dispose-then-register
    // that would publish a gap.
    let registration: AdapterRegistrationHandle | undefined
    const sync = (): void => {
      const routes = [...options().groups.values()]
        .filter(group => group.enabled)
        .map(group => group.provider)
      if (registration === undefined) {
        if (routes.length === 0) return
        registration = ctx.llm.registerAdapter(routes, adapter)
      } else {
        registration.replace(routes)
      }
    }
    syncRoutes = sync
    sync()
    return () => {
      syncRoutes = () => {}
      registration?.()
      directory()
      discovery()
    }
  })

  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, ns, schema, base, {
      setSource: (source) => {
        current = source
      },
      onChange: () => {
        syncRoutes()
        adapter.invalidateListings()
        quota.invalidate()
      },
    })
  })

  // The quota route rides the Host's shared, fenced API channel instead of a
  // self-registered `webServer` exact route. An exact route is consulted before
  // the carrier's `/api` prefix fence (the webserver matches its exact table
  // first), so a self-registered one is reachable with no Host/Origin check and
  // no browser cookie — which is how the balance endpoint once lost its only
  // authorization. `connection.fetch.register` runs only after the active
  // carrier has applied its own trust policy: the Web carrier's Host/Origin
  // fence plus HMAC cookie, or the desktop IPC boundary. It also restores the
  // panel in the desktop profile, whose composition disables `webserver`.
  quota.mount(ctx)
}

/** The Protocom balance surface: per-group currency balance plus rate enrich. */
function protocomTelemetry(hooks: TelemetryHooks): FamilyTelemetry {
  const balance = new BalanceService({ options: hooks.options, resolveApiKey: hooks.resolveApiKey })
  return {
    invalidate: () => { balance.invalidate() },
    mount: (ctx) => {
      ctx.inject(['connection'], (connectionCtx) => {
        const connection = Reflect.get(connectionCtx, 'connection') as HostConnection | undefined
        if (connection === undefined) return
        connectionCtx.effect(() => connection.fetch.register({
          path: PROTOCOM.telemetryPath,
          methods: ['GET'],
          requestBody: 'buffered',
          fetch: balanceFetchHandler(balance, {
            options: hooks.options,
            resolveApiKey: hooks.resolveApiKey,
            log: hooks.log,
          }),
        }))
      })
    },
  }
}

/** The Go quota surface: the subscription's rolling/weekly/monthly windows. */
function goTelemetry(hooks: TelemetryHooks): FamilyTelemetry {
  const usage = new GoUsageService({ options: hooks.options, resolveApiKey: hooks.resolveApiKey })
  return {
    invalidate: () => { usage.invalidate() },
    mount: (ctx) => {
      ctx.inject(['connection'], (connectionCtx) => {
        const connection = Reflect.get(connectionCtx, 'connection') as HostConnection | undefined
        if (connection === undefined) return
        connectionCtx.effect(() => connection.fetch.register({
          path: OPENCODE_GO.telemetryPath,
          methods: ['GET'],
          requestBody: 'buffered',
          fetch: goUsageFetchHandler(usage, {
            options: hooks.options,
            resolveApiKey: hooks.resolveApiKey,
            log: hooks.log,
          }),
        }))
      })
    },
  }
}

export function apply(ctx: Context, config: Config): void {
  const { opencode, fusion, ...protocom } = config
  mountFamily(ctx, PROTOCOM, ProtocomSection, protocom, protocomTelemetry)
  // The Go section is optional in yml; absent it resolves to the family's own
  // defaults (all-disabled single group waiting on a key).
  mountFamily(ctx, OPENCODE_GO, GoSection, opencode ?? GoSection({}), goTelemetry)
  // Fusion is a routing layer over the routes the two families above register,
  // so it mounts last: with neither family active it simply pins nothing.
  mountFusion(ctx, fusion ?? FusionSection({}))
}
