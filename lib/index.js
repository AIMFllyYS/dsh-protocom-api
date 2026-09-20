import { EMPTY_RESPONSE_CODE, LlmAdapter, LlmError, ProviderRequestId, ReasoningEffortId, ToolCallId, assertUsableApiKey, attributionHeaders, contentHasImage, offloadRequestImagesWithPolicy, offloadedImageText } from "@deepseek-ai/dsh-llm";
import { MAX_TIMER_DELAY_MS, idleWatchdog, timeoutOf } from "@deepseek-ai/dsh-timeout";
import z from "@deepseek-ai/schemastery";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { EventSourceParserStream, ParseError } from "eventsource-parser/stream";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
//#region src/groups.ts
/** Protocom official API endpoint base. */
const DEFAULT_BASE_URL = "https://relay.protocom.org";
/** 1M-token context, the ceiling most current flagships publish. */
const CONTEXT_1M = 1048576;
/** 400K-token context. */
const CONTEXT_400K = 409600;
/** 256K-token context. */
const CONTEXT_256K = 262144;
/** 200K-token context: the floor every model this plugin serves clears. */
const CONTEXT_200K = 204800;
/**
* The context ladder the picker offers, smallest first: 200K is the floor every
* model clears, then the two common steps, then the 1M ceiling. A model is only
* ever offered the steps at or below its own window, so the choice a user makes
* is always one the model can actually honour.
*/
const CONTEXT_LADDER = [
	CONTEXT_200K,
	CONTEXT_256K,
	CONTEXT_400K,
	CONTEXT_1M
];
/**
* Origin of {@link DEFAULT_BASE_URL}: the only origin a stored API key is sent
* to unless the deployment explicitly confirms a custom endpoint. Lives here,
* beside the group metadata, so the browser half can read it without pulling in
* the Host config's dependencies.
*/
const DEFAULT_BASE_URL_ORIGIN = new URL(DEFAULT_BASE_URL).origin;
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
		protocol: "chat-completions",
		contextLengths: CONTEXT_LADDER
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
//#region src/model-registry.ts
/**
* The hand-maintained model registry: display names, context capacities,
* vision support, and reasoning vocabularies for the models the Protocom
* official API serves, keyed by upstream model id. The registry — not the
* endpoint's listing — is the catalog of record: every entry is offered even
* while the listing omits it, so a shrinking or flaky listing cannot silently
* empty the model menu. Ids the registry does not know still ride along from
* the listing, with the endpoint's own display name and the fallback context
* window.
*
* The endpoint discloses only `id`, `object`, `created`, `owned_by`, `type`,
* and `display_name` — no context, modality, or reasoning metadata exists on
* the wire — so every fact below is hand-maintained from the serving model's
* own published specification and verified against the endpoint.
*
* @module dsh-protocom-api/model-registry
*/
/**
* Context capacity assumed for a model neither the registry nor the endpoint
* sizes. It is the ladder floor, not a smaller "safe" number: assuming less
* than the floor produced a single 128K entry for every unknown model — a
* choice no model served by this endpoint can honour, and a residue of the
* registry's original global-catalog design.
*/
const FALLBACK_CONTEXT_WINDOW = CONTEXT_200K;
/**
* The reasoning vocabulary shared by the GLM-5.2/5.3 generation. GLM refuses
* `thinking: {type: "disabled"}`, so `off` is deliberately absent: every
* effort here keeps thinking enabled and varies its budget.
*/
const GLM_REASONING = {
	efforts: [
		"minimal",
		"low",
		"medium",
		"high",
		"xhigh",
		"max"
	],
	defaultEffort: "high"
};
/** The reasoning vocabulary shared by the GPT-5.6 generation. */
const GPT_REASONING = {
	efforts: [
		"low",
		"medium",
		"high",
		"xhigh",
		"max"
	],
	defaultEffort: "medium"
};
/**
* The ladder steps one model can offer. A window below the whole ladder still
* offers itself, so no model is left without a choice.
* @param contextWindow - the model's declared capacity.
* @returns the offered lengths, smallest first.
*/
function contextChoicesFor(contextWindow) {
	const offered = CONTEXT_LADDER.filter((length) => length <= contextWindow);
	return offered.length > 0 ? [...offered] : [contextWindow];
}
/**
* The initial registry. Order is presentation order, but the adapter re-sorts
* by {@link RegistryEntry.rank} so the recommended models lead the menu.
*/
const REGISTRY = [
	{
		id: "kimi-k3",
		displayName: "Kimi K3",
		family: "kimi",
		contextWindow: CONTEXT_256K,
		reasoning: {
			efforts: ["low", "high"],
			defaultEffort: "high"
		},
		vision: true,
		rank: 1
	},
	{
		id: "glm-5.2",
		displayName: "GLM-5.2",
		family: "glm",
		contextWindow: CONTEXT_1M,
		reasoning: GLM_REASONING,
		rank: 2
	},
	{
		id: "mimo-v2.5",
		displayName: "MiMo V2.5",
		family: "mimo",
		contextWindow: CONTEXT_1M,
		reasoning: {
			efforts: [
				"off",
				"low",
				"medium",
				"high"
			],
			defaultEffort: "high"
		},
		vision: true,
		rank: 3
	},
	{
		id: "deepseek/deepseek-v4.1-flash",
		displayName: "DeepSeek V4.1 Flash",
		family: "deepseek",
		contextWindow: CONTEXT_1M,
		reasoning: {
			efforts: [
				"off",
				"low",
				"high",
				"max"
			],
			defaultEffort: "off"
		},
		vision: true
	},
	{
		id: "deepseek-v4.1-flash",
		displayName: "DeepSeek V4.1 Flash",
		family: "deepseek",
		contextWindow: CONTEXT_1M,
		reasoning: {
			efforts: [
				"off",
				"low",
				"high",
				"max"
			],
			defaultEffort: "off"
		},
		vision: true
	},
	{
		id: "moonshotai/Kimi-K2.7-Code",
		displayName: "Kimi K2.7 Code",
		family: "kimi",
		contextWindow: CONTEXT_256K,
		vision: true
	},
	{
		id: "zai-org/GLM-5.2",
		displayName: "GLM-5.2",
		family: "glm",
		contextWindow: CONTEXT_1M,
		reasoning: GLM_REASONING
	},
	{
		id: "glm-5.3",
		displayName: "GLM-5.3",
		family: "glm",
		contextWindow: CONTEXT_1M,
		reasoning: GLM_REASONING
	},
	{
		id: "z-ai/glm-5.3-flash",
		displayName: "GLM-5.3 Flash",
		family: "glm",
		contextWindow: CONTEXT_1M,
		reasoning: GLM_REASONING,
		vision: true
	},
	{
		id: "z-ai/glm-5.3-flashx",
		displayName: "GLM-5.3 FlashX",
		family: "glm",
		contextWindow: CONTEXT_1M,
		reasoning: GLM_REASONING,
		vision: true
	},
	{
		id: "Qwen/Qwen3.8-27B",
		displayName: "Qwen3.8 27B",
		family: "qwen",
		contextWindow: CONTEXT_1M,
		vision: true
	},
	{
		id: "qwen3.8-max",
		displayName: "Qwen3.8 Max",
		family: "qwen",
		contextWindow: CONTEXT_1M
	},
	{
		id: "Qwen/Qwen3.7-Flash",
		displayName: "Qwen3.7 Flash",
		family: "qwen",
		contextWindow: CONTEXT_256K,
		vision: true
	},
	{
		id: "Qwen/Qwen3.8-Omni-Flash",
		displayName: "Qwen3.8 Omni Flash",
		family: "qwen",
		contextWindow: CONTEXT_1M,
		vision: true
	},
	{
		id: "MiniMaxAI/MiniMax-M3",
		displayName: "MiniMax M3",
		family: "minimax",
		contextWindow: CONTEXT_1M,
		reasoning: {
			efforts: [
				"low",
				"medium",
				"high"
			],
			defaultEffort: "high"
		},
		vision: true
	},
	{
		id: "mimo-v2.5-pro",
		displayName: "MiMo V2.5 Pro",
		family: "mimo",
		contextWindow: CONTEXT_1M,
		reasoning: {
			efforts: [
				"off",
				"low",
				"medium",
				"high"
			],
			defaultEffort: "high"
		}
	},
	{
		id: "google/gemini-3.8-flash",
		displayName: "Gemini 3.8 Flash",
		family: "gemini",
		contextWindow: CONTEXT_1M,
		vision: true
	},
	{
		id: "gpt-5.6-sol",
		displayName: "GPT-5.6 Sol",
		family: "gpt",
		contextWindow: CONTEXT_1M,
		reasoning: GPT_REASONING,
		vision: true,
		groups: ["codex"]
	},
	{
		id: "gpt-5.6-luna",
		displayName: "GPT-5.6 Luna",
		family: "gpt",
		contextWindow: CONTEXT_1M,
		reasoning: GPT_REASONING,
		vision: true,
		groups: ["codex"]
	},
	{
		id: "google/gemini-3.7-flash",
		displayName: "Gemini 3.7 Flash",
		family: "gemini",
		contextWindow: CONTEXT_1M,
		vision: true
	},
	{
		id: "tencent/hy4-preview",
		displayName: "HY-4 Preview",
		family: "hunyuan",
		contextWindow: CONTEXT_256K
	},
	{
		id: "inclusionai/ling-3.0-flash-sante:free",
		displayName: "Ling 3.0 Flash Sante",
		family: "inclusionai",
		contextWindow: CONTEXT_256K
	},
	{
		id: "Qwen/Qwen3.8-Flash",
		displayName: "Qwen3.8 Flash",
		family: "qwen",
		contextWindow: CONTEXT_1M,
		vision: true
	},
	{
		id: "tencent/hy3-paid",
		displayName: "HY-3",
		family: "hunyuan",
		contextWindow: CONTEXT_256K
	},
	{
		id: "meituan/LongCat-2.0:free",
		displayName: "LongCat 2.0",
		family: "longcat",
		contextWindow: CONTEXT_256K
	},
	{
		id: "poolside/laguna-s-2.1-free",
		displayName: "Laguna S 2.1 Free",
		family: "poolside",
		contextWindow: CONTEXT_256K
	},
	{
		id: "meta/muse-spark-1.3-contributor",
		displayName: "Muse Spark 1.3 Contributor",
		family: "meta",
		contextWindow: CONTEXT_1M,
		vision: true
	}
];
/** Find the registry entry for one upstream id. */
function matchRegistry(id) {
	return REGISTRY.find((entry) => entry.id === id);
}
/** Whether one registry entry is a membership source for a group. */
function servesGroup(entry, key) {
	return entry.groups?.includes(key) === true;
}
/**
* The models the plugin recommends out of the box: the ones whose reasoning
* content actually streams from this endpoint, in preference order. A
* deployment overrides the list through the `recommendedModels` setting; it
* only ever orders the menu, so a model left off it stays fully selectable.
*/
const DEFAULT_RECOMMENDED = REGISTRY.filter((entry) => entry.rank !== void 0).slice().sort((left, right) => left.rank - right.rank).map((entry) => entry.id);
/**
* The identity key of one upstream id: the first registry id of the model it
* belongs to. Aliases of one model share a key, so a recommendation or a
* visibility choice made against either id applies to both.
*/
function identityKey(id) {
	const entry = matchRegistry(id);
	if (entry === void 0) return id;
	return REGISTRY.find((candidate) => candidate.displayName === entry.displayName)?.id ?? id;
}
/** Collapse the registry into one identity per display name, in registry order. */
function modelIdentities() {
	const byName = /* @__PURE__ */ new Map();
	for (const entry of REGISTRY) {
		const hit = byName.get(entry.displayName);
		if (hit === void 0) byName.set(entry.displayName, {
			entry,
			ids: [entry.id]
		});
		else hit.ids.push(entry.id);
	}
	return [...byName.values()].map(({ entry, ids }) => ({
		displayName: entry.displayName,
		ids,
		entry
	}));
}
/** Short capacity label: 128K, 256K, 512K, 1M. */
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
		contextWindow: upstream.contextWindow ?? FALLBACK_CONTEXT_WINDOW,
		...reasoning === void 0 ? {} : { reasoning },
		vision: false,
		rank: Number.MAX_SAFE_INTEGER
	};
	return {
		upstreamId: upstream.id,
		displayName: entry.displayName,
		contextWindow: entry.contextWindow,
		contextOptions: contextChoicesFor(entry.contextWindow),
		...reasoning === void 0 ? {} : { reasoning },
		vision: entry.vision === true,
		rank: entry.rank ?? Number.MAX_SAFE_INTEGER
	};
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
/**
* Idle interval after which one provider stream is aborted. Mirrors the
* first-party adapters' watchdog default so a stalled endpoint cannot pin a
* request — and its socket and agent step — open forever.
*/
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 3e5;
/**
* The only credential references this plugin resolves: its own namespaced
* environment-variable names. An open shape let a rewritten `baseURL` pair any
* `process.env` name with an arbitrary endpoint, turning the environment
* fallback into an exfiltration primitive.
*/
const PROTOCOM_CREDENTIAL_REF = /^PROTOCOM_[A-Z0-9_]+$/;
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
	allowCustomBaseURL: z.boolean(),
	streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
	groups: z.dict(group).default({}),
	hiddenModels: z.array(z.string()).default([]),
	recommendedModels: z.array(z.string()).default([...DEFAULT_RECOMMENDED]),
	modelContexts: z.dict(z.array(z.number().step(1).min(1))).default({})
});
/**
* The one explicit resolve step from raw config to validated connection
* facts. Programmatic construction may bypass Schemastery normalization, so
* every bound is re-judged here.
* @param config - raw plugin config or resolved settings snapshot.
* @returns validated connection facts for all four groups.
*/
function resolveAdapterOptions(config) {
	const baseURL = resolveBaseURL((config.baseURL ?? "https://relay.protocom.org").replace(/\/+$/, "").replace(/\/v1$/, ""));
	if (config.allowCustomBaseURL !== true && new URL(baseURL).origin !== DEFAULT_BASE_URL_ORIGIN) throw new Error(`protocom-api: baseURL "${baseURL}" points away from the shipped endpoint (${DEFAULT_BASE_URL_ORIGIN}); set allowCustomBaseURL: true to confirm this deployment really sends its API key there`);
	const streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? 3e5;
	if (!Number.isFinite(streamIdleTimeoutMs) || streamIdleTimeoutMs <= 0 || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) throw new Error(`protocom-api: streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`);
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
		const effectiveLengths = source.contextLengths ?? defaults.contextLengths;
		let apiKeyRef;
		if (source.apiKey !== void 0) {
			if (!PROTOCOM_CREDENTIAL_REF.test(source.apiKey)) throw new Error(`protocom-api: group "${key}" apiKey must match ${String(PROTOCOM_CREDENTIAL_REF)}`);
			try {
				apiKeyRef = credentialRef(source.apiKey);
			} catch (error) {
				throw new Error(`protocom-api: group "${key}" apiKey is not a valid credential reference`, { cause: error });
			}
		}
		groups.set(key, {
			key,
			provider: providerOf(key),
			displayName: defaults.displayName,
			enabled: source.enabled ?? false,
			protocol: source.protocol ?? defaults.protocol,
			...apiKeyRef === void 0 ? {} : { apiKeyRef },
			...effectiveLengths === void 0 ? {} : { contextLengths: [...effectiveLengths] },
			showBalance: source.showBalance ?? true
		});
	}
	const hidden = config.hiddenModels ?? [];
	for (const id of hidden) if (typeof id !== "string" || id.length === 0) throw new Error("protocom-api: hiddenModels entries must be non-empty model ids");
	const recommended = config.recommendedModels ?? DEFAULT_RECOMMENDED;
	for (const id of recommended) if (typeof id !== "string" || id.length === 0) throw new Error("protocom-api: recommendedModels entries must be non-empty model ids");
	const contexts = /* @__PURE__ */ new Map();
	for (const [id, lengths] of Object.entries(config.modelContexts ?? {})) {
		if (id.length === 0) throw new Error("protocom-api: modelContexts keys must be non-empty model ids");
		if (lengths.length === 0) throw new Error(`protocom-api: modelContexts["${id}"] must list at least one length`);
		if (lengths.some((length) => !Number.isSafeInteger(length) || length <= 0)) throw new Error(`protocom-api: modelContexts["${id}"] lengths must be positive integers`);
		if (new Set(lengths).size !== lengths.length) throw new Error(`protocom-api: modelContexts["${id}"] lengths must not repeat`);
		contexts.set(identityKey(id), [...lengths].sort((left, right) => left - right));
	}
	return {
		baseURL,
		streamIdleTimeoutMs,
		groups,
		modelContexts: contexts,
		hiddenModels: new Set(hidden),
		recommendedModels: [...new Set(recommended.map(identityKey))]
	};
}
/**
* Whether a WHATWG-normalized hostname names the local loopback authority.
* The harness keeps its own copy package-internal, so this mirrors it: the
* judgement must run on the parsed hostname (WHATWG rewrites `2130706433` and
* `0x7f000001` to `127.0.0.1`), never on the raw string.
*/
function isLoopbackHostname(hostname) {
	if (hostname === "localhost" || hostname === "[::1]") return true;
	const parts = hostname.split(".");
	return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
/**
* Validate one endpoint root. Plain http is allowed only for a loopback host,
* so the stored bearer token can never be sent in the clear to a remote
* endpoint; userinfo, query strings, and fragments are refused because they
* let a value that reads as one endpoint actually resolve to another.
* @param raw - endpoint root, already stripped of trailing slashes and `/v1`.
* @returns the same string once every bound passes.
*/
function resolveBaseURL(raw) {
	let url;
	try {
		url = new URL(raw);
	} catch {
		throw new Error("protocom-api: baseURL must be an absolute http(s) URL");
	}
	if (url.username !== "" || url.password !== "") throw new Error("protocom-api: baseURL must not carry userinfo");
	if (url.search !== "" || url.hash !== "") throw new Error("protocom-api: baseURL must not carry a query string or fragment");
	if (url.protocol === "http:" ? !isLoopbackHostname(url.hostname) : url.protocol !== "https:") throw new Error("protocom-api: baseURL must use https; plain http is allowed only for a loopback host");
	return raw;
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
/**
* Longest accepted model id or label. A hostile listing can otherwise carry a
* multi-megabyte `display_name` (measured at 2.4M characters) straight into the
* model catalog and the settings UI.
*/
const MAX_TEXT_LENGTH = 256;
/** One string bound to {@link MAX_TEXT_LENGTH}. */
function bounded(value) {
	return value.length > MAX_TEXT_LENGTH ? value.slice(0, MAX_TEXT_LENGTH) : value;
}
function label(...candidates) {
	for (const candidate of candidates) if (typeof candidate === "string" && candidate.length > 0) return bounded(candidate);
}
function capacity(...candidates) {
	for (const candidate of candidates) if (typeof candidate === "number" && Number.isInteger(candidate) && candidate > 0) return candidate;
}
function strings(candidate) {
	if (!Array.isArray(candidate)) return void 0;
	const values = candidate.filter((value) => typeof value === "string" && value.length > 0).map(bounded);
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
	const reader = response.body?.getReader();
	if (reader === void 0) throw new LlmError(`${url} answered with no body`, "DISCOVERY_FAILED");
	const chunks = [];
	let total = 0;
	for (;;) {
		const { done: finished, value } = await reader.read();
		if (finished) break;
		if (value === void 0) continue;
		total += value.byteLength;
		if (total > MAX_RESPONSE_BYTES) {
			await reader.cancel();
			throw new LlmError(`${url} answered with more than ${MAX_RESPONSE_BYTES} bytes`, "DISCOVERY_FAILED");
		}
		chunks.push(value);
	}
	const text = new TextDecoder().decode(Buffer.concat(chunks, total));
	let body;
	try {
		body = JSON.parse(text);
	} catch (error) {
		throw new LlmError(`${url} did not answer with JSON`, "DISCOVERY_FAILED", { cause: error });
	}
	return parseModelsListing(body);
}
/**
* Canonical origin of an endpoint root, or `undefined` when it is not a usable
* http(s) origin. WHATWG parsing is what makes two spellings of one endpoint
* compare equal (case, punycode, default ports, IPv6 brackets) and a decorated
* one (`user@host`, `host?x`, `relay.protocom.org.evil.test`) disagree, so the
* comparison never runs on raw strings.
*/
function endpointOrigin(raw) {
	let url;
	try {
		url = new URL(raw);
	} catch {
		return;
	}
	if (url.username !== "" || url.password !== "") return void 0;
	if (url.protocol !== "https:" && url.protocol !== "http:") return void 0;
	return url.origin;
}
/**
* The registered model-discovery callback: interrogate the endpoint named by
* the draft (or the configured endpoint for one of this plugin's routes) and
* project the reply into harness discovery metadata. A key typed into the
* form wins over the stored one.
*/
async function discoverModels(request, signal, hooks) {
	const configured = hooks.baseURL();
	try {
		resolveBaseURL(configured);
	} catch (error) {
		throw new LlmError(`protocom-api: the configured baseURL is not usable (${error instanceof Error ? error.message : String(error)})`, "DISCOVERY_FAILED", { cause: error });
	}
	const configuredOrigin = endpointOrigin(configured);
	if (configuredOrigin === void 0) throw new LlmError("protocom-api: the configured baseURL is not a usable http(s) origin", "DISCOVERY_FAILED");
	const askedRaw = request.baseURL !== void 0 && request.baseURL.length > 0 ? request.baseURL : void 0;
	const asked = askedRaw === void 0 ? void 0 : askedRaw.replace(/\/+$/, "").replace(/\/v1$/, "");
	if (asked !== void 0) try {
		resolveBaseURL(asked);
	} catch (error) {
		throw new LlmError(`protocom-api: the probe endpoint is not usable (${error instanceof Error ? error.message : String(error)})`, "DISCOVERY_FAILED", { cause: error });
	}
	const baseURL = asked ?? configured;
	const explicit = request.apiKey !== void 0 && request.apiKey.length > 0 ? request.apiKey : void 0;
	if (explicit === void 0 && request.provider !== void 0 && asked !== void 0 && endpointOrigin(baseURL) !== configuredOrigin) throw new LlmError("protocom-api: this endpoint differs from the configured baseURL, so the stored credential is not sent; supply an apiKey for this probe, or interrogate the configured endpoint", "DISCOVERY_FAILED");
	return (await fetchUpstreamModels(baseURL, explicit ?? (request.provider === void 0 ? void 0 : await hooks.resolveApiKey(request.provider)), signal)).map((model) => ({
		id: model.id,
		...model.displayName === void 0 ? {} : { name: model.displayName },
		...model.contextWindow === void 0 ? {} : { contextWindow: model.contextWindow },
		...model.maxTokens === void 0 ? {} : { maxTokens: model.maxTokens }
	}));
}
/**
* Largest single event the parser will buffer, in characters. The library's
* default is unbounded, so one upstream that opens a `data:` line and never
* terminates it grows the buffer for as long as it keeps sending — the memory
* half of F6 that no transport timeout covers. The bound is generous on
* purpose: the responses protocol restates a tool call's *complete* arguments
* in a single event, so a tight cap would reject large-but-legitimate calls.
*/
const MAX_SSE_EVENT_CHARS = 8388608;
async function* read(stream) {
	const events = stream.pipeThrough(new TextDecoderStream()).pipeThrough(new EventSourceParserStream({ maxBufferSize: MAX_SSE_EVENT_CHARS }));
	try {
		for await (const { data } of events) yield data;
	} catch (error) {
		if (error instanceof ParseError && error.type === "max-buffer-size-exceeded") throw new LlmError(`SSE event exceeded ${MAX_SSE_EVENT_CHARS} characters`, "MALFORMED_RESPONSE", { cause: error });
		throw error;
	}
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
* payloads through `[DONE]` or EOF, whichever comes first. Reaching EOF is not
* itself a successful end: the responses translator decides whether a terminal
* event arrived and refuses to treat a bare close as completion.
*/
async function* parseSseUntilEof(stream) {
	for await (const data of read(stream)) {
		yield data;
		if (data === "[DONE]") return;
	}
}
//#endregion
//#region src/capture.ts
/**
* Opt-in wire capture for diagnosing an upstream rejection. Nothing is written
* unless DSH_PROTOCOM_CAPTURE_DIR names a directory, so a normal deployment has
* no extra I/O and no extra on-disk copies of anything.
*
* Request *bodies* and upstream *error* bodies are captured; headers are never
* written, so no credential can reach the files. Bodies do contain the
* conversation (including tool results), which is why the switch is explicit
* and per-process rather than a stored setting.
*
* @module dsh-protocom-api/capture
*/
/** Largest body written; a capture that size is already unusable for diagnosis. */
const MAX_CAPTURE_BYTES = 8388608;
/** The configured capture directory, or undefined when capture is off. */
function captureDir() {
	const dir = process.env["DSH_PROTOCOM_CAPTURE_DIR"];
	return dir !== void 0 && dir.trim().length > 0 ? dir.trim() : void 0;
}
/**
* Write one exchange into the capture directory. Never throws: a diagnostic
* must not turn a provider error into a different provider error.
* @param capture - the exchange to record.
*/
async function captureWire(capture) {
	const dir = captureDir();
	if (dir === void 0) return;
	try {
		await mkdir(dir, { recursive: true });
		const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
		const body = JSON.stringify({
			capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
			url: capture.url,
			status: capture.status,
			request: capture.request.length > MAX_CAPTURE_BYTES ? "<request body omitted: too large>" : JSON.parse(capture.request),
			response: capture.response.slice(0, MAX_CAPTURE_BYTES)
		}, null, 2);
		await writeFile(join(dir, `${stamp}-${capture.status}.json`), body, "utf8");
	} catch {}
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
/**
* Largest provider-supplied `Retry-After` this adapter forwards. The harness
* retry layer treats `providerRetryAfterMs > maxDelayMs` (default 10s) as
* "cancel this retry" in normal mode, so an unbounded upstream value silently
* removed the client's retry chance; a large one under a raised `maxDelayMs`
* would instead park the request for days. Capping at that same default keeps
* the value inside the policy that consumes it and bounds the wait.
*/
const MAX_PROVIDER_RETRY_AFTER_MS = 1e4;
function providerRetryAfterMs(value) {
	if (value === null) return void 0;
	if (/^\d+$/.test(value)) {
		const delay = Number(value) * 1e3;
		return Number.isFinite(delay) && delay > 0 ? Math.min(delay, MAX_PROVIDER_RETRY_AFTER_MS) : void 0;
	}
	const delay = Date.parse(value) - Date.now();
	return Number.isFinite(delay) && delay > 0 ? Math.min(delay, MAX_PROVIDER_RETRY_AFTER_MS) : void 0;
}
/**
* POST one JSON body and return the SSE response. Transport and HTTP
* failures throw coded LlmErrors; the caller owns stream decoding.
*/
async function postSse(connection, path, body, signal) {
	const url = `${connection.baseURL}/v1/${path}`;
	const serialized = JSON.stringify(body);
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
			body: serialized,
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
	await captureWire({
		url,
		status: response.status,
		request: serialized,
		response: rawResponse
	});
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
* harness StreamChunks (after llm-deepseek's translate.ts). Three upstream
* quirks drive the differences: intermediate chunks may carry an empty-string
* `finish_reason` that means "not finished", thinking models stream
* `delta.reasoning_content`, and images ride as inline base64 `image_url`
* parts (the endpoint accepts data URLs and rejects no image input of its
* own, so the model's declared modality is the only gate).
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
	if (contentHasImage(blocks)) throw new LlmError("The protocom-api chat-completions adapter does not support image content here.", "UNSUPPORTED_CONTENT");
}
/**
* The user-message content: a plain string while no image survives, otherwise
* the multimodal part list. Text parts keep their order ahead of the images,
* matching how the composer presents them.
*/
function userContent(blocks, images) {
	const text = flattenText$1(blocks);
	if (images === void 0 || images.size === 0) return text;
	const parts = [];
	if (text.length > 0) parts.push({
		type: "text",
		text
	});
	for (const block of blocks) {
		if (block.type !== "image") continue;
		const url = images.get(String(block.attachment.attachmentId));
		if (url !== void 0) parts.push({
			type: "image_url",
			image_url: { url }
		});
	}
	return parts.length === 0 ? text : parts;
}
function wireMessage(message, images) {
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
			content: userContent(message.content, images)
		};
	}
	assertTextOnly(message.content);
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
function serializeChatRequest(options, model, images) {
	const messages = [];
	if (options.system !== void 0) messages.push({
		role: "system",
		content: options.system
	});
	for (const message of options.messages) messages.push(wireMessage(message, images));
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
function acceptIdentity$1(current, incoming) {
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
				block.callId = acceptIdentity$1(block.callId, call.id);
				block.name = acceptIdentity$1(block.name, call.function?.name);
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
async function* streamChatCompletions(connection, options, model, images) {
	yield* translateChatCompletions(parseSse((await postSse(connection, "chat/completions", serializeChatRequest(options, model, images), options.signal)).body));
}
//#endregion
//#region src/protocol/responses.ts
/**
* OpenAI responses wire protocol (the Codex group). Minimal hand-rolled SSE
* handling: requests map messages to `input` items and the reasoning effort
* to `reasoning.effort`; stream events resolve through their payload `type`
* field, terminating at `response.completed` / `response.failed` rather than
* relying on a `[DONE]` sentinel. Tool calls stream twice on this protocol —
* identity on `response.output_item.added`, arguments on
* `response.function_call_arguments.delta`, and the complete item once more on
* `response.output_item.done` — so the terminal item only ever contributes the
* part the deltas have not already carried. Reasoning streams under three
* vocabularies (`response.reasoning.delta`, `response.reasoning_summary_text.delta`,
* and one complete restatement on the `...done` events) and all three fold
* into a single reasoning block by the same remainder rule.
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
/** `id` and `name` are identity: the wire sends each once, on the call's first event. */
function acceptIdentity(current, incoming) {
	return typeof incoming === "string" && incoming.length > 0 ? incoming : current;
}
/**
* The part of a complete text the deltas have not carried yet. Providers
* resend the complete value on the `...done` events — tool-call arguments and
* reasoning alike — so only what extends the streamed prefix is new; text that
* does not extend it is dropped rather than replayed as duplicate content.
*/
function streamedRemainder(streamed, complete) {
	if (complete === void 0 || complete.length === 0) return void 0;
	if (!complete.startsWith(streamed)) return void 0;
	return complete.slice(streamed.length);
}
/**
* Adopt one completing event's authoritative argument text, or leave the block
* unconfirmed. The event's *existence* proves nothing — the endpoint controls
* its payload too — so the text must be present and must be exactly what the
* block now holds (the streamed prefix extended by the event's remainder).
* Anything else fails closed: the flush drops the block and forces an error.
*/
function acceptComplete(block, complete) {
	if (complete === void 0 || complete.length === 0) return;
	if (block.text !== complete) return;
	block.complete = true;
}
/**
* Consume responses-protocol SSE payloads and yield StreamChunks. The
* terminal state must arrive as a `response.completed` / `response.incomplete`
* / `response.failed` / `error` event, or the `[DONE]` sentinel; `block-end`s,
* `usage`, and `finish` are emitted only then, so no chunk follows `finish`.
* A bare EOF is a truncated stream, not a completed turn.
*/
async function* translateResponses(payloads) {
	let nextIndex = 0;
	let textBlock;
	let reasoningBlock;
	const order = [];
	let pendingFinish;
	let pendingUsage;
	let sawToolCall = false;
	/** Whether the peer explicitly ended the stream, as opposed to closing it. */
	let sawTerminal = false;
	/** One streamed call per wire identity, so its deltas and its terminal item share one block. */
	const toolBlocks = /* @__PURE__ */ new Map();
	function open(kind) {
		const block = {
			index: nextIndex++,
			kind,
			text: ""
		};
		order.push(block);
		return block;
	}
	/** The open call block for one wire identity, created on first sight. */
	function toolBlockFor(identity) {
		let block = toolBlocks.get(identity);
		if (!block) {
			block = open("tool-call");
			toolBlocks.set(identity, block);
		}
		return block;
	}
	/** One wire identity per call: the item id when sent, else its output index. */
	function identityOf(itemId, outputIndex) {
		if (typeof itemId === "string" && itemId.length > 0) return itemId;
		if (typeof outputIndex === "number" && Number.isSafeInteger(outputIndex)) return `#${outputIndex}`;
	}
	/**
	* Adopt whatever identity this event discloses and, on the first one, open
	* the block. Identity is re-read on every event because the wire may not
	* disclose `call_id`/`name` until the item completes, and the opening
	* `block-start` must precede every delta whether or not it ever does.
	*/
	function* announce(block, id, name) {
		block.callId = acceptIdentity(block.callId, id);
		block.name = acceptIdentity(block.name, name);
		if (block.announced !== true) {
			block.announced = true;
			sawToolCall = true;
			yield {
				type: "block-start",
				index: block.index,
				blockType: "tool-call"
			};
		}
	}
	/** Append argument text and yield the delta carrying it. A confirmed block is frozen. */
	function* emitArguments(block, fragment) {
		if (block.complete === true || fragment.length === 0) return;
		block.text += fragment;
		yield {
			type: "tool-call-delta",
			index: block.index,
			id: ToolCallId(block.callId ?? ""),
			...block.name === void 0 ? {} : { name: block.name },
			argumentsDelta: fragment
		};
	}
	/**
	* Append reasoning text and yield the delta carrying it. The endpoint
	* streams reasoning under three vocabularies — a plain `delta` on
	* `response.reasoning.delta`, a summary `delta` on
	* `response.reasoning_summary_text.delta`, and a complete restatement on the
	* `...done` events — so every spelling funnels through here and the block
	* opens on whichever one carries the first text.
	*/
	function* emitReasoning(fragment) {
		if (fragment === void 0 || fragment.length === 0) return;
		if (reasoningBlock === void 0) {
			reasoningBlock = open("reasoning");
			yield {
				type: "block-start",
				index: reasoningBlock.index,
				blockType: "reasoning"
			};
		}
		reasoningBlock.text += fragment;
		yield {
			type: "reasoning-delta",
			index: reasoningBlock.index,
			text: fragment
		};
	}
	for await (const payload of payloads) {
		if (payload === "[DONE]") {
			sawTerminal = true;
			break;
		}
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
			case "response.reasoning.delta":
			case "response.reasoning_summary_text.delta":
				yield* emitReasoning(typeof event.delta === "string" ? event.delta : void 0);
				break;
			case "response.reasoning.done":
			case "response.reasoning_summary_text.done":
				yield* emitReasoning(streamedRemainder(reasoningBlock?.text ?? "", typeof event.text === "string" ? event.text : void 0));
				break;
			case "response.reasoning_summary_part.done":
				yield* emitReasoning(streamedRemainder(reasoningBlock?.text ?? "", typeof event.part?.text === "string" ? event.part.text : void 0));
				break;
			case "response.output_item.added": {
				const item = event.item;
				if (item?.type !== "function_call") break;
				const identity = identityOf(item.id ?? event.item_id, event.output_index);
				if (identity === void 0) break;
				const block = toolBlockFor(identity);
				yield* announce(block, item.call_id, item.name);
				yield* emitArguments(block, item.arguments ?? "");
				break;
			}
			case "response.function_call_arguments.delta": {
				const identity = identityOf(event.item_id, event.output_index);
				if (identity === void 0 || typeof event.delta !== "string") break;
				const deltaBlock = toolBlockFor(identity);
				yield* announce(deltaBlock, void 0, void 0);
				yield* emitArguments(deltaBlock, event.delta);
				break;
			}
			case "response.function_call_arguments.done": {
				const identity = identityOf(event.item_id, event.output_index);
				if (identity === void 0) break;
				const block = toolBlockFor(identity);
				yield* announce(block, void 0, void 0);
				yield* emitArguments(block, streamedRemainder(block.text, event.arguments) ?? "");
				acceptComplete(block, event.arguments);
				break;
			}
			case "response.output_item.done": {
				const item = event.item;
				if (item?.type !== "function_call") break;
				const identity = identityOf(item.id ?? event.item_id, event.output_index);
				const block = identity === void 0 ? open("tool-call") : toolBlockFor(identity);
				yield* announce(block, item.call_id, item.name);
				yield* emitArguments(block, streamedRemainder(block.text, item.arguments) ?? "");
				acceptComplete(block, item.arguments);
				break;
			}
			case "response.completed":
			case "response.incomplete": {
				sawTerminal = true;
				if (event.response?.usage) pendingUsage = mapResponseUsage(event.response.usage);
				const reason = event.response?.incomplete_details?.reason;
				pendingFinish = sawToolCall ? { kind: "tool-calls" } : reason === "max_output_tokens" || reason === "max_tokens" ? { kind: "max-tokens" } : { kind: "stop" };
				break;
			}
			case "response.failed":
				sawTerminal = true;
				pendingFinish = {
					kind: "error",
					failure: {
						message: event.response?.error?.message ?? "the model call failed",
						code: event.response?.error?.code ?? "PROVIDER_ERROR"
					}
				};
				break;
			case "error":
				sawTerminal = true;
				pendingFinish = {
					kind: "error",
					failure: {
						message: event.message ?? "the model call failed",
						code: event.code ?? "PROVIDER_ERROR"
					}
				};
		}
	}
	if (!sawTerminal) throw new LlmError("Protocom responses stream ended before a terminal event", "STREAM_CLOSED");
	let truncated = false;
	for (const block of order) {
		if (block.kind === "tool-call" && block.complete !== true) {
			truncated = true;
			continue;
		}
		yield {
			type: "block-end",
			index: block.index,
			block: closeBlock(block)
		};
	}
	if (pendingUsage) yield {
		type: "usage",
		usage: pendingUsage
	};
	const settled = pendingFinish ?? (sawToolCall ? { kind: "tool-calls" } : { kind: "stop" });
	const reason = truncated && settled.kind !== "error" ? {
		kind: "error",
		failure: {
			message: "Protocom responses stream carried a tool call whose arguments never completed",
			code: "STREAM_CLOSED"
		}
	} : settled;
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
/**
* The request-image projection budget. Mirrors the harness's own default
* vision budget: the attachment service re-encodes each stored image to fit,
* so the endpoint never receives bytes beyond what a vision model is priced
* and sized for.
*/
const REQUEST_IMAGE_POLICY = {
	maxPixels: 64e4,
	maxBytes: 1048576
};
/**
* Whole-request image budget: total represented bytes and image count. The
* single-image policy above bounds each image but not their sum, so a history
* that repeats images would materialize unbounded base64 on every turn. These
* mirror the first-party adapters' bounds (20 MiB, 600 images).
*/
const REQUEST_IMAGE_TOTAL_BYTES = 20971520;
/** Stable code stamped onto the stream idle watchdog's abort reason. */
const STREAM_IDLE_TIMEOUT_CODE = "LLM_STREAM_IDLE_TIMEOUT";
/** How long a non-exhausted stream's teardown may hold the caller after an abort. */
const TEARDOWN_GRACE_MS = 1e3;
/** One-shot async iterator over one promise, for demanding a non-stream step through the watchdog. */
function oneShot(promise, signal) {
	let consumed = false;
	return { next: async () => {
		if (consumed) return {
			done: true,
			value: void 0
		};
		consumed = true;
		return {
			done: false,
			value: await abortable(promise, signal)
		};
	} };
}
/**
* Await one promise, rejecting as soon as the signal aborts. The idle watchdog
* only *notifies* through its signal, so a pre-stream step that ignores that
* signal (a store or transport that does not observe cancellation) would
* otherwise hang the demand — and the request — forever.
*/
function abortable(promise, signal) {
	if (signal.aborted) return Promise.reject(signal.reason);
	return new Promise((resolve, reject) => {
		const onAbort = () => {
			reject(signal.reason);
		};
		signal.addEventListener("abort", onAbort, { once: true });
		promise.then((value) => {
			signal.removeEventListener("abort", onAbort);
			resolve(value);
		}, (error) => {
			signal.removeEventListener("abort", onAbort);
			reject(error);
		});
	});
}
/** Resolve after {@link TEARDOWN_GRACE_MS} without holding a Node process open. */
function teardownGrace() {
	return new Promise((resolve) => {
		setTimeout(resolve, TEARDOWN_GRACE_MS).unref?.();
	});
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
const RETRY_POLICY = Object.freeze({
	mode: "normal",
	maxRetries: 5,
	retryableCodes: Object.freeze([
		EMPTY_RESPONSE_CODE,
		"RATE_LIMIT",
		"SERVER",
		"TIMEOUT",
		"TRANSPORT"
	]),
	initialDelayMs: 500,
	maxDelayMs: MAX_PROVIDER_RETRY_AFTER_MS,
	jitterRatio: .1
});
/** Collect every image reference a message tree carries, including tool results. */
function collectImageRefs(content, refs) {
	for (const block of content) if (block.type === "image") refs.set(String(block.attachment.attachmentId), block.attachment);
	else if (block.type === "tool-result") collectImageRefs(block.content, refs);
}
/** The inline `data:` URL one resolved request image is transmitted as. */
function toDataUrl(image) {
	return `data:${image.mediaType};base64,${Buffer.from(image.data).toString("base64")}`;
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
	providerRetryPolicy(_provider) {
		return RETRY_POLICY;
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
	/**
	* The input modalities one route may advertise. Image input is declared only
	* for a model the registry verified against the endpoint AND a route whose
	* protocol can actually carry an image; the responses protocol has no image
	* mapping yet, so it stays text-only rather than advertising a capability
	* that would fail at dispatch.
	*/
	modalitiesOf(group, model) {
		return model.vision && group.protocol === "chat-completions" ? ["text", "image"] : ["text"];
	}
	/**
	* The context lengths one model should be offered at. The picker's per-model
	* choice wins — that is the surface a user actually sets — then the group's
	* own `contextLengths`, then nothing, which offers the model once at its
	* full window. A chosen length above the model's window is dropped rather
	* than advertised, because the model could not honour it.
	*/
	contextLengthsFor(group, model, upstreamId) {
		const chosen = this.config.options().modelContexts.get(identityKey(upstreamId));
		if (chosen !== void 0 && chosen.length > 0) {
			const allowed = chosen.filter((length) => length <= model.contextWindow);
			if (allowed.length > 0) return [...allowed].sort((left, right) => left - right);
			return;
		}
		return variantLengths(model.contextOptions, group.contextLengths);
	}
	/** Whether one exact upstream model accepts image input on this route. */
	acceptsImages(group, upstreamId) {
		return matchRegistry(upstreamId)?.vision === true && group.protocol === "chat-completions";
	}
	/** The catalog entries one discovered model advertises, one per variant. */
	modelEntries(provider, group, upstream) {
		const model = catalogEntry(upstream, GROUP_DEFAULTS[group.key].reasoning);
		const inputModalities = this.modalitiesOf(group, model);
		const lengths = this.contextLengthsFor(group, model, upstream.id);
		if (lengths === void 0) return [{
			provider,
			id: upstream.id,
			name: displayNameWithContext(model.displayName, model.contextWindow),
			inputModalities
		}];
		return lengths.map((length) => ({
			provider,
			id: encodeVariantId(upstream.id, length),
			name: displayNameWithContext(model.displayName, length),
			inputModalities
		}));
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
	async listModels(provider) {
		const group = this.groupFor(provider);
		const { hiddenModels, recommendedModels } = this.config.options();
		const rows = [];
		let listing;
		try {
			listing = await this.upstreamModels(group);
		} catch {
			listing = void 0;
		}
		if (listing !== void 0) rows.push(...listing);
		for (const entry of REGISTRY) {
			if (!servesGroup(entry, group.key)) continue;
			if (!rows.some((row) => row.id === entry.id)) rows.push({ id: entry.id });
		}
		if (rows.length === 0) for (const entry of REGISTRY) rows.push({ id: entry.id });
		const rankOf = (id) => {
			const at = recommendedModels.indexOf(identityKey(id));
			return at === -1 ? Number.MAX_SAFE_INTEGER : at;
		};
		const ranked = rows.filter((model) => !hiddenModels.has(model.id)).map((model, index) => ({
			index,
			model,
			rank: rankOf(model.id)
		})).sort((left, right) => left.rank - right.rank || left.index - right.index);
		const seen = /* @__PURE__ */ new Set();
		return ranked.filter((row) => {
			const name = catalogEntry(row.model, GROUP_DEFAULTS[group.key].reasoning).displayName;
			if (seen.has(name)) return false;
			seen.add(name);
			return true;
		}).flatMap((entry) => this.modelEntries(provider, group, entry.model));
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
		const contextWindow = variant ?? entry?.contextWindow ?? FALLBACK_CONTEXT_WINDOW;
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
			inputModalities: this.acceptsImages(group, upstreamId) ? ["text", "image"] : ["text"],
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
		const { baseURL, streamIdleTimeoutMs } = this.config.options();
		const connection = {
			baseURL,
			apiKey: await this.config.resolveApiKey(group)
		};
		const model = stripVariantId(options.model);
		const consumer = new AbortController();
		const upstream = options.signal === void 0 ? consumer.signal : AbortSignal.any([options.signal, consumer.signal]);
		const watchdog = idleWatchdog(upstream, streamIdleTimeoutMs, STREAM_IDLE_TIMEOUT_CODE);
		const callOptions = {
			...options,
			signal: watchdog.signal
		};
		let iterator;
		let exhausted = false;
		try {
			const pending = group.protocol === "responses" ? Promise.resolve(streamResponses(connection, callOptions, model)) : this.chatCompletionsCall(connection, callOptions, group, model);
			const started = await watchdog.next(oneShot(pending, watchdog.signal));
			if (started.done === true) throw new LlmError("Protocom adapter produced no stream", "TRANSPORT");
			iterator = started.value[Symbol.asyncIterator]();
			for (;;) {
				const result = await watchdog.next(iterator);
				if (result.done) {
					exhausted = true;
					return;
				}
				yield result.value;
			}
		} catch (error) {
			if (timeoutOf(watchdog.signal, STREAM_IDLE_TIMEOUT_CODE) !== void 0) throw new LlmError(`Protocom stream idle for ${streamIdleTimeoutMs}ms`, "TIMEOUT", { cause: error });
			if (options.signal?.aborted) throw new LlmError("Protocom request aborted by caller", "ABORTED", { cause: error });
			throw error;
		} finally {
			consumer.abort("Protocom stream consumer stopped");
			watchdog[Symbol.dispose]();
			if (!exhausted && iterator !== void 0 && iterator.return !== void 0) {
				const pendingReturn = iterator.return();
				try {
					await Promise.race([pendingReturn, teardownGrace()]);
				} catch {}
			}
		}
	}
	/** The chat-completions call, with this request's image budget applied first. */
	async chatCompletionsCall(connection, options, group, model) {
		const { images, messages } = await this.resolveRequestImages(options, group, model);
		return streamChatCompletions(connection, messages === options.messages ? options : {
			...options,
			messages: [...messages]
		}, model, images);
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
	async resolveRequestImages(options, group, model) {
		const refs = /* @__PURE__ */ new Map();
		for (const message of options.messages) collectImageRefs(message.content, refs);
		if (refs.size === 0) return {
			images: void 0,
			messages: options.messages
		};
		if (!this.acceptsImages(group, model)) throw new LlmError(`Protocom model "${model}" does not accept image input.`, "UNSUPPORTED_CONTENT");
		const attachments = this.config.resolveAttachments?.();
		if (attachments === void 0) throw new LlmError("Protocom image input requires the durable attachment service.", "UNSUPPORTED_CONTENT");
		const ordered = [...refs.values()];
		const resolved = await Promise.all(ordered.map((ref) => attachments.readImageRequest(ref, REQUEST_IMAGE_POLICY, options.signal)));
		const rawBytes = /* @__PURE__ */ new Map();
		ordered.forEach((ref, index) => {
			rawBytes.set(String(ref.attachmentId), resolved[index].data.byteLength);
		});
		const messages = offloadRequestImagesWithPolicy(options.messages, {
			representation: "base64",
			byteLength: (ref) => rawBytes.get(String(ref.attachmentId)) ?? 0,
			maxBytes: REQUEST_IMAGE_TOTAL_BYTES,
			maxImages: 600,
			placeholder: (ref) => offloadedImageText(ref)
		});
		const retained = /* @__PURE__ */ new Map();
		for (const message of messages) collectImageRefs(message.content, retained);
		const images = /* @__PURE__ */ new Map();
		ordered.forEach((ref, index) => {
			const id = String(ref.attachmentId);
			if (!retained.has(id)) return;
			images.set(id, toDataUrl(resolved[index]));
		});
		return {
			images: images.size === 0 ? void 0 : images,
			messages
		};
	}
};
//#endregion
//#region src/balance-view.ts
function numberField(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function stringField(value) {
	return typeof value === "string" && value.length > 0 ? value : void 0;
}
/**
* Normalize one usage-report object. Quota deployments carry
* `quota{limit,used,remaining}`; subscription deployments carry `balance`,
* `planName`, and a `subscription` block. Unrecognized fields are ignored, and
* both shapes may coexist.
* @param body - a non-null, non-array object.
*/
function normalizeUsage(body) {
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
/**
* Re-validate one balance value that crossed a trust boundary. The browser
* casts the JSON body to {@link GroupBalance}; a malformed or hostile reply
* must not reach `toFixed`/`slice` and crash the strip. Only recognized,
* well-typed fields survive, and a value that is not an object is refused
* rather than half-accepted.
*/
function parseBalanceView(body) {
	if (body === null || typeof body !== "object" || Array.isArray(body)) return void 0;
	return normalizeUsage(body);
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
//#endregion
//#region src/balance.ts
/**
* Balance queries against the Protocom official API's usage endpoint, with a
* 60-second per-group cache and a fenced Fetch surface the settings page polls.
* Quota-limited and subscription/wallet deployments answer with different
* shapes; both normalize into {@link GroupBalance}. The billing-rate endpoint
* is absent on simple deployments, so its failure is never fatal.
*
* The HTTP surface is a Host `connection.fetch` route, not a self-registered
* `webServer` exact route. Reachability is entirely the active carrier's
* policy: the Web carrier applies the Host/Origin fence plus browser
* authentication before dispatching here, while the desktop and webworker
* carriers serve `/api/*` directly over their IPC channel, which is their own
* trust boundary. This handler therefore implements no authorization of its own
* and never inspects the peer address.
*
* @module dsh-protocom-api/balance
*/
const RATE_MULTIPLIER_PATH = "/v1/sub2api/billing";
/**
* Normalize one `/v1/usage` reply, refusing a body that is not an object.
* @throws LlmError code `BALANCE_FAILED` for a non-object reply.
*/
function parseUsage(body) {
	if (body === null || typeof body !== "object" || Array.isArray(body)) throw new LlmError("the usage endpoint did not answer with an object", "BALANCE_FAILED");
	return normalizeUsage(body);
}
function cacheKey(key, includeRates) {
	return `${key}|${includeRates ? "rates" : "plain"}`;
}
/** Per-group balance queries with a 60-second cache and a bounded failure backoff. */
var BalanceService = class BalanceService {
	hooks;
	/** Cache lifetime for one group's balance. */
	static TTL_MS = 6e4;
	cache = /* @__PURE__ */ new Map();
	failedAt = /* @__PURE__ */ new Map();
	constructor(hooks) {
		this.hooks = hooks;
	}
	/** Forget every cached balance (a configuration change may alter any group). */
	invalidate() {
		this.cache.clear();
		this.failedAt.clear();
	}
	/**
	* One group's balance, served from cache while fresh.
	* @param key - the group to query.
	* @param includeRates - whether to also read the optional billing-rate endpoint.
	*/
	balance(key, includeRates = false) {
		const options = this.hooks.options();
		const group = options.groups.get(key);
		if (group === void 0 || !group.enabled) return Promise.reject(new LlmError(`protocom-api: group "${key}" is not enabled`, "BALANCE_FAILED"));
		const entryKey = cacheKey(key, includeRates);
		const hit = this.cache.get(entryKey);
		if (hit !== void 0 && Date.now() - hit.at < BalanceService.TTL_MS) return hit.value;
		const failedAt = this.failedAt.get(key);
		if (failedAt !== void 0 && Date.now() - failedAt < 5e3) return Promise.reject(new LlmError(`protocom-api: group "${key}" balance is backing off after a failure`, "BALANCE_FAILED"));
		const value = this.fetchBalance(options.baseURL, group, includeRates);
		value.then(() => {
			this.failedAt.delete(key);
		}, () => {
			this.failedAt.set(key, Date.now());
			if (this.cache.get(entryKey)?.value === value) this.cache.delete(entryKey);
		});
		this.cache.set(entryKey, {
			at: Date.now(),
			value
		});
		return value;
	}
	async fetchBalance(baseURL, group, includeRates) {
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
		if (!includeRates) return balance;
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
/**
* Response headers every balance answer carries. Account state is live and
* sensitive, so it is never cacheable and never sniffable as another type.
*/
const JSON_HEADERS = {
	"content-type": "application/json; charset=utf-8",
	"cache-control": "no-store",
	"x-content-type-options": "nosniff"
};
function json(status, body) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...JSON_HEADERS }
	});
}
function describeError(error) {
	return error instanceof Error ? error.message : String(error);
}
/**
* Build the `GET /api/protocom-api/balance` Fetch handler for the Host's shared
* `/api` channel. Authorization belongs to the carrier, which applies its trust
* policy before dispatch (the `connection.fetch.register` contract), so this
* handler never inspects the peer address or the Host header. `?group=<key>`
* selects one enabled group and opts into the billing-rate enrichment; omission
* answers every enabled, balance-reporting group. Per-group failures land beside
* the healthy groups as a fixed `{error}` row: the message names neither the
* credential reference nor any caller-supplied input, and the detail goes to the
* local log instead.
*/
function balanceFetchHandler(service, hooks) {
	return async (request) => {
		if (request.method !== "GET") return new Response(null, {
			status: 405,
			headers: {
				...JSON_HEADERS,
				allow: "GET"
			}
		});
		const groupParam = new URL(request.url).searchParams.get("group");
		const options = hooks.options();
		if (groupParam !== null) {
			const group = options.groups.get(groupParam);
			if (group === void 0 || !group.enabled || !group.showBalance) return json(404, { error: "no enabled balance-reporting group" });
			try {
				return json(200, await service.balance(group.key, true));
			} catch (error) {
				hooks.log?.(`protocom-api: balance query for group "${group.key}" failed: ${describeError(error)}`);
				return json(502, { error: "the balance query failed" });
			}
		}
		const groups = {};
		await Promise.all([...options.groups.values()].filter((group) => group.enabled && group.showBalance).map(async (group) => {
			try {
				groups[group.key] = await service.balance(group.key);
			} catch (error) {
				hooks.log?.(`protocom-api: balance query for group "${group.key}" failed: ${describeError(error)}`);
				groups[group.key] = { error: "the balance query failed" };
			}
		}));
		return json(200, { groups });
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
		if (!PROTOCOM_CREDENTIAL_REF.test(ref)) throw new LlmError(`protocom-api: credential reference "${ref}" is not a PROTOCOM_ reference`, "MISSING_CREDENTIAL");
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
		resolveApiKey,
		resolveAttachments: () => ctx.get("attachments")
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
				if (group === void 0) return void 0;
				if (!group.enabled) throw new Error(`protocom-api: group "${group.key}" is disabled; toggle it on in the "${NS}" settings section before discovering models`);
				return await resolveApiKey(group);
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
	ctx.inject(["connection"], (connectionCtx) => {
		const connection = Reflect.get(connectionCtx, "connection");
		if (connection === void 0) return;
		connectionCtx.effect(() => connection.fetch.register({
			path: "/api/protocom-api/balance",
			methods: ["GET"],
			requestBody: "buffered",
			fetch: balanceFetchHandler(balance, {
				options,
				resolveApiKey,
				log: (message) => {
					ctx.logger.warn(message);
				}
			})
		}));
	});
}
//#endregion
export { BalanceService, CONTEXT_LADDER, Config, DEFAULT_BASE_URL, DEFAULT_BASE_URL_ORIGIN, DEFAULT_RECOMMENDED, DEFAULT_STREAM_IDLE_TIMEOUT_MS, FALLBACK_CONTEXT_WINDOW, GROUP_DEFAULTS, GROUP_KEYS, PROTOCOM_CREDENTIAL_REF, ProtocomAdapter, REGISTRY, apply, balanceFetchHandler, catalogEntry, contextChoicesFor, contextLabel, decodeVariantId, discoverModels, displayNameWithContext, encodeVariantId, endpointOrigin, fetchUpstreamModels, groupOf, identityKey, inject, matchRegistry, modelIdentities, name, normalizeUsage, parseBalanceView, parseModelsListing, parseRateMultiplier, parseUsage, providerOf, resolveAdapterOptions, resolveBaseURL, stripVariantId, variantLengths };
