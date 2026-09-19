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
import type { ResolvedGroup, ResolvedProtocomOptions } from './config.ts';
/** How long one fetched model listing is reused per group. */
export declare const MODEL_LIST_TTL_MS = 60000;
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
}
