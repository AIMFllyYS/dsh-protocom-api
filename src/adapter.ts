/**
 * `ProtocomAdapter`: fetch + SSE against the Protocom official API, emitting
 * harness StreamChunks. One instance serves all four group routes; connection
 * facts arrive through a thunk resolved once per operation and the bearer
 * token through a per-request resolver, so a configuration change reaches the
 * very next request while an in-flight stream keeps the facts it started
 * with. Model metadata is the live listing projected through the registry;
 * context variants ride as `::ctx@` model-id suffixes.
 *
 * @module dsh-protocom-api/adapter
 */

import {
  IMAGE_OFFLOAD_REQUIRED_CODE,
  LlmAdapter,
  LlmError,
  offloadedImageText,
  projectOffloadedImages,
  ReasoningEffortId,
  requiredImageOffload,
} from '@deepseek-ai/dsh-llm'
import { idleWatchdog, timeoutOf } from '@deepseek-ai/dsh-timeout'
import type {
  ContentBlock,
  GenerateOptions,
  LlmModelInfo,
  LlmModelReasoningInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  ModelModality,
  PreparedAdapterCall,
  RequestMessage,
  ResolvedRetryPolicy,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { requestImageDimensions } from '@deepseek-ai/dsh-attachment'
import type { AttachmentStore, ImageAttachmentRef, ImageRequestTarget } from '@deepseek-ai/dsh-attachment'
import { PROTOCOM } from './family.ts'
import type { ProviderFamily } from './family.ts'
import type { ResolvedGroup, ResolvedProtocomOptions } from './config.ts'
import { retryPolicyFor } from './retry.ts'
import {
  catalogFor,
  CATALOG_TTL_MS,
  MAX_CATALOG_BYTES,
  MAX_PLAN_BYTES,
  scrapeCatalog,
  tierFromPlanId,
  withinTier,
} from './commandcode-catalog.ts'
import type { CatalogScrape } from './commandcode-catalog.ts'
import {
  acceptsImages,
  displayNameWithContext,
  contextStepsFor,
  protocolForEndpoints,
  FALLBACK_CONTEXT_WINDOW,
  groupCatalog,
  identityKey,
  matchRegistry,
} from './model-registry.ts'
import type { GroupCatalogModel, RegistryReasoning, UpstreamModel } from './model-registry.ts'
import { readBoundedBytes } from './bounded-read.ts'
import { decodeVariantId, encodeVariantId, stripVariantId } from './context-variants.ts'
import { fetchUpstreamModels } from './discovery.ts'
import { streamChatCompletions } from './protocol/chat-completions.ts'
import type { ProtocolConnection, RequestImageUrls } from './protocol/http.ts'
import { streamResponses } from './protocol/responses.ts'

/** How long one fetched model listing is reused per group. */
export const MODEL_LIST_TTL_MS = 60_000

/** How long one resolved account tier is reused. It changes per billing period. */
export const PLAN_TTL_MS = 15 * 60 * 1_000

/**
 * Widest total-pixel budget this plugin asks the attachment service to encode
 * an image within. Since 1.7 the request image target is per OCCURRENCE
 * (dimensions plus a byte target) rather than one route-wide policy, so the
 * budget is applied through {@link requestImageTargetFor}.
 */
export const REQUEST_IMAGE_MAX_PIXELS = 640_000

/**
 * Encoded-byte target for one request image. The attachment service keeps the
 * smallest quality-ladder output when no quality fits, so this is a target
 * rather than a hard refusal.
 */
export const REQUEST_IMAGE_TARGET_BYTES = 1024 * 1024

/**
 * The request-image target for one attachment on this family's routes.
 *
 * 1.7 replaced the route-wide policy object with a per-occurrence target that
 * the caller derives, which is what lets each route project an image
 * differently while sharing one stored normalized copy. The projection itself
 * (aspect-preserving integer dimensions inside a pixel budget) is the
 * harness's own helper, so this plugin cannot drift from the first-party
 * adapters' geometry.
 * @param ref - the durable normalized attachment.
 * @returns that occurrence's width, height, and encoded-byte target.
 */
export function requestImageTargetFor(ref: Pick<ImageAttachmentRef, 'width' | 'height'>): ImageRequestTarget {
  return {
    ...requestImageDimensions(ref.width, ref.height, REQUEST_IMAGE_MAX_PIXELS),
    maxBytes: REQUEST_IMAGE_TARGET_BYTES,
  }
}

/**
 * Whole-request image budget: total represented bytes and image count. The
 * single-image policy above bounds each image but not their sum, so a history
 * that repeats images would materialize unbounded base64 on every turn. These
 * mirror the first-party adapters' bounds (20 MiB, 600 images).
 */
export const REQUEST_IMAGE_TOTAL_BYTES = 20 * 1024 * 1024

/** Most image occurrences one request may transmit; see {@link REQUEST_IMAGE_TOTAL_BYTES}. */
export const REQUEST_IMAGE_MAX_COUNT = 600

/** Stable code stamped onto the stream idle watchdog's abort reason. */
const STREAM_IDLE_TIMEOUT_CODE = 'LLM_STREAM_IDLE_TIMEOUT'

/** How long a non-exhausted stream's teardown may hold the caller after an abort. */
const TEARDOWN_GRACE_MS = 1_000

/** One-shot async iterator over one promise, for demanding a non-stream step through the watchdog. */
function oneShot<T>(promise: Promise<T>, signal: AbortSignal): AsyncIterator<T> {
  let consumed = false
  return {
    next: async (): Promise<IteratorResult<T>> => {
      if (consumed) return { done: true, value: undefined }
      consumed = true
      return { done: false, value: await abortable(promise, signal) }
    },
  }
}

/**
 * Await one promise, rejecting as soon as the signal aborts. The idle watchdog
 * only *notifies* through its signal, so a pre-stream step that ignores that
 * signal (a store or transport that does not observe cancellation) would
 * otherwise hang the demand — and the request — forever.
 */
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => { reject(signal.reason) }
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => { signal.removeEventListener('abort', onAbort); resolve(value) },
      (error: unknown) => { signal.removeEventListener('abort', onAbort); reject(error) },
    )
  })
}

