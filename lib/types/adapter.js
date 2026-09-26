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
import { LlmAdapter, LlmError, offloadedImageText, offloadRequestImagesWithPolicy, ReasoningEffortId, } from '@deepseek-ai/dsh-llm';
import { idleWatchdog, timeoutOf } from '@deepseek-ai/dsh-timeout';
import { PROTOCOM } from "./family.js";
import { retryPolicyFor } from "./retry.js";
import { catalogFor, CATALOG_TTL_MS, MAX_CATALOG_BYTES, scrapeCatalog, } from "./commandcode-catalog.js";
import { acceptsImages, displayNameWithContext, protocolForEndpoints, FALLBACK_CONTEXT_WINDOW, groupCatalog, identityKey, matchRegistry, } from "./model-registry.js";
import { decodeVariantId, encodeVariantId, stripVariantId, variantLengths } from "./context-variants.js";
import { fetchUpstreamModels } from "./discovery.js";
import { streamChatCompletions } from "./protocol/chat-completions.js";
import { streamResponses } from "./protocol/responses.js";
/** How long one fetched model listing is reused per group. */
export const MODEL_LIST_TTL_MS = 60_000;
/**
 * The request-image projection budget. Mirrors the harness's own default
 * vision budget: the attachment service re-encodes each stored image to fit,
 * so the endpoint never receives bytes beyond what a vision model is priced
 * and sized for.
 */
export const REQUEST_IMAGE_POLICY = {
    maxPixels: 640_000,
    maxBytes: 1024 * 1024,
};
/**
 * Whole-request image budget: total represented bytes and image count. The
 * single-image policy above bounds each image but not their sum, so a history
 * that repeats images would materialize unbounded base64 on every turn. These
 * mirror the first-party adapters' bounds (20 MiB, 600 images).
 */
export const REQUEST_IMAGE_TOTAL_BYTES = 20 * 1024 * 1024;
/** Most image occurrences one request may transmit; see {@link REQUEST_IMAGE_TOTAL_BYTES}. */
export const REQUEST_IMAGE_MAX_COUNT = 600;
/** Stable code stamped onto the stream idle watchdog's abort reason. */
const STREAM_IDLE_TIMEOUT_CODE = 'LLM_STREAM_IDLE_TIMEOUT';
/** How long a non-exhausted stream's teardown may hold the caller after an abort. */
const TEARDOWN_GRACE_MS = 1_000;
/** One-shot async iterator over one promise, for demanding a non-stream step through the watchdog. */
function oneShot(promise, signal) {
    let consumed = false;
    return {
        next: async () => {
            if (consumed)
                return { done: true, value: undefined };
            consumed = true;
            return { done: false, value: await abortable(promise, signal) };
        },
    };
}
/**
 * Await one promise, rejecting as soon as the signal aborts. The idle watchdog
 * only *notifies* through its signal, so a pre-stream step that ignores that
 * signal (a store or transport that does not observe cancellation) would
 * otherwise hang the demand — and the request — forever.
 */
