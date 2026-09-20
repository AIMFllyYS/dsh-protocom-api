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
import type { GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, PreparedAdapterCall, StreamChunk } from '@deepseek-ai/dsh-llm';
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
/** Constructor options for {@link ProtocomAdapter}: the operation-local resolution hooks the plugin owns. */
export interface ProtocomAdapterOptions {
    /** Current validated connection facts; called once per operation. */
    options: () => ResolvedProtocomOptions;
    /**
     * Resolve the bearer token for one group. The group snapshot is passed in —
     * never re-read — so the key can only ever come from the same resolution as
     * the endpoint it is sent to. Throws `LlmError` `MISSING_CREDENTIAL` when
     * no key is available anywhere.
     */
    resolveApiKey: (group: ResolvedGroup) => Promise<string>;
    /**
     * The deployment's durable attachment service, when one is mounted. Absent
     * means no image can be resolved, so image input is refused rather than
     * silently dropped.
     */
    resolveAttachments?: () => AttachmentStore | undefined;
}
/** One adapter serving every enabled `protocom-*` provider route. */
export declare class ProtocomAdapter extends LlmAdapter {
    private readonly config;
    private readonly listings;
    constructor(config: ProtocomAdapterOptions);
    providerInfo(provider: string): LlmProviderInfo;
    /** The enabled group behind one route; every dispatch path starts here. */
    private groupFor;
    /** One group's live model listing, cached briefly; failures are not cached. */
    private upstreamModels;
    /** Forget cached listings so a configuration change re-interrogates. */
    invalidateListings(): void;
    /**
     * The input modalities one route may advertise. Image input is declared only
     * for a model the registry verified against the endpoint AND a route whose
     * protocol can actually carry an image; the responses protocol has no image
     * mapping yet, so it stays text-only rather than advertising a capability
     * that would fail at dispatch.
     */
    private modalitiesOf;
    /** Whether one exact upstream model accepts image input on this route. */
    private acceptsImages;
    /** The catalog entries one discovered model advertises, one per variant. */
    private modelEntries;
    listModels(provider: string): Promise<readonly LlmModelInfo[]>;
    /** Endpoint-disclosed reasoning vocabulary for one model, when the listing says any. */
    private disclosedReasoning;
    private modelInfoFor;
    resolveModel(provider: string, model: string, _signal?: AbortSignal): Promise<LlmResolvedModelInfo>;
    prepareCall(provider: string, model: string, _signal?: AbortSignal): Promise<PreparedAdapterCall>;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
    private streamWithGroup;
    /**
     * Resolve every image this request carries into the inline data URL the
     * endpoint accepts. The harness already projects images away from a
     * text-only route before dispatch, so a retained image here means the route
     * declared the `image` modality; the guard still covers direct adapter use.
     * @param options - the assembled request.
     * @param group - the frozen group snapshot this request belongs to.
     * @param model - the upstream model id, variant suffix already stripped.
     * @returns provider-ready data URLs, or undefined when the request has none.
     */
    private resolveRequestImages;
}