/** Resolve after {@link TEARDOWN_GRACE_MS} without holding a Node process open. */
function teardownGrace(): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, TEARDOWN_GRACE_MS)
    ;(timer as { unref?: () => void }).unref?.()
  })
}



/**
 * Collect every image reference one message's content carries.
 *
 * No recursion: since 1.7 a tool result is a first-class message of role
 * `tool` whose content holds its blocks directly, so an image inside a tool
 * result is already at the top level of that message and a nested walk would
 * look for a block type that no longer exists.
 */
function collectImageRefs(
  content: readonly ContentBlock[],
  refs: Map<string, ImageAttachmentRef>,
): void {
  for (const block of content) {
    if (block.type === 'image') refs.set(String(block.attachment.attachmentId), block.attachment)
  }
}

/** The inline `data:` URL one resolved request image is transmitted as. */
function toDataUrl(image: { mediaType: string; data: Uint8Array }): string {
  return `data:${image.mediaType};base64,${Buffer.from(image.data).toString('base64')}`
}

/** Constructor options for {@link ProtocomAdapter}: the operation-local resolution hooks the plugin owns. */
export interface ProtocomAdapterOptions {
  /** Current validated connection facts; called once per operation. */
  options: () => ResolvedProtocomOptions
  /**
   * Resolve the bearer token for one group. The group snapshot is passed in —
   * never re-read — so the key can only ever come from the same resolution as
   * the endpoint it is sent to. Throws `LlmError` `MISSING_CREDENTIAL` when
   * no key is available anywhere.
   *
   * A group with a key POOL needs the Session to pick a key: sticky selection
   * pins one account per conversation so its prefix cache stays warm. Callers
   * with no conversation (a listing, a probe) omit it and get the pool's
   * deterministic default, which is all a cache-less request can use.
   * @param group - the resolved group whose key is wanted.
   * @param sessionId - the conversation this request belongs to, when any.
   */
  resolveApiKey: (group: ResolvedGroup, sessionId?: string) => Promise<string>
  /**
   * Report that a key just failed admission, so the pool can park it briefly.
   * Called with an `AUTH` or `RATE_LIMIT` failure; other codes are the model's
   * or the relay's problem, not the credential's.
   * @param group - the group whose key failed.
   * @param sessionId - the conversation that was being served, when any.
   */
  reportKeyFailure?: (group: ResolvedGroup, sessionId?: string) => void
  /**
   * The deployment's durable attachment service, when one is mounted. Absent
   * means no image can be resolved, so image input is refused rather than
   * silently dropped.
   */
  resolveAttachments?: () => AttachmentStore | undefined
  /**
   * Report a non-fatal degradation — today, a capability page that could not be
   * scraped. Absent means the deployment has no logger seam, and the
   * degradation stays silent rather than throwing.
   */
  log?: (message: string) => void
}

