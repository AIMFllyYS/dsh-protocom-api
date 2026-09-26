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
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, PreparedAdapterCall, ResolvedRetryPolicy, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { AttachmentStore, ImageRequestPolicy } from '@deepseek-ai/dsh-attachment';
import type { ResolvedGroup, ResolvedProtocomOptions } from './config.ts';
/** How long one fetched model listing is reused per group. */
export declare const MODEL_LIST_TTL_MS = 60000;
/**
 * The request-image projection budget. Mirrors the harness's own default
 * vision budget: the attachment service re-encodes each stored image to fit,
 * so the endpoint never receives bytes beyond what a vision model is priced
 * and sized for.
 */
export declare const REQUEST_IMAGE_POLICY: ImageRequestPolicy;
/**
 * Whole-request image budget: total represented bytes and image count. The
 * single-image policy above bounds each image but not their sum, so a history
 * that repeats images would materialize unbounded base64 on every turn. These
 * mirror the first-party adapters' bounds (20 MiB, 600 images).
 */
export declare const REQUEST_IMAGE_TOTAL_BYTES: number;
/** Most image occurrences one request may transmit; see {@link REQUEST_IMAGE_TOTAL_BYTES}. */
export declare const REQUEST_IMAGE_MAX_COUNT = 600;
/** Constructor options for {@link ProtocomAdapter}: the operation-local resolution hooks the plugin owns. */
export interface ProtocomAdapterOptions {
    /** Current validated connection facts; called once per operation. */
    options: () => ResolvedProtocomOptions;
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
    resolveApiKey: (group: ResolvedGroup, sessionId?: string) => Promise<string>;
    /**
     * Report that a key just failed admission, so the pool can park it briefly.
     * Called with an `AUTH` or `RATE_LIMIT` failure; other codes are the model's
     * or the relay's problem, not the credential's.
     * @param group - the group whose key failed.
     * @param sessionId - the conversation that was being served, when any.
     */
    reportKeyFailure?: (group: ResolvedGroup, sessionId?: string) => void;
    /**
     * The deployment's durable attachment service, when one is mounted. Absent
     * means no image can be resolved, so image input is refused rather than
     * silently dropped.
     */
    resolveAttachments?: () => AttachmentStore | undefined;
}
/** One adapter serving every enabled route of one provider family. */
export declare class ProtocomAdapter extends LlmAdapter {
    private readonly config;
    private readonly listings;
    /**
     * Stable per-adapter session id for calls that arrive without
     * `GenerateOptions.sessionId`. The OpenCode Go endpoint answers 400
     * `MissingSessionID` without one, so non-conversational traffic (title
     * generation, probes) rides this value: stable per adapter, never invented
     * per request, which keeps the gateway's session accounting honest.
     */
    private readonly fallbackSession;
    constructor(config: ProtocomAdapterOptions);
    /** The family this adapter instance serves (Protocom for hand-built options). */
    private family;
    providerInfo(provider: string): LlmProviderInfo;
    providerRetryPolicy(_provider: string): ResolvedRetryPolicy;
    /** The enabled group behind one route; every dispatch path starts here. */
    private groupFor;
    /** One group's live model listing, cached briefly; failures are not cached. */
    private upstreamModels;
    /** Forget cached listings so a configuration change re-interrogates. */
    invalidateListings(): void;
    /**
     * The input modalities one route advertises for one model. Image input is
     * declared wherever the model accepts it — the deployment's own choice, then
     * the registry's verified verdict, then permissive — and both wire protocols
     * carry one, so no protocol-shaped hole is left for a capability to fall
     * into.
     */
    private inputModalitiesFor;
    /**
     * The context lengths one model should be offered at. The picker's per-model
     * choice wins — that is the surface a user actually sets — then the group's
     * own `contextLengths`, then nothing, which offers the model once at its
     * full window. A chosen length above the model's window is dropped rather
     * than advertised, because the model could not honour it.
     */
    private contextLengthsFor;
    /** The catalog entries one model advertises, one per variant. */
    private modelEntries;
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
    listModels(provider: string): Promise<readonly LlmModelInfo[]>;
    /** Endpoint-disclosed reasoning vocabulary for one model, when the listing says any. */
    private disclosedReasoning;
    private modelInfoFor;
    resolveModel(provider: string, model: string, _signal?: AbortSignal): Promise<LlmResolvedModelInfo>;
    prepareCall(provider: string, model: string, _signal?: AbortSignal): Promise<PreparedAdapterCall>;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
    private streamWithGroup;
    /**
     * The wire call for this request's protocol, with this request's image
     * budget applied first. Both protocols carry images: an image resolves to an
     * inline data URL either way, so a group's protocol can no longer decide
     * whether a multimodal model is reachable with one.
     */
    private protocolCall;
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
    private resolveRequestImages;
}