function abortable(promise, signal) {
    if (signal.aborted)
        return Promise.reject(signal.reason);
    return new Promise((resolve, reject) => {
        const onAbort = () => { reject(signal.reason); };
        signal.addEventListener('abort', onAbort, { once: true });
        promise.then((value) => { signal.removeEventListener('abort', onAbort); resolve(value); }, (error) => { signal.removeEventListener('abort', onAbort); reject(error); });
    });
}
/** Resolve after {@link TEARDOWN_GRACE_MS} without holding a Node process open. */
function teardownGrace() {
    return new Promise(resolve => {
        const timer = setTimeout(resolve, TEARDOWN_GRACE_MS);
        timer.unref?.();
    });
}
/** Collect every image reference a message tree carries, including tool results. */
function collectImageRefs(content, refs) {
    for (const block of content) {
        if (block.type === 'image')
            refs.set(String(block.attachment.attachmentId), block.attachment);
        else if (block.type === 'tool-result')
            collectImageRefs(block.content, refs);
    }
}
/** The inline `data:` URL one resolved request image is transmitted as. */
function toDataUrl(image) {
    return `data:${image.mediaType};base64,${Buffer.from(image.data).toString('base64')}`;
}
function reasoningInfo(reasoning) {
    return {
        efforts: reasoning.efforts.map(effort => ({
            id: ReasoningEffortId(effort),
            name: effort.charAt(0).toUpperCase() + effort.slice(1),
        })),
        ...reasoning.defaultEffort === undefined ? {} : { defaultEffort: ReasoningEffortId(reasoning.defaultEffort) },
    };
}
/** One adapter serving every enabled route of one provider family. */
export class ProtocomAdapter extends LlmAdapter {
    config;
    listings = new Map();
    /**
     * The last successfully resolved listing per group. Dispatch reads it to see
     * which endpoints the gateway declared for a model, so protocol selection
     * costs no network round trip; {@link invalidateListings} drops it with the
     * promise cache so the two can never disagree.
     */
    resolved = new Map();
    /**
     * Scraped capability catalogs, keyed by page URL. Cached because the page is
     * large (~765 KB) and changes at most daily, while the menu is built on every
     * discovery and settings read.
     */
    capabilityCache = new Map();
    /**
     * Stable per-adapter session id for calls that arrive without
     * `GenerateOptions.sessionId`. The OpenCode Go endpoint answers 400
     * `MissingSessionID` without one, so non-conversational traffic (title
     * generation, probes) rides this value: stable per adapter, never invented
     * per request, which keeps the gateway's session accounting honest.
     */
    fallbackSession = `dsh-${globalThis.crypto.randomUUID()}`;
    constructor(config) {
        super();
        this.config = config;
    }
    /** The family this adapter instance serves (Protocom for hand-built options). */
    family() {
        return this.config.options().family ?? PROTOCOM;
    }
    providerInfo(provider) {
        const family = this.family();
        const key = family.groupOf(provider);
        return { id: provider, name: key === undefined ? provider : (family.defaults[key]?.displayName ?? provider) };
    }
    providerRetryPolicy(_provider) {
        // Built from the CURRENT facts, not a value frozen at construction: the
        // harness captures a route's policy when that route is registered, and this
        // plugin re-registers on every committed settings change, so reading live
        // here is what makes a new budget reach the very next request.
        return retryPolicyFor(this.config.options());
    }
    /** The enabled group behind one route; every dispatch path starts here. */
    groupFor(provider) {
        const family = this.family();
        const key = family.groupOf(provider);
        const group = key === undefined ? undefined : this.config.options().groups.get(key);
        if (group === undefined || !group.enabled) {
            throw new LlmError(`${family.ns}: provider route "${provider}" is not an enabled group`, 'NO_PROVIDER');
        }
        return group;
    }
    /**
     * The endpoints the gateway itself declared for one model, when the last
     * listing is still cached. Serving from the cache keeps dispatch free of a
     * network round trip on the hot path; a cold cache simply falls back to the
     * group's protocol, which is what every family did before this existed.
     */
    declaredEndpoints(group, model) {
        const cached = this.resolved.get(group.key);
        if (cached === undefined)
            return undefined;
        return cached.find(row => row.id === model)?.endpoints;
    }
    /** One group's live model listing, cached briefly; failures are not cached. */
    upstreamModels(group, signal) {
        const hit = this.listings.get(group.key);
        if (hit !== undefined && Date.now() - hit.at < MODEL_LIST_TTL_MS)
            return hit.value;
        const { baseURL } = this.config.options();
        // A listing has no conversation to pin, so the pool hands out its default
        // key; nothing here is cacheable against a Session.
        const family = this.family();
        const value = this.config.resolveApiKey(group)
            .then(apiKey => fetchUpstreamModels(baseURL, apiKey, signal))
            .then(async (rows) => {
            // Enrich with the family's capability catalog, when it has one. The
            // listing is the routing truth; the catalog is the capability truth,
            // and this is where they join. A degraded scrape leaves the rows
            // untouched, so no menu depends on the page being readable.
            if (family.capabilityCatalogUrl === undefined)
                return rows;
            const { byId } = await this.capabilities(family);
            if (byId.size === 0)
                return rows;
            return rows.map((row) => {
                const found = catalogFor(byId, row.id);
                if (found === undefined)
                    return row;
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
                };
            });
        });
        value.then((rows) => {
            // A resolved listing also feeds the dispatch hot path, which must pick a
            // wire protocol without a network round trip.
            if (this.listings.get(group.key)?.value === value)
                this.resolved.set(group.key, rows);
        }).catch(() => {
            if (this.listings.get(group.key)?.value === value) {
                this.listings.delete(group.key);
                this.resolved.delete(group.key);
            }
        });
        this.listings.set(group.key, { at: Date.now(), value });
        return value;
    }
    /** Forget cached listings so a configuration change re-interrogates. */
    invalidateListings() {
        this.listings.clear();
        this.resolved.clear();
    }
    /**
     * The input modalities one route advertises for one model. Image input is
     * declared wherever the model accepts it — the deployment's own choice, then
     * the registry's verified verdict, then permissive — and both wire protocols
     * carry one, so no protocol-shaped hole is left for a capability to fall
     * into.
     */
    inputModalitiesFor(upstreamId) {
        return acceptsImages(upstreamId, this.config.options().visionModels, this.family().registry) ? ['text', 'image'] : ['text'];
    }
    /**
     * The context lengths one model should be offered at. The picker's per-model
     * choice wins — that is the surface a user actually sets — then the group's
     * own `contextLengths`, then nothing, which offers the model once at its
     * full window. A chosen length above the model's window is dropped rather
     * than advertised, because the model could not honour it.
     */
    contextLengthsFor(group, model) {
        const chosen = this.config.options().modelContexts.get(identityKey(model.upstreamId, this.family().registry));
        if (chosen !== undefined && chosen.length > 0) {
            const allowed = chosen.filter(length => length <= model.contextWindow);
            if (allowed.length > 0)
                return [...allowed].sort((left, right) => left - right);
            return undefined;
        }
        return variantLengths(model.contextOptions, group.contextLengths);
    }
    /** The catalog entries one model advertises, one per variant. */
    modelEntries(provider, group, model) {
        const inputModalities = this.inputModalitiesFor(model.upstreamId);
        const lengths = this.contextLengthsFor(group, model);
        if (lengths === undefined) {
            return [{
                    provider,
                    id: model.upstreamId,
                    name: displayNameWithContext(model.displayName, model.contextWindow),
                    inputModalities,
                }];
        }
        return lengths.map(length => ({
            provider,
            id: encodeVariantId(model.upstreamId, length),
            name: displayNameWithContext(model.displayName, length),
            inputModalities,
        }));
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
    async capabilities(family) {
        const url = family.capabilityCatalogUrl;
        if (url === undefined)
            return { byId: new Map() };
        const hit = this.capabilityCache.get(url);
        if (hit !== undefined && Date.now() - hit.at < CATALOG_TTL_MS)
            return hit.value;
        let value;
        try {
            const response = await fetch(url, { headers: { accept: 'text/html' }, redirect: 'follow' });
            if (!response.ok) {
                value = scrapeCatalog(undefined, `the capability page answered HTTP ${response.status}`);
            }
            else {
                const body = await response.text();
                value = body.length > MAX_CATALOG_BYTES
                    ? scrapeCatalog(undefined, 'the capability page was larger than the accepted bound')
                    : scrapeCatalog(body);
            }
        }
        catch (error) {
            value = scrapeCatalog(undefined, `the capability page could not be reached: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (value.problem !== undefined) {
            // Reported once per failed scrape, not per request: the degradation is
            // real but the menu keeps working, so this is a warning rather than a
            // failure the caller has to handle.
            this.config.log?.(family.ns + ': ' + value.problem + '; models will be offered without capability claims');
        }
        this.capabilityCache.set(url, { at: Date.now(), value });
        return value;
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
    async listModels(provider) {
        const group = this.groupFor(provider);
        const { hiddenModels, recommendedModels, visionModels } = this.config.options();
        let listing;
        try {
            listing = await this.upstreamModels(group);
        }
        catch {
            listing = undefined;
        }
        return groupCatalog(group.key, listing, {
            hidden: hiddenModels,
            recommended: recommendedModels,
            vision: visionModels,
            family: this.family(),
        }).flatMap(model => this.modelEntries(provider, group, model));
    }
    /**
     * Whether a capability source stated that this model cannot reason at all.
     * @param group - the group whose listing is consulted.
     * @param upstreamId - the upstream model id.
     * @returns true only for a definite negative verdict; false when unstated.
     */
    async modelCannotReason(group, upstreamId) {
        try {
            const upstream = await this.upstreamModels(group);
            return upstream.find(model => model.id === upstreamId)?.reasoning === false;
        }
        catch {
            return false;
        }
    }
    /** Endpoint-disclosed reasoning vocabulary for one model, when the listing says any. */
    async disclosedReasoning(group, upstreamId) {
        try {
            const upstream = await this.upstreamModels(group);
            const row = upstream.find(model => model.id === upstreamId);
            if (row?.reasoningEfforts === undefined || row.reasoningEfforts.length === 0)
                return undefined;
            return {
                efforts: row.reasoningEfforts,
                defaultEffort: row.reasoningEfforts.includes('high') ? 'high' : row.reasoningEfforts[0],
            };
        }
        catch {
            return undefined;
        }
    }
    async modelInfoFor(group, provider, model) {
        const { upstreamId, contextWindow: variant } = decodeVariantId(model);
        const family = this.family();
        const entry = matchRegistry(upstreamId, family.registry);
        const contextWindow = variant ?? entry?.contextWindow ?? FALLBACK_CONTEXT_WINDOW;
        let displayName = entry?.displayName;
        if (displayName === undefined) {
            try {
                const upstream = await this.upstreamModels(group);
                const row = upstream.find(candidate => candidate.id === upstreamId);
                displayName = row?.displayName !== undefined && row.displayName !== upstreamId
                    ? row.displayName
                    : upstreamId;
            }
            catch {
                displayName = upstreamId;
            }
        }
        // A capability source that says a model CANNOT reason is authoritative: the
        // model must not be sent a thinking parameter, so it gets no Effort
        // submenu. Without this gate the group's own vocabulary would offer one and
        // every request carrying an effort would be a provider error.
        const cannotReason = await this.modelCannotReason(group, upstreamId);
        const reasoning = cannotReason
            ? undefined
            : entry?.reasoning
                ?? await this.disclosedReasoning(group, upstreamId)
                ?? family.defaults[group.key]?.reasoning;
        return {
            provider,
            id: model,
            name: displayNameWithContext(displayName, contextWindow),
            inputModalities: this.inputModalitiesFor(upstreamId),
            context: { contextWindow },
            ...reasoning === undefined ? {} : { reasoning: reasoningInfo(reasoning) },
        };
    }
    resolveModel(provider, model, _signal) {
        return this.modelInfoFor(this.groupFor(provider), provider, model);
    }
    async prepareCall(provider, model, _signal) {
        const group = this.groupFor(provider);
        return {
            model: await this.modelInfoFor(group, provider, model),
            stream: options => this.streamWithGroup(options, group),
        };
    }
    stream(options) {
        return this.streamWithGroup(options, this.groupFor(options.provider));
    }
    async *streamWithGroup(options, group) {
        // One resolution per stream call: endpoint and credential freeze here and
        // hold for this whole request, so an in-flight stream never observes a
        // configuration change and the next call re-resolves.
        const { baseURL, streamIdleTimeoutMs } = this.config.options();
        const family = this.family();
        // The Session rides along so a pooled group can pin one account to this
        // conversation and keep its prefix cache warm across steps.
        const sessionId = options.sessionId === undefined ? undefined : String(options.sessionId);
        const apiKey = await this.config.resolveApiKey(group, sessionId);
        // Session scoping is contractual on OpenCode Go (a missing header answers
        // 400 MissingSessionID): the harness's own `x-deepseek-harness-session-id`
        // rides beside `x-opencode-session` carrying the same value, because the
        // gateway recognizes the native header on only some model paths.
        const headers = family.sessionHeader === undefined
            ? undefined
            : (() => {
                const session = options.sessionId === undefined ? this.fallbackSession : String(options.sessionId);
                return { [family.sessionHeader]: session, 'x-deepseek-harness-session-id': session };
            })();
        const connection = {
            baseURL,
            apiKey,
            label: family.label,
            // The clamp and the declared policy are the same number, so a provider's
            // own Retry-After is honoured up to the configured ceiling and can never
            // exceed the policy that compares against it.
            retryAfterCeilingMs: this.config.options().retryMaxDelayMs,
            ...headers === undefined ? {} : { headers },
        };
        const model = stripVariantId(options.model);
        // A provider that simply stops sending must not hold the request, its
        // socket, and the agent step open forever. The watchdog only *notifies*
        // through its signal, so the transport has to observe that same signal —
        // otherwise the timeout aborts nothing and the stalled read stays pending.
        // This mirrors the first-party adapters (F6).
        // The watchdog only notifies; the transport must observe its signal. The
        // consumer controller exists so teardown can also abort an abandoned stream
        // instead of leaving the underlying request to its own transport timeout.
        const consumer = new AbortController();
        const upstream = options.signal === undefined
            ? consumer.signal
            : AbortSignal.any([options.signal, consumer.signal]);
        const watchdog = idleWatchdog(upstream, streamIdleTimeoutMs, STREAM_IDLE_TIMEOUT_CODE);
        const callOptions = { ...options, signal: watchdog.signal };
        let iterator;
        let exhausted = false;
        try {
            // The pre-stream work (image projection, request serialization) is
            // demanded through the watchdog too, so a stall before the first chunk
            // reaches the same idle bound instead of hanging the request silently.
            const pending = this.protocolCall(connection, callOptions, group, model);
            const started = await watchdog.next(oneShot(pending, watchdog.signal));
            if (started.done === true) {
                throw new LlmError('Protocom adapter produced no stream', 'TRANSPORT');
            }
            iterator = started.value[Symbol.asyncIterator]();
            for (;;) {
                const result = await watchdog.next(iterator);
                if (result.done) {
                    exhausted = true;
                    return;
                }
                yield result.value;
            }
        }
        catch (error) {
            if (timeoutOf(watchdog.signal, STREAM_IDLE_TIMEOUT_CODE) !== undefined) {
                throw new LlmError(`${family.label} stream idle for ${streamIdleTimeoutMs}ms`, 'TIMEOUT', { cause: error });
            }
            if (options.signal?.aborted) {
                throw new LlmError(`${family.label} request aborted by caller`, 'ABORTED', { cause: error });
            }
            // Park a key the provider itself rejected. Only credential-shaped
            // failures qualify: a 5xx, a timeout, or a malformed request says nothing
            // about the key, and parking on one would rotate a healthy account out.
            const code = error.code;
            if (code === 'AUTH' || code === 'RATE_LIMIT') {
                this.config.reportKeyFailure?.(group, sessionId);
            }
            throw error;
        }
        finally {
            consumer.abort(`${family.label} stream consumer stopped`);
            watchdog[Symbol.dispose]();
            if (!exhausted && iterator !== undefined && iterator.return !== undefined) {
                const pendingReturn = iterator.return();
                try {
                    // The transport observes the watchdog's abort, so return() normally
                    // settles at once; bound it anyway so a transport that swallows the
                    // abort cannot hold this finally — and the caller's outcome — open.
                    await Promise.race([pendingReturn, teardownGrace()]);
                }
                catch {
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
    async protocolCall(connection, options, group, model) {
        const { images, messages } = await this.resolveRequestImages(options, model);
        const projected = messages === options.messages ? options : { ...options, messages: [...messages] };
        // A registry-declared wire protocol beats the group's: OpenCode Go keeps
        // one group whose models split across both surfaces (grok-4.6, muse-spark,
        // gpt-5.6-luna answer only on /responses).
        const family = this.family();
        const entry = matchRegistry(model, family.registry);
        // Precedence: a registry-declared protocol (hand-verified per model), then
        // the GATEWAY's own endpoint declaration (authoritative for a family whose
        // listing publishes it), then the group's configured default.
        const protocol = entry?.protocol
            ?? protocolForEndpoints(this.declaredEndpoints(group, model))
            ?? group.protocol;
        if (protocol === 'messages') {
            // Refused loudly rather than silently rerouted. A model that declares
            // ONLY /messages cannot be served on the OpenAI wire — the gateway
            // answers 400 — so falling back would replace a clear diagnosis with an
            // upstream error that looks like a plugin defect. The catalog filter
            // already hides these models, so reaching here means a request named one
            // directly.
            throw new LlmError(`${family.label} model "${model}" is served only on the Anthropic Messages wire, which this plugin does not implement yet;`
                + ' pick a model served on chat-completions or responses', 'NO_ADAPTER');
        }
        return protocol === 'responses'
            ? streamResponses(connection, projected, model, images)
            : streamChatCompletions(connection, projected, model, images, {
                replayReasoning: group.replayReasoning,
                assistantTextReplay: group.assistantTextReplay,
                thinking: family.chatThinking,
                inlineReasoning: entry?.inlineReasoning,
            });
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
    async resolveRequestImages(options, model) {
        const refs = new Map();
        for (const message of options.messages)
            collectImageRefs(message.content, refs);
        if (refs.size === 0)
            return { images: undefined, messages: options.messages };
        if (!acceptsImages(model, this.config.options().visionModels)) {
            throw new LlmError(`Protocom model "${model}" does not accept image input.`, 'UNSUPPORTED_CONTENT');
        }
        const attachments = this.config.resolveAttachments?.();
        if (attachments === undefined) {
            throw new LlmError('Protocom image input requires the durable attachment service.', 'UNSUPPORTED_CONTENT');
        }
        const ordered = [...refs.values()];
        const resolved = await Promise.all(ordered.map(ref => attachments.readImageRequest(ref, REQUEST_IMAGE_POLICY, options.signal)));
        const rawBytes = new Map();
        ordered.forEach((ref, index) => {
            rawBytes.set(String(ref.attachmentId), resolved[index].data.byteLength);
        });
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
        });
        const retained = new Map();
        for (const message of messages)
            collectImageRefs(message.content, retained);
        const images = new Map();
        ordered.forEach((ref, index) => {
            const id = String(ref.attachmentId);
            if (!retained.has(id))
                return;
            images.set(id, toDataUrl(resolved[index]));
        });
        return { images: images.size === 0 ? undefined : images, messages };
    }
}