function reasoningInfo(reasoning: RegistryReasoning): LlmModelReasoningInfo {
  return {
    efforts: reasoning.efforts.map(effort => ({
      id: ReasoningEffortId(effort),
      name: effort.charAt(0).toUpperCase() + effort.slice(1),
    })),
    ...reasoning.defaultEffort === undefined ? {} : { defaultEffort: ReasoningEffortId(reasoning.defaultEffort) },
  }
}

/** One adapter serving every enabled route of one provider family. */
export class ProtocomAdapter extends LlmAdapter {
  private readonly listings = new Map<string, { at: number; value: Promise<UpstreamModel[]> }>()
  /**
   * The last successfully resolved listing per group. Dispatch reads it to see
   * which endpoints the gateway declared for a model, so protocol selection
   * costs no network round trip; {@link invalidateListings} drops it with the
   * promise cache so the two can never disagree.
   */
  private readonly resolved = new Map<string, readonly UpstreamModel[]>()
  /**
   * Scraped capability catalogs, keyed by page URL. Cached because the page is
   * large (~765 KB) and changes at most daily, while the menu is built on every
   * discovery and settings read.
   */
  private readonly capabilityCache = new Map<string, { at: number; value: CatalogScrape }>()
  /**
   * The account's subscription tier per family. Cached for the same reason the
   * catalog is: it changes at most once a billing period while the menu is
   * rebuilt on every discovery and settings read.
   */
  private readonly tierCache = new Map<string, { at: number; value: string | undefined }>()

  /**
   * Stable per-adapter session id for calls that arrive without
   * `GenerateOptions.sessionId`. The OpenCode Go endpoint answers 400
   * `MissingSessionID` without one, so non-conversational traffic (title
   * generation, probes) rides this value: stable per adapter, never invented
   * per request, which keeps the gateway's session accounting honest.
   */
  private readonly fallbackSession = `dsh-${globalThis.crypto.randomUUID()}`

  constructor(private readonly config: ProtocomAdapterOptions) {
    super()
  }

  /** The family this adapter instance serves (Protocom for hand-built options). */
  private family(): ProviderFamily {
    return this.config.options().family ?? PROTOCOM
  }

  override providerInfo(provider: string): LlmProviderInfo {
    const family = this.family()
    const key = family.groupOf(provider)
    return { id: provider, name: key === undefined ? provider : (family.defaults[key]?.displayName ?? provider) }
  }

  override providerRetryPolicy(_provider: string): ResolvedRetryPolicy {
    // Built from the CURRENT facts, not a value frozen at construction: the
    // harness captures a route's policy when that route is registered, and this
    // plugin re-registers on every committed settings change, so reading live
    // here is what makes a new budget reach the very next request.
    return retryPolicyFor(this.config.options())
  }

  /** The enabled group behind one route; every dispatch path starts here. */
  private groupFor(provider: string): ResolvedGroup {
    const family = this.family()
    const key = family.groupOf(provider)
    const group = key === undefined ? undefined : this.config.options().groups.get(key)
    if (group === undefined || !group.enabled) {
      throw new LlmError(`${family.ns}: provider route "${provider}" is not an enabled group`, 'NO_PROVIDER')
    }
    return group
  }

  /**
   * The endpoints the gateway itself declared for one model, when the last
   * listing is still cached. Serving from the cache keeps dispatch free of a
   * network round trip on the hot path; a cold cache simply falls back to the
   * group's protocol, which is what every family did before this existed.
   */
  private declaredEndpoints(group: ResolvedGroup, model: string): readonly string[] | undefined {
    const cached = this.resolved.get(group.key)
    if (cached === undefined) return undefined
    return cached.find(row => row.id === model)?.endpoints
  }

