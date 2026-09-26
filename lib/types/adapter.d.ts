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
/** How long one resolved account tier is reused. It changes per billing period. */
export declare const PLAN_TTL_MS: number;
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
    /**
     * Report a non-fatal degradation — today, a capability page that could not be
     * scraped. Absent means the deployment has no logger seam, and the
     * degradation stays silent rather than throwing.
     */
    log?: (message: string) => void;
}
/** One adapter serving every enabled route of one provider family. */
export declare class ProtocomAdapter extends LlmAdapter {
    private readonly config;
    private readonly listings;
    /**
     * The last successfully resolved listing per group. Dispatch reads it to see
     * which endpoints the gateway declared for a model, so protocol selection
     * costs no network round trip; {@link invalidateListings} drops it with the
     * promise cache so the two can never disagree.
     */
    private readonly resolved;
    /**
     * Scraped capability catalogs, keyed by page URL. Cached because the page is
     * large (~765 KB) and changes at most daily, while the menu is built on every
     * discovery and settings read.
     */
    private readonly capabilityCache;
    /**
     * The account's subscription tier per family. Cached for the same reason the
     * catalog is: it changes at most once a billing period while the menu is
     * rebuilt on every discovery and settings read.
     */
    private readonly tierCache;
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
    /**
     * The endpoints the gateway itself declared for one model, when the last
     * listing is still cached. Serving from the cache keeps dispatch free of a
     * network round trip on the hot path; a cold cache simply falls back to the
     * group's protocol, which is what every family did before this existed.
     */
    private declaredEndpoints;
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
     * The capability catalog for one family, scraped from its own page and cached.
     *
     * Absent when the family names no page. A failed scrape returns an empty map
     * with the reason recorded, so callers degrade to "no capability claims"
     * rather than failing: the listing is still enough to serve models, and the
     * menu must not empty because a marketing page changed its markup.
     * @param family - the family whose page to read.
     * @returns capabilities by id, and the reason when the scrape degraded.
     */
    private capabilities;
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
    private accountTier;
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
    /**
     * Whether a capability source stated that this model cannot reason at all.
     * @param group - the group whose listing is consulted.
     * @param upstreamId - the upstream model id.
     * @returns true only for a definite negative verdict; false when unstated.
     */
    private modelCannotReason;
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
