/**
 * Interrogate the Protocom official API's model listing. The parser is
 * tolerant on purpose: the standard OpenAI `data` array is the expected
 * shape, but entries may carry an Anthropic-style `display_name`, and some
 * groups disclose reasoning capabilities (`supportsReasoningEffort` /
 * `reasoningEfforts`). Nothing here is stored — the registered discovery
 * answers drafts a configuration surface is still editing.
 *
 * @module dsh-protocom-api/discovery
 */
import type { LlmDiscoveredModel, LlmModelDiscoveryRequest } from '@deepseek-ai/dsh-llm';
import type { UpstreamModel } from './model-registry.ts';
/**
 * Read one model-listing body. The `data` array is canonical; a top-level
 * `models` array is accepted for gateway variants. Entries without a usable
 * id are skipped rather than failing the whole interrogation.
 */
export declare function parseModelsListing(body: unknown): UpstreamModel[];
/**
 * GET the endpoint's model listing with one credential.
 * @param baseURL - endpoint root; `/v1/models` is appended.
 * @param apiKey - bearer token; omitted for an unauthenticated probe.
 * @param signal - caller cancellation.
 */
export declare function fetchUpstreamModels(baseURL: string, apiKey?: string, signal?: AbortSignal): Promise<UpstreamModel[]>;
/**
 * Canonical origin of an endpoint root, or `undefined` when it is not a usable
 * http(s) origin. WHATWG parsing is what makes two spellings of one endpoint
 * compare equal (case, punycode, default ports, IPv6 brackets) and a decorated
 * one (`user@host`, `host?x`, `relay.protocom.org.evil.test`) disagree, so the
 * comparison never runs on raw strings.
 */
export declare function endpointOrigin(raw: string): string | undefined;
/** Host-owned inputs a discovery draft deliberately omits. */
export interface DiscoveryHooks {
    /** The endpoint root from the current configuration. */
    baseURL: () => string;
    /** Resolve the stored credential of the group behind one provider route. */
    resolveApiKey: (provider: string) => Promise<string | undefined>;
}
/**
 * The registered model-discovery callback: interrogate the endpoint named by
 * the draft (or the configured endpoint for one of this plugin's routes) and
 * project the reply into harness discovery metadata. A key typed into the
 * form wins over the stored one.
 */
export declare function discoverModels(request: LlmModelDiscoveryRequest, signal: AbortSignal | undefined, hooks: DiscoveryHooks): Promise<readonly LlmDiscoveredModel[]>;