  /** One group's live model listing, cached briefly; failures are not cached. */
  private upstreamModels(group: ResolvedGroup, signal?: AbortSignal): Promise<UpstreamModel[]> {
    const hit = this.listings.get(group.key)
    if (hit !== undefined && Date.now() - hit.at < MODEL_LIST_TTL_MS) return hit.value
    const { baseURL } = this.config.options()
    // A listing has no conversation to pin, so the pool hands out its default
    // key; nothing here is cacheable against a Session.
    const family = this.family()
    const value = this.config.resolveApiKey(group)
      .then(apiKey => fetchUpstreamModels(baseURL, apiKey, signal))
      .then(async (rows) => {
        // Enrich with the family's capability catalog, when it has one. The
        // listing is the routing truth; the catalog is the capability truth,
        // and this is where they join. A degraded scrape leaves the rows
        // untouched, so no menu depends on the page being readable.
        if (family.capabilityCatalogUrl === undefined) return rows
        const { byId } = await this.capabilities(family)
        if (byId.size === 0) return rows
        // The account's own tier gates the menu: the endpoints listing is not
        // plan-filtered, so a Pro- or Max-tier model would be offered here and
        // then rejected with MODEL_NOT_IN_PLAN on every call.
        const tier = await this.accountTier(family, group)
        return rows.map((row) => {
          const found = catalogFor(byId, row.id)
          if (found === undefined) return row
          if (!withinTier(found.minPlan, tier)) return { ...row, outOfPlan: true }
          return {
            ...row,
            ...found.contextWindow === undefined || row.contextWindow !== undefined
              ? {}
              : { contextWindow: found.contextWindow },
            ...found.inputCost === undefined ? {} : { inputCost: found.inputCost },
            ...found.outputCost === undefined ? {} : { outputCost: found.outputCost },
            ...found.cacheReadCost === undefined ? {} : { cacheReadCost: found.cacheReadCost },
            // A definite vision verdict always wins; the permissive default
            // only applies where the catalog said nothing.
            ...row.vision === undefined ? { vision: found.vision } : {},
            // A model that cannot reason must not be sent a thinking parameter.
            ...found.reasoning ? {} : { reasoning: false },
          }
        })
      })
    value.then((rows) => {
      // A resolved listing also feeds the dispatch hot path, which must pick a
      // wire protocol without a network round trip.
      if (this.listings.get(group.key)?.value === value) this.resolved.set(group.key, rows)
    }).catch(() => {
      if (this.listings.get(group.key)?.value === value) {
        this.listings.delete(group.key)
        this.resolved.delete(group.key)
      }
    })
    this.listings.set(group.key, { at: Date.now(), value })
    return value
  }

  /** Forget cached listings so a configuration change re-interrogates. */
  invalidateListings(): void {
    this.listings.clear()
    this.resolved.clear()
  }

  /**
   * The input modalities one route advertises for one model. Image input is
   * declared wherever the model accepts it — the deployment's own choice, then
   * the registry's verified verdict, then permissive — and both wire protocols
   * carry one, so no protocol-shaped hole is left for a capability to fall
   * into.
   */
  private inputModalitiesFor(upstreamId: string): readonly ModelModality[] {
    return acceptsImages(upstreamId, this.config.options().visionModels, this.family().registry) ? ['text', 'image'] : ['text']
  }

  /**
   * The context lengths one model should be offered at. The picker's per-model
   * choice wins — that is the surface a user actually sets — then the group's
   * own `contextLengths`, then nothing, which offers the model once at its
   * full window. A chosen length above the model's window is dropped rather
   * than advertised, because the model could not honour it.
   */
  private contextLengthsFor(group: ResolvedGroup, model: GroupCatalogModel): number[] | undefined {
    const chosen = this.config.options().modelContexts.get(identityKey(model.upstreamId, this.family().registry))
    if (chosen !== undefined && chosen.length > 0) {
      const allowed = chosen.filter(length => length <= model.contextWindow)
      if (allowed.length > 0) return [...allowed].sort((left, right) => left - right)
      return undefined
    }
    // CONFIGURATION is the switch, exactly as variantLengths documents: without a
    // group ladder the model lists once, under its bare id. A registry entry
    // carries contextOptions as the set it COULD offer, not as an instruction to
    // expand every menu row, so this guard must come first. It is also the shape
    // most deployments run, and the historical one.
    if (group.contextLengths === undefined || group.contextLengths.length === 0) return undefined
    // Otherwise one shared expression, evaluated here and by the settings row
    // that draws the chips, so the entries and the controls cannot drift apart.
    return contextStepsFor(model, group.contextLengths)
  }

  /** The catalog entries one model advertises, one per variant. */
  private modelEntries(provider: string, group: ResolvedGroup, model: GroupCatalogModel): LlmModelInfo[] {
    const inputModalities = this.inputModalitiesFor(model.upstreamId)
    const lengths = this.contextLengthsFor(group, model)
    if (lengths === undefined) {
      return [{
        provider,
        id: model.upstreamId,
        name: displayNameWithContext(model.displayName, model.contextWindow),
        inputModalities,
      }]
    }
    return lengths.map(length => ({
      provider,
      id: encodeVariantId(model.upstreamId, length),
      name: displayNameWithContext(model.displayName, length),
      inputModalities,
    }))
  }

