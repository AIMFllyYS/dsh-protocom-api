import { EMPTY_RESPONSE_CODE, LlmAdapter, LlmError, ProviderRequestId, ReasoningEffortId, ToolCallId, assertUsableApiKey, attributionHeaders, contentHasImage } from "@deepseek-ai/dsh-llm";
import z from "@deepseek-ai/schemastery";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { EventSourceParserStream } from "eventsource-parser/stream";
//#region src/groups.ts
/** The four groups this plugin serves; the config dict key IS the group. */
const GROUP_KEYS = [
	"aggregate",
	"codex",
	"stepfun",
	"grok"
];
/** Per-group shipped defaults. */
const GROUP_DEFAULTS = {
	aggregate: {
		displayName: "Protocom Aggregate",
		protocol: "chat-completions"
	},
	codex: {
		displayName: "Protocom Codex",
		protocol: "responses",
		reasoning: {
			efforts: [
				"minimal",
				"low",
				"medium",
				"high",
				"xhigh"
			],
			defaultEffort: "medium"
		}
	},
	stepfun: {
		displayName: "Protocom StepFun",
		protocol: "chat-completions"
	},
	grok: {
		displayName: "Protocom Grok",
		protocol: "chat-completions",
		reasoning: {
			efforts: ["low", "high"],
			defaultEffort: "high"
		}
	}
};
/** The provider route one group registers under. */
function providerOf(key) {
	return `protocom-${key}`;
}
/** The group behind one provider route, or `undefined` for a foreign route. */
function groupOf(provider) {
	if (!provider.startsWith("protocom-")) return void 0;
	const key = provider.slice(9);
	return GROUP_KEYS.includes(key) ? key : void 0;
}
//#endregion
//#region src/config.ts
/**
* Plugin config, validated by the same-named schemastery schema and doubling
* as the `protocom-api` settings-section shape. The `groups` dict is keyed by
* the four fixed group keys; each group becomes one provider route
* (`protocom-<key>`) when enabled, with its own credential reference.
*
* @module dsh-protocom-api/config
*/
/** Protocom official API endpoint base. */
const DEFAULT_BASE_URL = "https://relay.protocom.org";
const group = z.object({
	enabled: z.boolean().default(false),
	apiKey: z.string().role("credential-ref"),
	protocol: z.union(["chat-completions", "responses"]),
	contextLengths: z.array(z.number().step(1).min(1)),
	showBalance: z.boolean().default(true)
});
/** Runtime schema for {@link Config}. */
const Config = z.object({
	baseURL: z.string().default(DEFAULT_BASE_URL),
	groups: z.dict(group).default({})
});
/**
* The one explicit resolve step from raw config to validated connection
* facts. Programmatic construction may bypass Schemastery normalization, so
* every bound is re-judged here.
* @param config - raw plugin config or resolved settings snapshot.
* @returns validated connection facts for all four groups.
*/
function resolveAdapterOptions(config) {
	const baseURL = (config.baseURL ?? "https://relay.protocom.org").replace(/\/+$/, "").replace(/\/v1$/, "");
	if (!/^https?:\/\//.test(baseURL)) throw new Error("protocom-api: baseURL must be an http(s) URL");
	const supplied = config.groups ?? {};
	for (const key of Object.keys(supplied)) if (!GROUP_KEYS.includes(key)) throw new Error(`protocom-api: unknown group "${key}"; expected one of ${GROUP_KEYS.join(", ")}`);
	const groups = /* @__PURE__ */ new Map();
	for (const key of GROUP_KEYS) {
		const source = supplied[key] ?? {};
		const defaults = GROUP_DEFAULTS[key];
		if (source.contextLengths !== void 0) {
			if (source.contextLengths.some((length) => !Number.isSafeInteger(length) || length <= 0)) throw new Error(`protocom-api: group "${key}" contextLengths must be positive integers`);
			if (new Set(source.contextLengths).size !== source.contextLengths.length) throw new Error(`protocom-api: group "${key}" contextLengths must not contain duplicates`);
		}
		let apiKeyRef;
		if (source.apiKey !== void 0) try {
			apiKeyRef = credentialRef(source.apiKey);
		} catch (error) {
			throw new Error(`protocom-api: group "${key}" apiKey is not a valid credential reference`, { cause: error });
		}
		groups.set(key, {
			key,
			provider: providerOf(key),
			displayName: defaults.displayName,
			enabled: source.enabled ?? false,
			protocol: source.protocol ?? defaults.protocol,
			...apiKeyRef === void 0 ? {} : { apiKeyRef },
			...source.contextLengths === void 0 ? {} : { contextLengths: [...source.contextLengths] },
			showBalance: source.showBalance ?? true
		});
	}
	return {
		baseURL,
		groups
	};
}
//#endregion
//#region src/model-registry.ts
/** Context capacity assumed for a model the registry does not size. */
const FALLBACK_CONTEXT_WINDOW = 131072;
/** The initial registry, built from the observed model listing. */
const REGISTRY = [
	{
		match: /^deepseek\/deepseek-v4\.1-flash$/,
		displayName: "DeepSeek V4.1 Flash",
		family: "deepseek",
		contextWindow: 1048576,
		contextOptions: [
			204800,
			262144,
			409600,
			1048576
		],
		reasoning: {
			efforts: [
				"off",
				"low",
				"high",
				"max"
			],
			defaultEffort: "off"
		}
	},
	{
		match: "deepseek-v4.1-flash",
		displayName: "DeepSeek V4.1 Flash",
		family: "deepseek",
		contextWindow: 1048576,
		contextOptions: [
			204800,
			262144,
			409600,
			1048576
		],
		reasoning: {
			efforts: [
				"off",
				"low",
				"high",
				"max"
			],
			defaultEffort: "off"
		}
	},
	{
		match: "kimi-k3",
		displayName: "Kimi K3",
		family: "kimi",
		contextWindow: 262144,
		reasoning: {
			efforts: ["low", "high"],
			defaultEffort: "high"
		}
	},
	{
		match: "glm-5.3",
		displayName: "GLM-5.3",
		family: "glm",
		contextWindow: FALLBACK_CONTEXT_WINDOW
	},
	{
		match: "z-ai/glm-5.3-flash",
		displayName: "GLM-5.3 Flash",
		family: "glm",
		contextWindow: FALLBACK_CONTEXT_WINDOW
	},
	{
		match: "z-ai/glm-5.3-flashx",
		displayName: "GLM-5.3 FlashX",
		family: "glm",
		contextWindow: FALLBACK_CONTEXT_WINDOW
	},
	{
		match: "glm-5.2",
		displayName: "GLM-5.2",
		family: "glm",
		contextWindow: FALLBACK_CONTEXT_WINDOW
	},
	{
		match: "zai-org/GLM-5.2",
		displayName: "GLM-5.2",
		family: "glm",
		contextWindow: FALLBACK_CONTEXT_WINDOW
	},
	{
		match: "Qwen/Qwen3.8-27B",
		displayName: "Qwen3.8 27B",
		family: "qwen",
		contextWindow: FALLBACK_CONTEXT_WINDOW
	},
	{
		match: "Qwen/Qwen3.8-Flash",
		displayName: "Qwen3.8 Flash",
		family: "qwen",
		contextWindow: FALLBACK_CONTEXT_WINDOW
	},
	{
		match: "qwen3.8-max",
		displayName: "Qwen3.8 Max",
		family: "qwen",
		contextWindow: FALLBACK_CONTEXT_WINDOW
	},
	{
		match: "Qwen/Qwen3.7-Flash",
		displayName: "Qwen3.7 Flash",
		family: "qwen",
		contextWindow: FALLBACK_CONTEXT_WINDOW
	},
	{
		match: "Qwen/Qwen3.8-Omni-Flash",
		displayName: "Qwen3.8 Omni Flash",
		family: "qwen",
		contextWindow: FALLBACK_CONTEXT_WINDOW
	},
	{
		match: "MiniMaxAI/MiniMax-M3",
		displayName: "MiniMax M3",
		family: "minimax",
		contextWindow: FALLBACK_CONTEXT_WINDOW
	},
	{
		match: "moonshotai/Kimi-K2.7-Code",
		displayName: "Kimi K2.7 Code",
		family: "kimi",
		contextWindow: FALLBACK_CONTEXT_WINDOW
	},
	{
		match: "mimo-v2.5",
		displayName: "MiMo V2.5",
		family: "mimo",
		contextWindow: FALLBACK_CONTEXT_WINDOW
	},
	{
		match: "mimo-v2.5-pro",
		displayName: "MiMo V2.5 Pro",
		family: "mimo",
		contextWindow: FALLBACK_CONTEXT_WINDOW
	},
	{
		match: "google/gemini-3.7-flash",
		displayName: "Gemini 3.7 Flash",
		family: "gemini",
		contextWindow: FALLBACK_CONTEXT_WINDOW
	},
	{
		match: "google/gemini-3.8-flash",
		displayName: "Gemini 3.8 Flash",
		family: "gemini",
		contextWindow: FALLBACK_CONTEXT_WINDOW
	},
	{
		match: "gpt-5.6-sol",
		displayName: "GPT-5.6 Sol",
		family: "gpt",
		contextWindow: FALLBACK_CONTEXT_WINDOW
	},
	{
		match: "gpt-5.6-luna",
		displayName: "GPT-5.6 Luna",
		family: "gpt",
		contextWindow: FALLBACK_CONTEXT_WINDOW
	},
	{
		match: "tencent/hy3-paid",
		displayName: "HY-3",
		family: "hunyuan",
		contextWindow: FALLBACK_CONTEXT_WINDOW
	},
	{
		match: "tencent/hy4-preview",
		displayName: "HY-4 Preview",
		family: "hunyuan",
		contextWindow: FALLBACK_CONTEXT_WINDOW
	},
	{
		match: "meituan/LongCat-2.0:free",
		displayName: "LongCat 2.0",
		family: "longcat",
		contextWindow: FALLBACK_CONTEXT_WINDOW
	}
];
/** Find the registry entry for one upstream id. */
function matchRegistry(id) {
	return REGISTRY.find((entry) => typeof entry.match === "string" ? entry.match === id : entry.match.test(id));
}
/** Short capacity label: 200K, 256K, 400K, 1M. */
function contextLabel(tokens) {
	return tokens >= 1048576 && tokens % 1048576 === 0 ? `${tokens / 1048576}M` : `${Math.round(tokens / 1024)}K`;
}
/** Selector name for one entry at one context length: `{displayName} [{label}]`. */
function displayNameWithContext(displayName, tokens) {
	return `${displayName} [${contextLabel(tokens)}]`;
}
/**
* Project one discovered upstream model into catalog form. Registry entries
* win on every field they declare; unknown ids keep the endpoint's own
* display name when it adds information over the raw id. Reasoning metadata
* resolves registry first, then endpoint-disclosed effort lists, then the
* group's own default vocabulary.
*/
function catalogEntry(upstream, groupReasoning) {
	const entry = matchRegistry(upstream.id);
	const disclosed = upstream.reasoningEfforts !== void 0 && upstream.reasoningEfforts.length > 0 ? {
		efforts: upstream.reasoningEfforts,
		defaultEffort: upstream.reasoningEfforts.includes("high") ? "high" : upstream.reasoningEfforts[0]
	} : void 0;
	const reasoning = entry?.reasoning ?? disclosed ?? groupReasoning;
	if (entry === void 0) return {
		upstreamId: upstream.id,
		displayName: upstream.displayName !== void 0 && upstream.displayName !== upstream.id ? upstream.displayName : upstream.id,
		contextWindow: upstream.contextWindow ?? 131072,
		...reasoning === void 0 ? {} : { reasoning }
	};
	return {
		upstreamId: upstream.id,
		displayName: entry.displayName,
		contextWindow: entry.contextWindow,
		...entry.contextOptions === void 0 ? {} : { contextOptions: [...entry.contextOptions] },
		...reasoning === void 0 ? {} : { reasoning }
	};
}
//#endregion
//#region src/context-variants.ts
/**
* Context-variant id codec. A variant entry's model id is
* `<upstreamId>::ctx@<tokens>`; the suffix rides through the harness as an
* opaque model id and is stripped back to the upstream id at dispatch.
*
* @module dsh-protocom-api/context-variants
*/
const MARKER = "::ctx@";
/** Encode one upstream id and context length into a variant model id. */
function encodeVariantId(upstreamId, tokens) {
	return `${upstreamId}${MARKER}${tokens}`;
}
/**
* Split one model id into its upstream id and variant length. An absent or
* malformed suffix (non-numeric, non-positive) means "no variant": the whole
* id is the upstream id, so a literal marker inside an upstream id cannot
* corrupt dispatch.
*/
function decodeVariantId(id) {
	const at = id.lastIndexOf(MARKER);
	if (at === -1) return { upstreamId: id };
	const tokens = Number(id.slice(at + 6));
	if (!Number.isSafeInteger(tokens) || tokens <= 0) return { upstreamId: id };
	return {
		upstreamId: id.slice(0, at),
		contextWindow: tokens
	};
}
/** The upstream id a request must name, whatever variant suffix arrived. */
function stripVariantId(id) {
	return decodeVariantId(id).upstreamId;
}
/**
* The variant lengths to advertise for one model, or `undefined` for the
* single default entry with a bare id. Configuration is the switch: without
* `contextLengths` the model lists exactly as before variants existed. With
* it, registry-known models intersect with their declared options (an empty
* intersection degrades to the default entry rather than hiding the model);
* unknown models take the configured lengths directly.
*/
function variantLengths(contextOptions, configured) {
	if (configured === void 0 || configured.length === 0) return void 0;
	if (contextOptions === void 0) return [...new Set(configured)].sort((a, b) => a - b);
	const intersection = configured.filter((length) => contextOptions.includes(length));
	return intersection.length === 0 ? void 0 : [...new Set(intersection)].sort((a, b) => a - b);
}
//#endregion
//#region src/discovery.ts
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
/** Largest listing reply accepted; a truncated listing is not parseable. */
const MAX_RESPONSE_BYTES = 4194304;
function label(...candidates) {
	for (const candidate of candidates) if (typeof candidate === "string" && candidate.length > 0) return candidate;
}
function capacity(...candidates) {
	for (const candidate of candidates) if (typeof candidate === "number" && Number.isInteger(candidate) && candidate > 0) return candidate;
}
function strings(candidate) {
	if (!Array.isArray(candidate)) return void 0;
	const values = candidate.filter((value) => typeof value === "string" && value.length > 0);
	return values.length === 0 ? void 0 : values;
}
/**
* Read one model-listing body. The `data` array is canonical; a top-level
* `models` array is accepted for gateway variants. Entries without a usable
* id are skipped rather than failing the whole interrogation.
*/
function parseModelsListing(body) {
	const listing = body;
	const rows = Array.isArray(listing?.data) ? listing.data : Array.isArray(listing?.models) ? listing.models : void 0;
	if (rows === void 0) throw new LlmError("the endpoint's model listing has neither a \"data\" nor a \"models\" array; enter this provider's models by hand", "DISCOVERY_FAILED");
	const models = [];
	for (const raw of rows) {
		if (raw === null || typeof raw !== "object" || Array.isArray(raw)) continue;
		const entry = raw;
		const id = label(entry.id);
		if (id === void 0) continue;
		const displayName = label(entry.display_name, entry.displayName, entry.name);
		const contextWindow = capacity(entry.context_window, entry.context_length, entry.contextWindow, entry.max_input_tokens);
		const maxTokens = capacity(entry.max_output_tokens, entry.max_tokens);
		const reasoningEfforts = strings(entry.reasoningEfforts) ?? strings(entry.reasoning_efforts);
		const supports = entry.supportsReasoningEffort === true || entry.supports_reasoning_effort === true;
		models.push({
			id,
			...displayName === void 0 ? {} : { displayName },
			...contextWindow === void 0 ? {} : { contextWindow },
			...maxTokens === void 0 ? {} : { maxTokens },
			...supports ? { supportsReasoningEffort: true } : {},
			...reasoningEfforts === void 0 ? {} : { reasoningEfforts }
		});
	}
	return models;
}
/**
* GET the endpoint's model listing with one credential.
* @param baseURL - endpoint root; `/v1/models` is appended.
* @param apiKey - bearer token; omitted for an unauthenticated probe.
* @param signal - caller cancellation.
*/
async function fetchUpstreamModels(baseURL, apiKey, signal) {
	const url = `${baseURL}/v1/models`;
	let response;
	try {
		response = await fetch(url, {
			method: "GET",
			headers: {
				"accept": "application/json",
				...apiKey === void 0 ? {} : { "authorization": `Bearer ${apiKey}` },
				...attributionHeaders()
			},
			...signal === void 0 ? {} : { signal }
		});
	} catch (error) {
		if (signal?.aborted) throw new LlmError("model discovery aborted by caller", "ABORTED", { cause: error });
		throw new LlmError(`could not reach ${url}`, "DISCOVERY_FAILED", { cause: error });
	}
	if (!response.ok) throw new LlmError(`${url} answered ${response.status}${response.status === 401 || response.status === 403 ? "; check the API key" : ""}`, "DISCOVERY_FAILED");
	const declared = Number(response.headers.get("content-length") ?? NaN);
	if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
		await response.body?.cancel();
		throw new LlmError(`${url} answered with more than ${MAX_RESPONSE_BYTES} bytes`, "DISCOVERY_FAILED");
	}
	const text = await response.text();
	if (text.length > MAX_RESPONSE_BYTES) throw new LlmError(`${url} answered with more than ${MAX_RESPONSE_BYTES} bytes`, "DISCOVERY_FAILED");
	let body;
	try {
		body = JSON.parse(text);
	} catch (error) {
		throw new LlmError(`${url} did not answer with JSON`, "DISCOVERY_FAILED", { cause: error });
	}
	return parseModelsListing(body);
}
/**
* The registered model-discovery callback: interrogate the endpoint named by
* the draft (or the configured endpoint for one of this plugin's routes) and
* project the reply into harness discovery metadata. A key typed into the
* form wins over the stored one.
*/
async function discoverModels(request, signal, hooks) {
	return (await fetchUpstreamModels(request.baseURL !== void 0 && request.baseURL.length > 0 ? request.baseURL.replace(/\/+$/, "").replace(/\/v1$/, "") : hooks.baseURL(), request.apiKey ?? (request.provider === void 0 ? void 0 : await hooks.resolveApiKey(request.provider)), signal)).map((model) => ({
		id: model.id,
		...model.displayName === void 0 ? {} : { name: model.displayName },
		...model.contextWindow === void 0 ? {} : { contextWindow: model.contextWindow },
		...model.maxTokens === void 0 ? {} : { maxTokens: model.maxTokens }
	}));
}
async function* read(stream) {
	const events = stream.pipeThrough(new TextDecoderStream()).pipeThrough(new EventSourceParserStream());
	for await (const { data } of events) yield data;
}
/**
* Parse a chat-completions SSE stream into data payloads. Yields `[DONE]` as
* the final value and returns; throws `LlmError('STREAM_CLOSED')` when the
* stream ends without it (a truncated response cannot be trusted).
*/
async function* parseSse(stream) {
	for await (const data of read(stream)) {
		yield data;
		if (data === "[DONE]") return;
	}
	throw new LlmError("SSE stream ended without [DONE]", "STREAM_CLOSED");
}
/**
* Parse an SSE stream whose protocol may end by closing (responses): yields
* payloads through `[DONE]` or EOF, whichever comes first.
*/
async function* parseSseUntilEof(stream) {
	for await (const data of read(stream)) {
		yield data;
		if (data === "[DONE]") return;
	}
}
//#endregion
//#region src/protocol/http.ts
/**
* Shared transport for the two wire protocols: one POST with a JSON body
* answered by an SSE stream. Every provider request carries the harness
* attribution headers; HTTP failures map to the provider-neutral LlmError
* code taxonomy.
*
* @module dsh-protocom-api/protocol/http
*/
/** Map an HTTP status to a stable LlmError code. */
function httpErrorCode(status) {
	if (status === 401 || status === 403) return "AUTH";
	if (status === 413) return "INVALID_REQUEST";
	if (status === 429) return "RATE_LIMIT";
	if (status === 400) return "INVALID_REQUEST";
	if (status >= 500) return "SERVER";
	return `HTTP_${status}`;
}
function providerRetryAfterMs(value) {
	if (value === null) return void 0;
	if (/^\d+$/.test(value)) {
		const delay = Number(value) * 1e3;
		return Number.isFinite(delay) && delay > 0 ? delay : void 0;
	}
	const delay = Date.parse(value) - Date.now();
	return Number.isFinite(delay) && delay > 0 ? delay : void 0;
}
/**
* POST one JSON body and return the SSE response. Transport and HTTP
* failures throw coded LlmErrors; the caller owns stream decoding.
*/
async function postSse(connection, path, body, signal) {
	const url = `${connection.baseURL}/v1/${path}`;
	let response;
	try {
		response = await fetch(url, {
			method: "POST",
			headers: {
				"authorization": `Bearer ${connection.apiKey}`,
				"content-type": "application/json",
				"accept": "text/event-stream",
				...attributionHeaders()
			},
			body: JSON.stringify(body),
			...signal === void 0 ? {} : { signal }
		});
	} catch (error) {
		if (signal?.aborted) throw new LlmError("Protocom request aborted by caller", "ABORTED", { cause: error });
		throw new LlmError(`Protocom API request to ${url} failed`, "TRANSPORT", { cause: error });
	}
	if (response.ok) {
		if (!response.body) throw new LlmError("Protocom API returned no response body", "EMPTY_RESPONSE");
		return response;
	}
	let message = `Protocom API error (HTTP ${response.status})`;
	let providerError;
	const rawResponse = await response.text();
	try {
		providerError = JSON.parse(rawResponse).error;
		if (providerError?.message) message = providerError.message;
	} catch {}
	const delay = providerRetryAfterMs(response.headers.get("retry-after"));
	const id = response.headers.get("x-request-id");
	throw new LlmError(message, httpErrorCode(response.status), {
		cause: new Error(rawResponse.length > 0 ? rawResponse : `Protocom HTTP ${response.status}`),
		status: response.status,
		...delay === void 0 ? {} : { providerRetryAfterMs: delay },
		...id === null || id.length === 0 ? {} : { requestId: ProviderRequestId(id) }
	});
}
//#endregion
//#region src/protocol/chat-completions.ts
/**
* OpenAI chat-completions wire protocol: request serialization (thinking
* fields ported from llm-deepseek's serialize.ts) and SSE translation into
* harness StreamChunks (after llm-deepseek's translate.ts). Two upstream
* quirks drive the differences: intermediate chunks may carry an empty-string
* `finish_reason` that means "not finished", and thinking models stream
* `delta.reasoning_content`.
*
* @module dsh-protocom-api/protocol/chat-completions
*/
/**
* Resolve the wire thinking fields for one request. `off` disables thinking
* explicitly; any other effort enables it and rides as `reasoning_effort`;
* an absent effort leaves the provider's own default alone.
*/
function resolveThinking(effort) {
	if (effort === "off") return { thinking: { type: "disabled" } };
	if (effort !== void 0) return {
		thinking: { type: "enabled" },
		reasoning_effort: effort
	};
	return {};
}
/**
* Map wire usage fields to the harness's DISJOINT counts: the endpoint folds
* cache hits into `prompt_tokens`, so cached reads are subtracted out of
* `inputTokens` and reported separately.
*/
function mapUsage(usage) {
	const cacheRead = usage.prompt_tokens_details?.cached_tokens;
	const reasoning = usage.completion_tokens_details?.reasoning_tokens;
	const combined = usage.prompt_tokens + usage.completion_tokens;
	const hasExactTotal = Number.isSafeInteger(usage.prompt_tokens) && usage.prompt_tokens >= 0 && Number.isSafeInteger(usage.completion_tokens) && usage.completion_tokens >= 0 && Number.isSafeInteger(combined) && (usage.total_tokens === void 0 || usage.total_tokens === combined);
	return {
		inputTokens: usage.prompt_tokens - (cacheRead ?? 0),
		outputTokens: usage.completion_tokens,
		...hasExactTotal ? { totalTokens: combined } : {},
		...cacheRead !== void 0 ? { cacheReadTokens: cacheRead } : {},
		...reasoning !== void 0 ? { reasoningTokens: reasoning } : {}
	};
}
/**
* Map the wire finish_reason vocabulary to the harness FinishReason.
* Unrecognized values become `{kind: 'error'}` with the uppercased value as
* `code`.
*/
function mapFinishReason(reason) {
	switch (reason) {
		case "stop": return { kind: "stop" };
		case "tool_calls": return { kind: "tool-calls" };
		case "length": return { kind: "max-tokens" };
		default: return {
			kind: "error",
			failure: {
				message: `model stopped: ${reason}`,
				code: reason.toUpperCase()
			}
		};
	}
}
function flattenText$1(blocks) {
	return blocks.filter((block) => block.type === "text").map((block) => block.text).join("");
}
function assertTextOnly(blocks) {
	if (contentHasImage(blocks)) throw new LlmError("The protocom-api chat-completions adapter does not support image content.", "UNSUPPORTED_CONTENT");
}
function wireMessage(message) {
	assertTextOnly(message.content);
	if (message.role === "system") return {
		role: "system",
		content: flattenText$1(message.content)
	};
	if (message.role === "user") {
		const result = message.content.find((block) => block.type === "tool-result");
		if (result !== void 0) {
			assertTextOnly(result.content);
			return {
				role: "tool",
				tool_call_id: String(result.toolCallId),
				content: flattenText$1(result.content)
			};
		}
		return {
			role: "user",
			content: flattenText$1(message.content)
		};
	}
	const text = flattenText$1(message.content);
	const reasoning = message.content.filter((block) => block.type === "reasoning").map((block) => block.text).join("");
	const toolCalls = message.content.filter((block) => block.type === "tool-call").map((block) => ({
		id: String(block.id),
		type: "function",
		function: {
			name: block.name,
			arguments: block.arguments
		}
	}));
	return {
		role: "assistant",
		content: text,
		...reasoning.length > 0 ? { reasoning_content: reasoning } : {},
		...toolCalls.length > 0 ? { tool_calls: toolCalls } : {}
	};
}
/** Serialize one request into the chat-completions wire body. */
function serializeChatRequest(options, model) {
	const messages = [];
	if (options.system !== void 0) messages.push({
		role: "system",
		content: options.system
	});
	for (const message of options.messages) messages.push(wireMessage(message));
	return {
		model,
		messages,
		stream: true,
		...options.temperature === void 0 ? {} : { temperature: options.temperature },
		...options.maxTokens === void 0 ? {} : { max_tokens: options.maxTokens },
		...options.stop === void 0 || options.stop.length === 0 ? {} : { stop: options.stop },
		...options.tools === void 0 || options.tools.length === 0 ? {} : { tools: options.tools.map((tool) => ({
			type: "function",
			function: {
				name: tool.name,
				description: tool.description,
				parameters: tool.parameters
			}
		})) },
		...resolveThinking(options.reasoningEffort)
	};
}
function closeBlock$1(block) {
	switch (block.kind) {
		case "text": return {
			type: "text",
			text: block.text
		};
		case "reasoning": return {
			type: "reasoning",
			text: block.text
		};
		case "tool-call": return {
			type: "tool-call",
			id: ToolCallId(block.callId ?? ""),
			name: block.name ?? "",
			arguments: block.text
		};
	}
}
/** `id` and `name` are identity: the wire sends each once, on the call's first delta. */
function acceptIdentity(current, incoming) {
	return typeof incoming === "string" && incoming.length > 0 ? incoming : current;
}
/**
* Consume SSE data payloads (ending with `[DONE]`) and yield StreamChunks.
* `block-end`s, `usage`, and `finish` are deferred to the `[DONE]` sentinel
* so no chunk follows `finish`. A `stop` (or absent) finish with no opened
* blocks maps to an `EMPTY_RESPONSE` error finish instead of a successful
* empty message.
*/
async function* translateChatCompletions(payloads) {
	let nextIndex = 0;
	let textBlock;
	let reasoningBlock;
	const toolBlocks = /* @__PURE__ */ new Map();
	const order = [];
	let pendingFinish;
	let pendingUsage;
	function open(kind) {
		const block = {
			index: nextIndex++,
			kind,
			text: ""
		};
		order.push(block);
		return block;
	}
	for await (const payload of payloads) {
		if (payload === "[DONE]") {
			for (const block of order) yield {
				type: "block-end",
				index: block.index,
				block: closeBlock$1(block)
			};
			if (pendingUsage) yield {
				type: "usage",
				usage: pendingUsage
			};
			const reason = pendingFinish ?? { kind: "stop" };
			yield {
				type: "finish",
				reason: reason.kind === "stop" && order.length === 0 ? {
					kind: "error",
					failure: {
						message: "model returned a completed response with no content",
						code: EMPTY_RESPONSE_CODE
					}
				} : reason
			};
			return;
		}
		let chunk;
		try {
			chunk = JSON.parse(payload);
		} catch {
			throw new LlmError(`malformed SSE payload: ${payload.slice(0, 120)}`, "MALFORMED_RESPONSE");
		}
		for (const choice of chunk.choices ?? []) {
			const delta = choice.delta;
			const reasoning = delta?.reasoning_content;
			if (typeof reasoning === "string" && reasoning.length > 0) {
				if (!reasoningBlock) {
					reasoningBlock = open("reasoning");
					yield {
						type: "block-start",
						index: reasoningBlock.index,
						blockType: "reasoning"
					};
				}
				reasoningBlock.text += reasoning;
				yield {
					type: "reasoning-delta",
					index: reasoningBlock.index,
					text: reasoning
				};
			}
			const content = delta?.content;
			if (typeof content === "string" && content.length > 0) {
				if (!textBlock) {
					textBlock = open("text");
					yield {
						type: "block-start",
						index: textBlock.index,
						blockType: "text"
					};
				}
				textBlock.text += content;
				yield {
					type: "text-delta",
					index: textBlock.index,
					text: content
				};
			}
			for (const call of delta?.tool_calls ?? []) {
				let block = toolBlocks.get(call.index);
				if (!block) {
					block = open("tool-call");
					toolBlocks.set(call.index, block);
					yield {
						type: "block-start",
						index: block.index,
						blockType: "tool-call"
					};
				}
				block.callId = acceptIdentity(block.callId, call.id);
				block.name = acceptIdentity(block.name, call.function?.name);
				const fragment = call.function?.arguments ?? "";
				block.text += fragment;
				yield {
					type: "tool-call-delta",
					index: block.index,
					id: ToolCallId(block.callId ?? ""),
					...block.name !== void 0 ? { name: block.name } : {},
					argumentsDelta: fragment
				};
			}
			if (typeof choice.finish_reason === "string" && choice.finish_reason.length > 0) pendingFinish = mapFinishReason(choice.finish_reason);
		}
		if (chunk.usage) pendingUsage = mapUsage(chunk.usage);
	}
	throw new LlmError("SSE payload stream ended without [DONE]", "STREAM_CLOSED");
}
/** Stream one chat-completions call as harness chunks. */
async function* streamChatCompletions(connection, options, model) {
	yield* translateChatCompletions(parseSse((await postSse(connection, "chat/completions", serializeChatRequest(options, model), options.signal)).body));
}
//#endregion
//#region src/protocol/responses.ts
/**
* OpenAI responses wire protocol (the Codex group). Minimal hand-rolled SSE
* handling: requests map messages to `input` items and the reasoning effort
* to `reasoning.effort`; stream events resolve through their payload `type`
* field, terminating at `response.completed` / `response.failed` rather than
* relying on a `[DONE]` sentinel.
*
* @module dsh-protocom-api/protocol/responses
*/
/**
* Map wire usage fields to the harness's DISJOINT counts: cached input is
* folded into `input_tokens`, so it is subtracted out and reported
* separately.
*/
function mapResponseUsage(usage) {
	const cacheRead = usage.input_tokens_details?.cached_tokens;
	const reasoning = usage.output_tokens_details?.reasoning_tokens;
	const combined = usage.input_tokens + usage.output_tokens;
	const hasExactTotal = Number.isSafeInteger(usage.input_tokens) && usage.input_tokens >= 0 && Number.isSafeInteger(usage.output_tokens) && usage.output_tokens >= 0 && Number.isSafeInteger(combined) && (usage.total_tokens === void 0 || usage.total_tokens === combined);
	return {
		inputTokens: usage.input_tokens - (cacheRead ?? 0),
		outputTokens: usage.output_tokens,
		...hasExactTotal ? { totalTokens: combined } : {},
		...cacheRead !== void 0 ? { cacheReadTokens: cacheRead } : {},
		...reasoning !== void 0 ? { reasoningTokens: reasoning } : {}
	};
}
function flattenText(blocks) {
	return blocks.filter((block) => block.type === "text").map((block) => block.text).join("");
}
function inputTextItem(role, text) {
	return {
		type: "message",
		role,
		content: [{
			type: "input_text",
			text
		}]
	};
}
function wireInput(message) {
	if (contentHasImage(message.content)) throw new LlmError("The protocom-api responses adapter does not support image content.", "UNSUPPORTED_CONTENT");
	if (message.role === "system") return [inputTextItem("system", flattenText(message.content))];
	if (message.role === "user") {
		const result = message.content.find((block) => block.type === "tool-result");
		if (result !== void 0) {
			if (contentHasImage(result.content)) throw new LlmError("The protocom-api responses adapter does not support image content.", "UNSUPPORTED_CONTENT");
			return [{
				type: "function_call_output",
				call_id: String(result.toolCallId),
				output: flattenText(result.content)
			}];
		}
		return [inputTextItem("user", flattenText(message.content))];
	}
	const items = [];
	const text = flattenText(message.content);
	if (text.length > 0) items.push({
		type: "message",
		role: "assistant",
		content: [{
			type: "output_text",
			text
		}]
	});
	for (const block of message.content) {
		if (block.type !== "tool-call") continue;
		items.push({
			type: "function_call",
			call_id: String(block.id),
			name: block.name,
			arguments: block.arguments
		});
	}
	return items;
}
/**
* Serialize one request into the responses wire body. Any effort but `off`
* maps to `reasoning.effort`; `off` and an absent effort both omit the field
* (the protocol has no explicit disabled spelling).
*/
function serializeResponsesRequest(options, model) {
	const input = [];
	for (const message of options.messages) input.push(...wireInput(message));
	const effort = options.reasoningEffort;
	return {
		model,
		input,
		stream: true,
		store: false,
		...options.system === void 0 ? {} : { instructions: options.system },
		...effort === void 0 || effort === "off" ? {} : { reasoning: { effort } },
		...options.temperature === void 0 ? {} : { temperature: options.temperature },
		...options.maxTokens === void 0 ? {} : { max_output_tokens: options.maxTokens },
		...options.tools === void 0 || options.tools.length === 0 ? {} : { tools: options.tools.map((tool) => ({
			type: "function",
			name: tool.name,
			description: tool.description,
			parameters: tool.parameters
		})) }
	};
}
function closeBlock(block) {
	switch (block.kind) {
		case "text": return {
			type: "text",
			text: block.text
		};
		case "reasoning": return {
			type: "reasoning",
			text: block.text
		};
		case "tool-call": return {
			type: "tool-call",
			id: ToolCallId(block.callId ?? ""),
			name: block.name ?? "",
			arguments: block.text
		};
	}
}
/**
* Consume responses-protocol SSE payloads and yield StreamChunks. The
* terminal state arrives as a `response.completed` / `response.failed` event
* (or stream EOF); `block-end`s, `usage`, and `finish` are emitted only then,
* so no chunk follows `finish`.
*/
async function* translateResponses(payloads) {
	let nextIndex = 0;
	let textBlock;
	let reasoningBlock;
	const order = [];
	let pendingFinish;
	let pendingUsage;
	let sawToolCall = false;
	function open(kind) {
		const block = {
			index: nextIndex++,
			kind,
			text: ""
		};
		order.push(block);
		return block;
	}
	for await (const payload of payloads) {
		if (payload === "[DONE]") break;
		let event;
		try {
			event = JSON.parse(payload);
		} catch {
			throw new LlmError(`malformed SSE payload: ${payload.slice(0, 120)}`, "MALFORMED_RESPONSE");
		}
		switch (event.type) {
			case "response.output_text.delta":
				if (typeof event.delta !== "string" || event.delta.length === 0) break;
				if (!textBlock) {
					textBlock = open("text");
					yield {
						type: "block-start",
						index: textBlock.index,
						blockType: "text"
					};
				}
				textBlock.text += event.delta;
				yield {
					type: "text-delta",
					index: textBlock.index,
					text: event.delta
				};
				break;
			case "response.reasoning_summary_text.delta":
				if (typeof event.delta !== "string" || event.delta.length === 0) break;
				if (!reasoningBlock) {
					reasoningBlock = open("reasoning");
					yield {
						type: "block-start",
						index: reasoningBlock.index,
						blockType: "reasoning"
					};
				}
				reasoningBlock.text += event.delta;
				yield {
					type: "reasoning-delta",
					index: reasoningBlock.index,
					text: event.delta
				};
				break;
			case "response.output_item.done": {
				const item = event.item;
				if (item?.type !== "function_call") break;
				sawToolCall = true;
				const block = open("tool-call");
				block.callId = typeof item.call_id === "string" ? item.call_id : void 0;
				block.name = typeof item.name === "string" ? item.name : void 0;
				block.text = typeof item.arguments === "string" ? item.arguments : "";
				yield {
					type: "block-start",
					index: block.index,
					blockType: "tool-call"
				};
				yield {
					type: "tool-call-delta",
					index: block.index,
					id: ToolCallId(block.callId ?? ""),
					...block.name !== void 0 ? { name: block.name } : {},
					argumentsDelta: block.text
				};
				break;
			}
			case "response.completed":
			case "response.incomplete": {
				if (event.response?.usage) pendingUsage = mapResponseUsage(event.response.usage);
				const reason = event.response?.incomplete_details?.reason;
				pendingFinish = sawToolCall ? { kind: "tool-calls" } : reason === "max_output_tokens" || reason === "max_tokens" ? { kind: "max-tokens" } : { kind: "stop" };
				break;
			}
			case "response.failed":
				pendingFinish = {
					kind: "error",
					failure: {
						message: event.response?.error?.message ?? "the model call failed",
						code: event.response?.error?.code ?? "PROVIDER_ERROR"
					}
				};
				break;
			case "error": pendingFinish = {
				kind: "error",
				failure: {
					message: event.message ?? "the model call failed",
					code: event.code ?? "PROVIDER_ERROR"
				}
			};
		}
	}
	for (const block of order) yield {
		type: "block-end",
		index: block.index,
		block: closeBlock(block)
	};
	if (pendingUsage) yield {
		type: "usage",
		usage: pendingUsage
	};
	const reason = pendingFinish ?? (sawToolCall ? { kind: "tool-calls" } : { kind: "stop" });
	yield {
		type: "finish",
		reason: reason.kind === "stop" && order.length === 0 ? {
			kind: "error",
			failure: {
				message: "model returned a completed response with no content",
				code: EMPTY_RESPONSE_CODE
			}
		} : reason
	};
}
/** Stream one responses-protocol call as harness chunks. */
async function* streamResponses(connection, options, model) {
	yield* translateResponses(parseSseUntilEof((await postSse(connection, "responses", serializeResponsesRequest(options, model), options.signal)).body));
}
function reasoningInfo(reasoning) {
	return {
		efforts: reasoning.efforts.map((effort) => ({
			id: ReasoningEffortId(effort),
			name: effort.charAt(0).toUpperCase() + effort.slice(1)
		})),
		...reasoning.defaultEffort === void 0 ? {} : { defaultEffort: ReasoningEffortId(reasoning.defaultEffort) }
	};
}
/** One adapter serving every enabled `protocom-*` provider route. */
var ProtocomAdapter = class extends LlmAdapter {
	config;
	listings = /* @__PURE__ */ new Map();
	constructor(config) {
		super();
		this.config = config;
	}
	providerInfo(provider) {
		const key = groupOf(provider);
		return {
			id: provider,
			name: key === void 0 ? provider : GROUP_DEFAULTS[key].displayName
		};
	}
	/** The enabled group behind one route; every dispatch path starts here. */
	groupFor(provider) {
		const key = groupOf(provider);
		const group = key === void 0 ? void 0 : this.config.options().groups.get(key);
		if (group === void 0 || !group.enabled) throw new LlmError(`protocom-api: provider route "${provider}" is not an enabled group`, "NO_PROVIDER");
		return group;
	}
	/** One group's live model listing, cached briefly; failures are not cached. */
	upstreamModels(group, signal) {
		const hit = this.listings.get(group.key);
		if (hit !== void 0 && Date.now() - hit.at < 6e4) return hit.value;
		const { baseURL } = this.config.options();
		const value = this.config.resolveApiKey(group).then((apiKey) => fetchUpstreamModels(baseURL, apiKey, signal));
		value.catch(() => {
			if (this.listings.get(group.key)?.value === value) this.listings.delete(group.key);
		});
		this.listings.set(group.key, {
			at: Date.now(),
			value
		});
		return value;
	}
	/** Forget cached listings so a configuration change re-interrogates. */
	invalidateListings() {
		this.listings.clear();
	}
	/** The catalog entries one discovered model advertises, one per variant. */
	modelEntries(provider, group, upstream) {
		const model = catalogEntry(upstream, GROUP_DEFAULTS[group.key].reasoning);
		const lengths = variantLengths(model.contextOptions, group.contextLengths);
		if (lengths === void 0) return [{
			provider,
			id: upstream.id,
			name: displayNameWithContext(model.displayName, model.contextWindow)
		}];
		return lengths.map((length) => ({
			provider,
			id: encodeVariantId(upstream.id, length),
			name: displayNameWithContext(model.displayName, length)
		}));
	}
	async listModels(provider) {
		const group = this.groupFor(provider);
		let upstream;
		try {
			upstream = await this.upstreamModels(group);
		} catch {
			return [];
		}
		return upstream.flatMap((model) => this.modelEntries(provider, group, model));
	}
	/** Endpoint-disclosed reasoning vocabulary for one model, when the listing says any. */
	async disclosedReasoning(group, upstreamId) {
		try {
			const row = (await this.upstreamModels(group)).find((model) => model.id === upstreamId);
			if (row?.reasoningEfforts === void 0 || row.reasoningEfforts.length === 0) return void 0;
			return {
				efforts: row.reasoningEfforts,
				defaultEffort: row.reasoningEfforts.includes("high") ? "high" : row.reasoningEfforts[0]
			};
		} catch {
			return;
		}
	}
	async modelInfoFor(group, provider, model) {
		const { upstreamId, contextWindow: variant } = decodeVariantId(model);
		const entry = matchRegistry(upstreamId);
		const contextWindow = variant ?? entry?.contextWindow ?? 131072;
		let displayName = entry?.displayName;
		if (displayName === void 0) try {
			const row = (await this.upstreamModels(group)).find((candidate) => candidate.id === upstreamId);
			displayName = row?.displayName !== void 0 && row.displayName !== upstreamId ? row.displayName : upstreamId;
		} catch {
			displayName = upstreamId;
		}
		const reasoning = entry?.reasoning ?? await this.disclosedReasoning(group, upstreamId) ?? GROUP_DEFAULTS[group.key].reasoning;
		return {
			provider,
			id: model,
			name: displayNameWithContext(displayName, contextWindow),
			inputModalities: ["text"],
			context: { contextWindow },
			...reasoning === void 0 ? {} : { reasoning: reasoningInfo(reasoning) }
		};
	}
	resolveModel(provider, model, _signal) {
		return this.modelInfoFor(this.groupFor(provider), provider, model);
	}
	async prepareCall(provider, model, _signal) {
		const group = this.groupFor(provider);
		return {
			model: await this.modelInfoFor(group, provider, model),
			stream: (options) => this.streamWithGroup(options, group)
		};
	}
	stream(options) {
		return this.streamWithGroup(options, this.groupFor(options.provider));
	}
	async *streamWithGroup(options, group) {
		const { baseURL } = this.config.options();
		const connection = {
			baseURL,
			apiKey: await this.config.resolveApiKey(group)
		};
		const model = stripVariantId(options.model);
		yield* group.protocol === "responses" ? streamResponses(connection, options, model) : streamChatCompletions(connection, options, model);
	}
};
//#endregion
//#region src/balance.ts
/**
* Balance queries against the Protocom official API's usage endpoint, with a
* 60-second per-group cache and the loopback-only HTTP surface the web
* settings page polls. Quota-limited and subscription/wallet deployments
* answer with different shapes; both normalize into {@link GroupBalance}.
* The billing-rate endpoint is absent on simple deployments, so its failure
* is never fatal.
*
* @module dsh-protocom-api/balance
*/
const RATE_MULTIPLIER_PATH = "/v1/sub2api/billing";
function numberField(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function stringField(value) {
	return typeof value === "string" && value.length > 0 ? value : void 0;
}
/**
* Normalize one `/v1/usage` reply. Quota deployments carry `quota{limit,used,
* remaining}`; subscription deployments carry `balance`, `planName`, and a
* `subscription` block. Unrecognized fields are ignored, and both shapes may
* coexist.
*/
function parseUsage(body) {
	if (body === null || typeof body !== "object" || Array.isArray(body)) throw new LlmError("the usage endpoint did not answer with an object", "BALANCE_FAILED");
	const report = body;
	const today = report.usage?.today;
	const balance = {};
	const mode = stringField(report.mode);
	if (mode !== void 0) balance.mode = mode;
	const status = stringField(report.status);
	if (status !== void 0) balance.status = status;
	const unit = stringField(report.unit);
	if (unit !== void 0) balance.unit = unit;
	const limit = numberField(report.quota?.limit);
	if (limit !== void 0) balance.limit = limit;
	const used = numberField(report.quota?.used);
	if (used !== void 0) balance.used = used;
	const remaining = numberField(report.quota?.remaining ?? report.remaining);
	if (remaining !== void 0) balance.remaining = remaining;
	const balanceField = numberField(report.balance);
	if (balanceField !== void 0) balance.balance = balanceField;
	const planName = stringField(report.planName);
	if (planName !== void 0) balance.planName = planName;
	const dailyUsageUsd = numberField(report.subscription?.daily_usage_usd);
	if (dailyUsageUsd !== void 0) balance.dailyUsageUsd = dailyUsageUsd;
	const dailyLimitUsd = numberField(report.subscription?.daily_limit_usd);
	if (dailyLimitUsd !== void 0) balance.dailyLimitUsd = dailyLimitUsd;
	const expiresAt = stringField(report.subscription?.expires_at);
	if (expiresAt !== void 0) balance.expiresAt = expiresAt;
	const todayRequests = numberField(today?.requests);
	if (todayRequests !== void 0) balance.todayRequests = todayRequests;
	const todayCost = numberField(today?.cost);
	if (todayCost !== void 0) balance.todayCost = todayCost;
	const rpm = numberField(report.usage?.rpm);
	if (rpm !== void 0) balance.rpm = rpm;
	const tpm = numberField(report.usage?.tpm);
	if (tpm !== void 0) balance.tpm = tpm;
	return balance;
}
/** Normalize one billing-rate reply; absent fields stay absent. */
function parseRateMultiplier(body) {
	const parsed = {};
	if (body === null || typeof body !== "object" || Array.isArray(body)) return parsed;
	const report = body;
	const rateMultiplier = numberField(report.resolved_rate_multiplier);
	if (rateMultiplier !== void 0) parsed.rateMultiplier = rateMultiplier;
	const groupRateMultiplier = numberField(report.group_rate_multiplier);
	if (groupRateMultiplier !== void 0) parsed.groupRateMultiplier = groupRateMultiplier;
	return parsed;
}
/** Per-group balance queries with a 60-second cache. */
var BalanceService = class BalanceService {
	hooks;
	/** Cache lifetime for one group's balance. */
	static TTL_MS = 6e4;
	cache = /* @__PURE__ */ new Map();
	constructor(hooks) {
		this.hooks = hooks;
	}
	/** Forget every cached balance (a configuration change may alter any group). */
	invalidate() {
		this.cache.clear();
	}
	/** One group's balance, served from cache while fresh. */
	balance(key) {
		const options = this.hooks.options();
		const group = options.groups.get(key);
		if (group === void 0 || !group.enabled) return Promise.reject(new LlmError(`protocom-api: group "${key}" is not enabled`, "BALANCE_FAILED"));
		const hit = this.cache.get(key);
		if (hit !== void 0 && Date.now() - hit.at < BalanceService.TTL_MS) return hit.value;
		const value = this.fetchBalance(options.baseURL, group);
		value.catch(() => {
			if (this.cache.get(key)?.value === value) this.cache.delete(key);
		});
		this.cache.set(key, {
			at: Date.now(),
			value
		});
		return value;
	}
	async fetchBalance(baseURL, group) {
		const headers = {
			"accept": "application/json",
			"authorization": `Bearer ${await this.hooks.resolveApiKey(group)}`,
			...attributionHeaders()
		};
		const usageUrl = `${baseURL}/v1/usage`;
		let response;
		try {
			response = await fetch(usageUrl, {
				method: "GET",
				headers
			});
		} catch (error) {
			throw new LlmError(`could not reach ${usageUrl}`, "BALANCE_FAILED", { cause: error });
		}
		if (!response.ok) throw new LlmError(`${usageUrl} answered ${response.status}${response.status === 401 || response.status === 403 ? "; check the API key" : ""}`, "BALANCE_FAILED", { status: response.status });
		const balance = parseUsage(await response.json());
		try {
			const rates = await fetch(`${baseURL}${RATE_MULTIPLIER_PATH}`, {
				method: "GET",
				headers
			});
			if (rates.ok) return {
				...balance,
				...parseRateMultiplier(await rates.json())
			};
		} catch {}
		return balance;
	}
};
const LOOPBACK_ADDRESSES = /* @__PURE__ */ new Set([
	"127.0.0.1",
	"::1",
	"::ffff:127.0.0.1"
]);
function send(res, status, body) {
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(body));
}
/**
* Build the `GET /api/protocom-api/balance` handler. The loopback fence is
* the only authorization: the answer discloses account state, so nothing
* off-box may read it. `?group=<key>` selects one enabled group; omission
* answers every enabled group with `showBalance` on. Per-group failures land
* beside the healthy groups as `{error}` rows.
*/
function balanceRouteHandler(service, hooks) {
	return async (req, res) => {
		if (req.method !== "GET") {
			send(res, 405, { error: "method not allowed" });
			return;
		}
		if (!LOOPBACK_ADDRESSES.has(req.socket.remoteAddress ?? "")) {
			send(res, 403, { error: "the balance endpoint answers loopback clients only" });
			return;
		}
		const groupParam = new URL(req.url ?? "/", "http://127.0.0.1").searchParams.get("group");
		const options = hooks.options();
		if (groupParam !== null) {
			const group = options.groups.get(groupParam);
			if (group === void 0 || !group.enabled || !group.showBalance) {
				send(res, 404, { error: `no enabled balance-reporting group "${groupParam}"` });
				return;
			}
			try {
				send(res, 200, await service.balance(group.key));
			} catch (error) {
				send(res, 502, { error: error instanceof Error ? error.message : String(error) });
			}
			return;
		}
		const groups = {};
		await Promise.all([...options.groups.values()].filter((group) => group.enabled && group.showBalance).map(async (group) => {
			try {
				groups[group.key] = await service.balance(group.key);
			} catch (error) {
				groups[group.key] = { error: error instanceof Error ? error.message : String(error) };
			}
		}));
		send(res, 200, { groups });
	};
}
//#endregion
//#region src/index.ts
const name = "protocom-api";
const inject = ["llm"];
const NS = "protocom-api";
function apply(ctx, config) {
	let current = () => config;
	let lastRaw;
	let lastGood;
	const options = () => {
		const raw = current();
		if (raw === lastRaw && lastGood !== void 0) return lastGood;
		try {
			const next = resolveAdapterOptions(raw);
			lastRaw = raw;
			lastGood = next;
			return next;
		} catch (error) {
			if (lastGood === void 0) throw error;
			lastRaw = raw;
			ctx.logger.error("protocom-api: keeping the last good configuration after an invalid settings section");
			ctx.logger.error(error);
			return lastGood;
		}
	};
	options();
	const resolveApiKey = async (group) => {
		const ref = group.apiKeyRef;
		if (ref === void 0) throw new LlmError(`protocom-api: no API key configured for provider route "${group.provider}"; set groups.${group.key}.apiKey in the "${NS}" settings section to a credential reference`, "MISSING_CREDENTIAL");
		const credentials = ctx.get("credentials");
		if (credentials !== void 0) {
			const hit = await credentials.resolve(ref);
			if (hit?.value !== void 0) return assertUsableApiKey(hit.value, "dsh-protocom-api", ref);
		}
		const ambient = process.env[ref];
		if (ambient !== void 0 && ambient.length > 0) return assertUsableApiKey(ambient, "dsh-protocom-api", ref);
		throw new LlmError(`protocom-api: no API key for provider route "${group.provider}"; store ${ref} through the credentials service, or export ${ref} in the launching environment`, "MISSING_CREDENTIAL");
	};
	const adapter = new ProtocomAdapter({
		options,
		resolveApiKey
	});
	const balance = new BalanceService({
		options,
		resolveApiKey
	});
	let syncRoutes = () => {};
	ctx.effect(() => {
		const directory = ctx.llm.registerConfigurableProviders(GROUP_KEYS.map((key) => ({
			provider: providerOf(key),
			displayName: GROUP_DEFAULTS[key].displayName,
			settingsNs: NS,
			settingsPath: ["groups", key]
		})));
		const discovery = ctx.llm.registerModelDiscovery(NS, (request, signal) => discoverModels(request, signal, {
			baseURL: () => options().baseURL,
			resolveApiKey: async (provider) => {
				const group = [...options().groups.values()].find((candidate) => candidate.provider === provider);
				if (group === void 0 || !group.enabled || group.apiKeyRef === void 0) return void 0;
				try {
					return await resolveApiKey(group);
				} catch {
					return;
				}
			}
		}));
		let registration;
		const sync = () => {
			const routes = [...options().groups.values()].filter((group) => group.enabled).map((group) => group.provider);
			if (registration === void 0) {
				if (routes.length === 0) return;
				registration = ctx.llm.registerAdapter(routes, adapter);
			} else registration.replace(routes);
		};
		syncRoutes = sync;
		sync();
		return () => {
			syncRoutes = () => {};
			registration?.();
			directory();
			discovery();
		};
	});
	ctx.inject(["settings"], (settingsCtx) => {
		settingsCtx.settings.installSection(ctx, NS, Config, config, {
			setSource: (source) => {
				current = source;
			},
			onChange: () => {
				syncRoutes();
				adapter.invalidateListings();
				balance.invalidate();
			}
		});
	});
	ctx.inject(["webServer"], (webCtx) => {
		webCtx.effect(() => webCtx.webServer.register({
			kind: "exact",
			path: "/api/protocom-api/balance",
			handler: balanceRouteHandler(balance, {
				options,
				resolveApiKey
			})
		}));
	});
}
//#endregion
export { BalanceService, Config, DEFAULT_BASE_URL, FALLBACK_CONTEXT_WINDOW, GROUP_DEFAULTS, GROUP_KEYS, ProtocomAdapter, REGISTRY, apply, balanceRouteHandler, catalogEntry, contextLabel, decodeVariantId, discoverModels, displayNameWithContext, encodeVariantId, fetchUpstreamModels, groupOf, inject, matchRegistry, name, parseModelsListing, parseRateMultiplier, parseUsage, providerOf, resolveAdapterOptions, stripVariantId, variantLengths };
