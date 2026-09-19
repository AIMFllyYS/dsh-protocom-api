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

import { LlmAdapter, LlmError, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmModelReasoningInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  PreparedAdapterCall,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { GROUP_DEFAULTS, groupOf } from './config.ts'
import type { GroupKey, ResolvedGroup, ResolvedProtocomOptions } from './config.ts'
import {
  catalogEntry,
  displayNameWithContext,
  FALLBACK_CONTEXT_WINDOW,
  matchRegistry,
} from './model-registry.ts'
import type { RegistryReasoning, UpstreamModel } from './model-registry.ts'
import { decodeVariantId, encodeVariantId, stripVariantId, variantLengths } from './context-variants.ts'
import { fetchUpstreamModels } from './discovery.ts'
import { streamChatCompletions } from './protocol/chat-completions.ts'
import { streamResponses } from './protocol/responses.ts'

/** How long one fetched model listing is reused per group. */
export const MODEL_LIST_TTL_MS = 60_000

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

  /** The catalog entries one discovered model advertises, one per variant. */
  private modelEntries(provider: string, group: ResolvedGroup, upstream: UpstreamModel): LlmModelInfo[] {
    const model = catalogEntry(upstream, GROUP_DEFAULTS[group.key].reasoning)
    const lengths = variantLengths(model.contextOptions, group.contextLengths)
    if (lengths === undefined) {
      return [{
        provider,
        id: upstream.id,
        name: displayNameWithContext(model.displayName, model.contextWindow),
      }]
    }
    return lengths.map(length => ({
      provider,
      id: encodeVariantId(upstream.id, length),
      name: displayNameWithContext(model.displayName, length),
    }))
  }

  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    const group = this.groupFor(provider)
    let upstream: UpstreamModel[]
    try {
      upstream = await this.upstreamModels(group)
    } catch {
      // The catalog is advisory: an unreachable endpoint (or an unset key)
      // lists nothing rather than failing the surface that asked.
      return []
    }
    return upstream.flatMap(model => this.modelEntries(provider, group, model))
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
      inputModalities: ['text'],
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
    const { baseURL } = this.config.options()
    const apiKey = await this.config.resolveApiKey(group)
    const connection = { baseURL, apiKey }
    const model = stripVariantId(options.model)
    yield* group.protocol === 'responses'
      ? streamResponses(connection, options, model)
      : streamChatCompletions(connection, options, model)
  }
}