  /**
   * The capability catalog for one family, scraped from its own page and cached.
   *
   * Absent when the family names no page. A failed scrape returns an empty map
   * with the reason recorded, so callers degrade to "no capability claims"
   * rather than failing: the listing is still enough to serve models, and the
   * menu must not empty because a marketing page changed its markup.
   * @param family - the family whose page to read.
   * @returns capabilities by id, and the reason when the scrape degraded.
   */
  private async capabilities(family: ProviderFamily): Promise<CatalogScrape> {
    const url = family.capabilityCatalogUrl
    if (url === undefined) return { byId: new Map() }
    const hit = this.capabilityCache.get(url)
    if (hit !== undefined && Date.now() - hit.at < CATALOG_TTL_MS) return hit.value
    let value: CatalogScrape
    try {
      // redirect:'error' rather than 'follow': this fetch carries no credential,
      // but a vendor URL that redirects is either a mistake or an interception,
      // and neither is a reason to keep reading whatever it points at next.
      const response = await fetch(url, { headers: { accept: 'text/html' }, redirect: 'error' })
      if (!response.ok) {
        value = scrapeCatalog(undefined, `the capability page answered HTTP ${response.status}`)
      } else {
        // Bounded while reading, not after: see readBoundedBytes for why a cap
        // applied to an already-buffered body bounds nothing.
        const body = await readBoundedBytes(response, MAX_CATALOG_BYTES)
        value = scrapeCatalog(body)
      }
    } catch (error) {
      value = scrapeCatalog(undefined, `the capability page could not be reached: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (value.problem !== undefined) {
      // Reported once per failed scrape, not per request: the degradation is
      // real but the menu keeps working, so this is a warning rather than a
      // failure the caller has to handle.
      this.config.log?.(family.ns + ': ' + value.problem + '; models will be offered without capability claims')
    }
    this.capabilityCache.set(url, { at: Date.now(), value })
    return value
  }

  /**
   * The subscription tier this account is on, read from the family's own
   * subscription endpoint and cached.
   *
   * Needed because an endpoints listing is NOT plan-filtered: the live Command
   * Code listing advertised 82 models, but an account on `individual-goat` got
   * HTTP 403 MODEL_NOT_IN_PLAN for every Pro- and Max-tier one. Offering those
   * would put models in the menu whose every call fails.
   *
   * Any failure yields undefined, which the caller reads as "tier unknown" and
   * therefore "do not filter": hiding models on a network blip would be a worse
   * failure than showing one the account cannot use.
   * @param family - the family whose account surface to read.
   * @param group - the group whose credential authorizes the read.
   * @returns the tier name, lower case, or undefined when it could not be read.
   */
  private async accountTier(family: ProviderFamily, group: ResolvedGroup): Promise<string | undefined> {
    const path = family.planIdPath
    if (path === undefined) return undefined
    const cached = this.tierCache.get(family.ns)
    if (cached !== undefined && Date.now() - cached.at < PLAN_TTL_MS) return cached.value
    let value: string | undefined
    try {
      const { baseURL } = this.config.options()
      const apiKey = await this.config.resolveApiKey(group)
      // redirect:'error', because THIS fetch carries the stored credential. A
      // 30x would otherwise hand the Authorization header to whatever the
      // redirect names -- the operator consented to the configured origin, not
      // to wherever it points next. The body is read under the same bound as
      // every other upstream reply rather than through response.json(), which
      // buffers without limit.
      const response = await fetch(new URL(path, new URL(baseURL).origin).toString(), {
        headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
        redirect: 'error',
      })
      if (response.ok) {
        const body = JSON.parse(await readBoundedBytes(response, MAX_PLAN_BYTES)) as { data?: { planId?: unknown }; planId?: unknown }
        const planId = body.data?.planId ?? body.planId
        value = tierFromPlanId(typeof planId === 'string' ? planId : undefined)
      }
    } catch {
      value = undefined
    }
    this.tierCache.set(family.ns, { at: Date.now(), value })
    return value
  }

  /**
   * The catalog offered for one route, projected by the same function the
   * settings panel reads (model-registry's `groupCatalog`), so the models a
   * user configures for a group are exactly the models that group's menu
   * offers. Membership is that route's own listing — the credential scopes
   * what the route serves — plus the registry entries tagged for this group,
   * minus the ids the endpoint refuses on its chat route. The picker renders
   * this order verbatim and the harness calls it "adapter-preferred", so the
   * deployment's recommendation decides the head of the list.
   */
  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    const group = this.groupFor(provider)
    const { hiddenModels, recommendedModels, visionModels } = this.config.options()
    let listing: readonly UpstreamModel[] | undefined
    try {
      listing = await this.upstreamModels(group)
    } catch {
      listing = undefined
    }
    return groupCatalog(group.key, listing, {
      hidden: hiddenModels,
      recommended: recommendedModels,
      vision: visionModels,
      family: this.family(),
    }).flatMap(model => this.modelEntries(provider, group, model))
  }

  /**
   * Whether a capability source stated that this model cannot reason at all.
   * @param group - the group whose listing is consulted.
   * @param upstreamId - the upstream model id.
   * @returns true only for a definite negative verdict; false when unstated.
   */
  private async modelCannotReason(group: ResolvedGroup, upstreamId: string): Promise<boolean> {
    try {
      const upstream = await this.upstreamModels(group)
      return upstream.find(model => model.id === upstreamId)?.reasoning === false
    } catch {
      return false
    }
  }

  /** Endpoint-disclosed reasoning vocabulary for one model, when the listing says any. */
  private async disclosedReasoning(group: ResolvedGroup, upstreamId: string): Promise<RegistryReasoning | undefined> {
    try {
      const upstream = await this.upstreamModels(group)
      const row = upstream.find(model => model.id === upstreamId)
      if (row?.reasoningEfforts === undefined || row.reasoningEfforts.length === 0) return undefined
      return {
        efforts: row.reasoningEfforts,
        defaultEffort: row.reasoningEfforts.includes('high') ? 'high' : row.reasoningEfforts[0] as string,
      }
    } catch {
      return undefined
    }
  }

  private async modelInfoFor(
    group: ResolvedGroup,
    provider: string,
    model: string,
  ): Promise<LlmResolvedModelInfo> {
    const { upstreamId, contextWindow: variant } = decodeVariantId(model)
    const family = this.family()
    const entry = matchRegistry(upstreamId, family.registry)
    const contextWindow = variant ?? entry?.contextWindow ?? FALLBACK_CONTEXT_WINDOW
    let displayName = entry?.displayName
    if (displayName === undefined) {
      try {
        const upstream = await this.upstreamModels(group)
        const row = upstream.find(candidate => candidate.id === upstreamId)
        displayName = row?.displayName !== undefined && row.displayName !== upstreamId
          ? row.displayName
          : upstreamId
      } catch {
        displayName = upstreamId
      }
    }
    // A capability source that says a model CANNOT reason is authoritative: the
    // model must not be sent a thinking parameter, so it gets no Effort
    // submenu. Without this gate the group's own vocabulary would offer one and
    // every request carrying an effort would be a provider error.
    const cannotReason = await this.modelCannotReason(group, upstreamId)
    // Order matters: the registry is hand-verified per model, the endpoint's own
    // disclosure outranks a group-wide default, and a family that knows its
    // models' vocabularies but cannot publish them sits between the two. The
    // group default is LAST because it is the only one not about this model.
    const reasoning = cannotReason
      ? undefined
      : entry?.reasoning
        ?? await this.disclosedReasoning(group, upstreamId)
        ?? family.reasoningFor?.(upstreamId)
        ?? family.defaults[group.key]?.reasoning
    return {
      provider,
      id: model,
      name: displayNameWithContext(displayName, contextWindow),
      inputModalities: this.inputModalitiesFor(upstreamId),
      context: { contextWindow },
      ...reasoning === undefined ? {} : { reasoning: reasoningInfo(reasoning) },
    }
  }

  override resolveModel(provider: string, model: string, _signal?: AbortSignal): Promise<LlmResolvedModelInfo> {
    return this.modelInfoFor(this.groupFor(provider), provider, model)
  }

  override async prepareCall(provider: string, model: string, _signal?: AbortSignal): Promise<PreparedAdapterCall> {
    const group = this.groupFor(provider)
    return {
      model: await this.modelInfoFor(group, provider, model),
      stream: options => this.streamWithGroup(options, group),
    }
  }

  stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    return this.streamWithGroup(options, this.groupFor(options.provider))
  }

  private async * streamWithGroup(options: GenerateOptions, group: ResolvedGroup): AsyncGenerator<StreamChunk> {
    // One resolution per stream call: endpoint and credential freeze here and
    // hold for this whole request, so an in-flight stream never observes a
    // configuration change and the next call re-resolves.
    const { baseURL, streamIdleTimeoutMs } = this.config.options()
    const family = this.family()
    // The Session rides along so a pooled group can pin one account to this
    // conversation and keep its prefix cache warm across steps.
    const sessionId = options.sessionId === undefined ? undefined : String(options.sessionId)
    const apiKey = await this.config.resolveApiKey(group, sessionId)
    // Session scoping is contractual on OpenCode Go (a missing header answers
    // 400 MissingSessionID): the harness's own `x-deepseek-harness-session-id`
    // rides beside `x-opencode-session` carrying the same value, because the
    // gateway recognizes the native header on only some model paths.
    const headers: Record<string, string> | undefined = family.sessionHeader === undefined
      ? undefined
      : (() => {
        const session = options.sessionId === undefined ? this.fallbackSession : String(options.sessionId)
        return { [family.sessionHeader]: session, 'x-deepseek-harness-session-id': session }
      })()
    const connection: ProtocolConnection = {
      baseURL,
      apiKey,
      label: family.label,
      // The clamp and the declared policy are the same number, so a provider's
      // own Retry-After is honoured up to the configured ceiling and can never
      // exceed the policy that compares against it.
      retryAfterCeilingMs: this.config.options().retryMaxDelayMs,
      ...headers === undefined ? {} : { headers },
    }
    const model = stripVariantId(options.model)
    // A provider that simply stops sending must not hold the request, its
    // socket, and the agent step open forever. The watchdog only *notifies*
    // through its signal, so the transport has to observe that same signal —
    // otherwise the timeout aborts nothing and the stalled read stays pending.
    // This mirrors the first-party adapters (F6).
    // The watchdog only notifies; the transport must observe its signal. The
    // consumer controller exists so teardown can also abort an abandoned stream
    // instead of leaving the underlying request to its own transport timeout.
    const consumer = new AbortController()
    const upstream = options.signal === undefined
      ? consumer.signal
      : AbortSignal.any([options.signal, consumer.signal])
    const watchdog = idleWatchdog(upstream, streamIdleTimeoutMs, STREAM_IDLE_TIMEOUT_CODE)
    const callOptions: GenerateOptions = { ...options, signal: watchdog.signal }
    let iterator: AsyncIterator<StreamChunk> | undefined
    let exhausted = false
    try {
      // The pre-stream work (image projection, request serialization) is
      // demanded through the watchdog too, so a stall before the first chunk
      // reaches the same idle bound instead of hanging the request silently.
      const pending = this.protocolCall(connection, callOptions, group, model)
      const started = await watchdog.next(oneShot(pending, watchdog.signal))
      if (started.done === true) {
        throw new LlmError('Protocom adapter produced no stream', 'TRANSPORT')
      }
      iterator = started.value[Symbol.asyncIterator]()
      for (;;) {
        const result = await watchdog.next(iterator)
        if (result.done) {
          exhausted = true
          return
        }
        yield result.value
      }
    } catch (error: unknown) {
      if (timeoutOf(watchdog.signal, STREAM_IDLE_TIMEOUT_CODE) !== undefined) {
        throw new LlmError(`${family.label} stream idle for ${streamIdleTimeoutMs}ms`, 'TIMEOUT', { cause: error })
      }
      if (options.signal?.aborted) {
        throw new LlmError(`${family.label} request aborted by caller`, 'ABORTED', { cause: error })
      }
      // Park a key the provider itself rejected. Only credential-shaped
      // failures qualify: a 5xx, a timeout, or a malformed request says nothing
      // about the key, and parking on one would rotate a healthy account out.
      const code = (error as { code?: unknown }).code
      if (code === 'AUTH' || code === 'RATE_LIMIT') {
        this.config.reportKeyFailure?.(group, sessionId)
      }
      throw error
    } finally {
      consumer.abort(`${family.label} stream consumer stopped`)
      watchdog[Symbol.dispose]()
      if (!exhausted && iterator !== undefined && iterator.return !== undefined) {
        const pendingReturn = iterator.return()
        try {
          // The transport observes the watchdog's abort, so return() normally
          // settles at once; bound it anyway so a transport that swallows the
          // abort cannot hold this finally — and the caller's outcome — open.
          await Promise.race([pendingReturn, teardownGrace()])
        } catch {
          // Teardown is best-effort: the consumer already owns termination.
        }
      }
    }
  }

  /**
   * The wire call for this request's protocol, with this request's image
   * budget applied first. Both protocols carry images: an image resolves to an
   * inline data URL either way, so a group's protocol can no longer decide
   * whether a multimodal model is reachable with one.
   */
  private async protocolCall(
    connection: ProtocolConnection,
    options: GenerateOptions,
    group: ResolvedGroup,
    model: string,
  ): Promise<AsyncIterable<StreamChunk>> {
    const { images, messages } = await this.resolveRequestImages(options, model)
    const projected = messages === options.messages ? options : { ...options, messages: [...messages] }
    // A registry-declared wire protocol beats the group's: OpenCode Go keeps
    // one group whose models split across both surfaces (grok-4.6, muse-spark,
    // gpt-5.6-luna answer only on /responses).
    const family = this.family()
    const entry = matchRegistry(model, family.registry)
    // Precedence: a registry-declared protocol (hand-verified per model), then
    // the GATEWAY's own endpoint declaration (authoritative for a family whose
    // listing publishes it), then the group's configured default.
    const protocol = entry?.protocol
      ?? protocolForEndpoints(this.declaredEndpoints(group, model))
      ?? group.protocol
    if (protocol === 'messages') {
      // Refused loudly rather than silently rerouted. A model that declares
      // ONLY /messages cannot be served on the OpenAI wire — the gateway
      // answers 400 — so falling back would replace a clear diagnosis with an
      // upstream error that looks like a plugin defect. The catalog filter
      // already hides these models, so reaching here means a request named one
      // directly.
      throw new LlmError(
        `${family.label} model "${model}" is served only on the Anthropic Messages wire, which this plugin does not implement yet;`
        + ' pick a model served on chat-completions or responses',
        'NO_ADAPTER',
      )
    }
    return protocol === 'responses'
      ? streamResponses(connection, projected, model, images)
      : streamChatCompletions(connection, projected, model, images, {
        replayReasoning: group.replayReasoning,
        assistantTextReplay: group.assistantTextReplay,
        thinking: family.chatThinking,
        inlineReasoning: entry?.inlineReasoning,
      })
  }

  /**
   * Resolve every image this request carries into the inline data URL the
   * endpoint accepts, applying the whole-request budget first. The harness
   * already projects images away from a text-only route before dispatch, so a
   * retained image here means the route declared the `image` modality; the
   * guard still covers direct adapter use.
   * @param options - the assembled request.
   * @param options - the assembled request.
   * @param model - the upstream model id, variant suffix already stripped.
   * @returns provider-ready data URLs (absent when the request has none) and the
   * message projection the caller must serialize.
   */
  private async resolveRequestImages(
    options: GenerateOptions,
    model: string,
  ): Promise<{ images: RequestImageUrls | undefined; messages: readonly RequestMessage[] }> {
    const family = this.family()
    // An attachment a session-level policy already offloaded renders as its
    // placeholder on EVERY route: the offloaded set is a durable surface fact,
    // so honouring it first is what keeps a replayed conversation faithful
    // instead of silently re-sending an image the budget already dropped.
    const projected = projectOffloadedImages(options.messages, ref => offloadedImageText(ref))
    const refs = new Map<string, ImageAttachmentRef>()
    for (const message of projected) collectImageRefs(message.content, refs)
    if (refs.size === 0) return { images: undefined, messages: projected }
    if (!acceptsImages(model, this.config.options().visionModels)) {
      throw new LlmError(`${family.label} model "${model}" does not accept image input.`, 'UNSUPPORTED_CONTENT')
    }
    const attachments = this.config.resolveAttachments?.()
    if (attachments === undefined) {
      throw new LlmError(
        `${family.label} image input requires the durable attachment service.`,
        'UNSUPPORTED_CONTENT',
      )
    }
    const ordered = [...refs.values()]
    const resolved = await Promise.all(ordered.map(
      ref => attachments.readImageRequest(ref, requestImageTargetFor(ref), options.signal),
    ))
    const rawBytes = new Map<string, number>()
    ordered.forEach((ref, index) => {
      rawBytes.set(String(ref.attachmentId), (resolved[index] as { data: Uint8Array }).data.byteLength)
    })
    // DECLARE the budget rather than enforcing it here. Since 1.7 an adapter
    // reports how many more oldest occurrences must go and fails with
    // IMAGE_OFFLOAD_REQUIRED; the session-level executor
    // (dsh-compaction-image-offload, part of the base bundle) records the
    // omission durably and retries without spending the provider retry budget.
    // Offloading locally instead would make the choice per-request and
    // invisible to replay.
    const offloadImages = requiredImageOffload(projected, {
      representation: 'base64',
      maxBytes: REQUEST_IMAGE_TOTAL_BYTES,
      maxImages: REQUEST_IMAGE_MAX_COUNT,
    }, block => rawBytes.get(String(block.attachment.attachmentId)) ?? 0)
    if (offloadImages > 0) {
      throw new LlmError(
        `${family.label} request images exceed the route budget;`
        + ` ${offloadImages} more oldest occurrence(s) must be offloaded.`,
        IMAGE_OFFLOAD_REQUIRED_CODE,
        { offloadImages },
      )
    }
    const images = new Map<string, string>()
    ordered.forEach((ref, index) => {
      images.set(String(ref.attachmentId), toDataUrl(resolved[index] as { mediaType: string; data: Uint8Array }))
    })
    return { images: images.size === 0 ? undefined : images, messages: projected }
  }
}
