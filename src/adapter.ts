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
  EMPTY_RESPONSE_CODE,
  LlmAdapter,
  LlmError,
  offloadedImageText,
  offloadRequestImagesWithPolicy,
  ReasoningEffortId,
} from '@deepseek-ai/dsh-llm'
import { idleWatchdog, timeoutOf } from '@deepseek-ai/dsh-timeout'
import type {
  ContentBlock,
  GenerateOptions,
  LlmModelInfo,
  LlmModelReasoningInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  Message,
  ModelModality,
  PreparedAdapterCall,
  ResolvedRetryPolicy,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import type { AttachmentStore, ImageAttachmentRef, ImageRequestPolicy } from '@deepseek-ai/dsh-attachment'
import { GROUP_DEFAULTS, groupOf } from './config.ts'
import type { GroupKey, ResolvedGroup, ResolvedProtocomOptions } from './config.ts'
import {
  catalogEntry,
  displayNameWithContext,
  FALLBACK_CONTEXT_WINDOW,
  identityKey,
  matchRegistry,
  REGISTRY,
  servesGroup,
} from './model-registry.ts'
import type { CatalogModel, RegistryReasoning, UpstreamModel } from './model-registry.ts'
import { decodeVariantId, encodeVariantId, stripVariantId, variantLengths } from './context-variants.ts'
import { fetchUpstreamModels } from './discovery.ts'
import { streamChatCompletions } from './protocol/chat-completions.ts'
import type { RequestImageUrls } from './protocol/chat-completions.ts'
import { MAX_PROVIDER_RETRY_AFTER_MS } from './protocol/http.ts'
import type { ProtocolConnection } from './protocol/http.ts'
import { streamResponses } from './protocol/responses.ts'

/** How long one fetched model listing is reused per group. */
export const MODEL_LIST_TTL_MS = 60_000

/**
 * The request-image projection budget. Mirrors the harness's own default
 * vision budget: the attachment service re-encodes each stored image to fit,
 * so the endpoint never receives bytes beyond what a vision model is priced
 * and sized for.
 */
export const REQUEST_IMAGE_POLICY: ImageRequestPolicy = {
  maxPixels: 640_000,
  maxBytes: 1024 * 1024,
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
 * The retry policy this adapter declares for its routes. It is pinned here so
 * the clamp this adapter applies to a provider's `Retry-After`
 * ({@link MAX_PROVIDER_RETRY_AFTER_MS}) can never exceed the `maxDelayMs` the
 * retry layer compares it against: `llm-retry` treats
 * `providerRetryAfterMs > policy.maxDelayMs` in normal mode as "cancel this
 * retry", so a larger provider delay would silently remove the retry instead of
 * waiting. Declaring the policy keeps the two values consistent regardless of
 * any deployment-level default. `retryableCodes` mirrors the harness default.
 */
const RETRY_POLICY: ResolvedRetryPolicy = Object.freeze({
  mode: 'normal',
  maxRetries: 5,
  retryableCodes: Object.freeze([EMPTY_RESPONSE_CODE, 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT']),
  initialDelayMs: 500,
  maxDelayMs: MAX_PROVIDER_RETRY_AFTER_MS,
  jitterRatio: 0.1,
})

/** Collect every image reference a message tree carries, including tool results. */
function collectImageRefs(
  content: readonly ContentBlock[],
  refs: Map<string, ImageAttachmentRef>,
): void {
  for (const block of content) {
    if (block.type === 'image') refs.set(String(block.attachment.attachmentId), block.attachment)
    else if (block.type === 'tool-result') collectImageRefs(block.content, refs)
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
   */
  resolveApiKey: (group: ResolvedGroup) => Promise<string>
  /**
   * The deployment's durable attachment service, when one is mounted. Absent
   * means no image can be resolved, so image input is refused rather than
   * silently dropped.
   */
  resolveAttachments?: () => AttachmentStore | undefined
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

/** One adapter serving every enabled `protocom-*` provider route. */
export class ProtocomAdapter extends LlmAdapter {
  private readonly listings = new Map<GroupKey, { at: number; value: Promise<UpstreamModel[]> }>()

  constructor(private readonly config: ProtocomAdapterOptions) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    const key = groupOf(provider)
    return { id: provider, name: key === undefined ? provider : GROUP_DEFAULTS[key].displayName }
  }

  override providerRetryPolicy(_provider: string): ResolvedRetryPolicy {
    return RETRY_POLICY
  }

  /** The enabled group behind one route; every dispatch path starts here. */
  private groupFor(provider: string): ResolvedGroup {
    const key = groupOf(provider)
    const group = key === undefined ? undefined : this.config.options().groups.get(key)
    if (group === undefined || !group.enabled) {
      throw new LlmError(`protocom-api: provider route "${provider}" is not an enabled group`, 'NO_PROVIDER')
    }
    return group
  }

  /** One group's live model listing, cached briefly; failures are not cached. */
  private upstreamModels(group: ResolvedGroup, signal?: AbortSignal): Promise<UpstreamModel[]> {
    const hit = this.listings.get(group.key)
    if (hit !== undefined && Date.now() - hit.at < MODEL_LIST_TTL_MS) return hit.value
    const { baseURL } = this.config.options()
    const value = this.config.resolveApiKey(group)
      .then(apiKey => fetchUpstreamModels(baseURL, apiKey, signal))
    value.catch(() => {
      if (this.listings.get(group.key)?.value === value) this.listings.delete(group.key)
    })
    this.listings.set(group.key, { at: Date.now(), value })
    return value
  }

  /** Forget cached listings so a configuration change re-interrogates. */
  invalidateListings(): void {
    this.listings.clear()
  }

  /**
   * The input modalities one route may advertise. Image input is declared only
   * for a model the registry verified against the endpoint AND a route whose
   * protocol can actually carry an image; the responses protocol has no image
   * mapping yet, so it stays text-only rather than advertising a capability
   * that would fail at dispatch.
   */
  private modalitiesOf(group: ResolvedGroup, model: CatalogModel): readonly ModelModality[] {
    return model.vision && group.protocol === 'chat-completions' ? ['text', 'image'] : ['text']
  }

  /**
   * The context lengths one model should be offered at. The picker's per-model
   * choice wins — that is the surface a user actually sets — then the group's
   * own `contextLengths`, then nothing, which offers the model once at its
   * full window. A chosen length above the model's window is dropped rather
   * than advertised, because the model could not honour it.
   */
  private contextLengthsFor(
    group: ResolvedGroup,
    model: CatalogModel,
    upstreamId: string,
  ): number[] | undefined {
    const chosen = this.config.options().modelContexts.get(identityKey(upstreamId))
    if (chosen !== undefined && chosen.length > 0) {
      const allowed = chosen.filter(length => length <= model.contextWindow)
      if (allowed.length > 0) return [...allowed].sort((left, right) => left - right)
      return undefined
    }
    return variantLengths(model.contextOptions, group.contextLengths)
  }

  /** Whether one exact upstream model accepts image input on this route. */
  private acceptsImages(group: ResolvedGroup, upstreamId: string): boolean {
    return matchRegistry(upstreamId)?.vision === true && group.protocol === 'chat-completions'
  }

  /** The catalog entries one discovered model advertises, one per variant. */
  private modelEntries(provider: string, group: ResolvedGroup, upstream: UpstreamModel): LlmModelInfo[] {
    const model = catalogEntry(upstream, GROUP_DEFAULTS[group.key].reasoning)
    const inputModalities = this.modalitiesOf(group, model)
    const lengths = this.contextLengthsFor(group, model, upstream.id)
    if (lengths === undefined) {
      return [{
        provider,
        id: upstream.id,
        name: displayNameWithContext(model.displayName, model.contextWindow),
        inputModalities,
      }]
    }
    return lengths.map(length => ({
      provider,
      id: encodeVariantId(upstream.id, length),
      name: displayNameWithContext(model.displayName, length),
      inputModalities,
    }))
  }

  /**
   * The catalog offered for one route. Membership is that route's own listing —
   * the credential scopes what the route serves — plus the registry entries
   * tagged for this group, so a group's menu holds its own models instead of
   * every group's. Ids the registry does not know still ride along from the
   * listing, so a newly served model appears without a plugin release. A
   * missing or empty listing falls back to the whole registry, so a degraded
   * endpoint cannot empty the menu.
   */
  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    const group = this.groupFor(provider)
    const { hiddenModels, recommendedModels } = this.config.options()
    const rows: UpstreamModel[] = []
    let listing: readonly UpstreamModel[] | undefined
    try {
      listing = await this.upstreamModels(group)
    } catch {
      listing = undefined
    }
    if (listing !== undefined) rows.push(...listing)
    for (const entry of REGISTRY) {
      if (!servesGroup(entry, group.key)) continue
      if (!rows.some(row => row.id === entry.id)) rows.push({ id: entry.id })
    }
    if (rows.length === 0) {
      // "No listing" and "empty listing" are both no information, not "no
      // models"; the registry answers so the menu is never emptied.
      for (const entry of REGISTRY) rows.push({ id: entry.id })
    }
    // The picker renders this order verbatim and the harness calls it
    // "adapter-preferred", so it is the one lever that leads the menu with the
    // models worth reaching for. Recommendation decides the head of the list;
    // everything else keeps registry order behind it.
    const rankOf = (id: string): number => {
      const at = recommendedModels.indexOf(identityKey(id))
      return at === -1 ? Number.MAX_SAFE_INTEGER : at
    }
    const ranked = rows
      .filter(model => !hiddenModels.has(model.id))
      .map((model, index) => ({ index, model, rank: rankOf(model.id) }))
      .sort((left, right) => left.rank - right.rank || left.index - right.index)
    // The endpoint lists some models under two ids; the menu shows one row per
    // identity, and its first id (registry order) is the one dispatched.
    const seen = new Set<string>()
    const unique = ranked.filter((row) => {
      const name = catalogEntry(row.model, GROUP_DEFAULTS[group.key].reasoning).displayName
      if (seen.has(name)) return false
      seen.add(name)
      return true
    })
    return unique.flatMap(entry => this.modelEntries(provider, group, entry.model))
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
    const entry = matchRegistry(upstreamId)
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
    const reasoning = entry?.reasoning
      ?? await this.disclosedReasoning(group, upstreamId)
      ?? GROUP_DEFAULTS[group.key].reasoning
    return {
      provider,
      id: model,
      name: displayNameWithContext(displayName, contextWindow),
      inputModalities: this.acceptsImages(group, upstreamId) ? ['text', 'image'] : ['text'],
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
    const apiKey = await this.config.resolveApiKey(group)
    const connection = { baseURL, apiKey }
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
      const pending = group.protocol === 'responses'
        ? Promise.resolve(streamResponses(connection, callOptions, model))
        : this.chatCompletionsCall(connection, callOptions, group, model)
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
        throw new LlmError(`Protocom stream idle for ${streamIdleTimeoutMs}ms`, 'TIMEOUT', { cause: error })
      }
      if (options.signal?.aborted) {
        throw new LlmError('Protocom request aborted by caller', 'ABORTED', { cause: error })
      }
      throw error
    } finally {
      consumer.abort('Protocom stream consumer stopped')
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

  /** The chat-completions call, with this request's image budget applied first. */
  private async chatCompletionsCall(
    connection: ProtocolConnection,
    options: GenerateOptions,
    group: ResolvedGroup,
    model: string,
  ): Promise<AsyncIterable<StreamChunk>> {
    const { images, messages } = await this.resolveRequestImages(options, group, model)
    return streamChatCompletions(
      connection,
      messages === options.messages ? options : { ...options, messages: [...messages] },
      model,
      images,
    )
  }

  /**
   * Resolve every image this request carries into the inline data URL the
   * endpoint accepts, applying the whole-request budget first. The harness
   * already projects images away from a text-only route before dispatch, so a
   * retained image here means the route declared the `image` modality; the
   * guard still covers direct adapter use.
   * @param options - the assembled request.
   * @param group - the frozen group snapshot this request belongs to.
   * @param model - the upstream model id, variant suffix already stripped.
   * @returns provider-ready data URLs (absent when the request has none) and the
   * message projection the caller must serialize.
   */
  private async resolveRequestImages(
    options: GenerateOptions,
    group: ResolvedGroup,
    model: string,
  ): Promise<{ images: RequestImageUrls | undefined; messages: readonly Message[] }> {
    const refs = new Map<string, ImageAttachmentRef>()
    for (const message of options.messages) collectImageRefs(message.content, refs)
    if (refs.size === 0) return { images: undefined, messages: options.messages }
    if (!this.acceptsImages(group, model)) {
      throw new LlmError(`Protocom model "${model}" does not accept image input.`, 'UNSUPPORTED_CONTENT')
    }
    const attachments = this.config.resolveAttachments?.()
    if (attachments === undefined) {
      throw new LlmError(
        'Protocom image input requires the durable attachment service.',
        'UNSUPPORTED_CONTENT',
      )
    }
    const ordered = [...refs.values()]
    const resolved = await Promise.all(ordered.map(
      ref => attachments.readImageRequest(ref, REQUEST_IMAGE_POLICY, options.signal),
    ))
    const rawBytes = new Map<string, number>()
    ordered.forEach((ref, index) => {
      rawBytes.set(String(ref.attachmentId), (resolved[index] as { data: Uint8Array }).data.byteLength)
    })
    // Bound the whole request, oldest image first. The first-party adapters
    // apply this exact projection and replace each dropped occurrence with a
    // stable text placeholder, which is what keeps the replayed context
    // faithful instead of silently losing an attachment.
    const messages = offloadRequestImagesWithPolicy(options.messages, {
      representation: 'base64',
      byteLength: ref => rawBytes.get(String(ref.attachmentId)) ?? 0,
      maxBytes: REQUEST_IMAGE_TOTAL_BYTES,
      maxImages: REQUEST_IMAGE_MAX_COUNT,
      placeholder: ref => offloadedImageText(ref),
    })
    const retained = new Map<string, ImageAttachmentRef>()
    for (const message of messages) collectImageRefs(message.content, retained)
    const images = new Map<string, string>()
    ordered.forEach((ref, index) => {
      const id = String(ref.attachmentId)
      if (!retained.has(id)) return
      images.set(id, toDataUrl(resolved[index] as { mediaType: string; data: Uint8Array }))
    })
    return { images: images.size === 0 ? undefined : images, messages }
  }
}
