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
		protocol: "responses",
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
/** The conventional credential reference one group's API key is stored under. */
function defaultKeyRef(key) {
	return `PROTOCOM_${key.toUpperCase()}_API_KEY`;
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
		vision: false,
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
		reasoning: GLM_REASONING,
		vision: false
	},
	{
		id: "glm-5.3",
		displayName: "GLM-5.3",
		family: "glm",
		contextWindow: CONTEXT_1M,
		reasoning: GLM_REASONING,
		vision: false
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
		},
		vision: false
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
		id: "step-5-preview",
		displayName: "Step 5 Preview",
		family: "step",
		contextWindow: CONTEXT_1M,
		vision: true,
		groups: ["stepfun"]
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
function matchRegistry(id, registry = REGISTRY) {
	return registry.find((entry) => entry.id === id);
}
/** Whether one registry entry is a membership source for a group. */
function servesGroup(entry, key) {
	return entry.groups?.includes(key) === true;
}
/**
* Ids the endpoint's listing advertises but its chat route refuses, verified by
* request against `GET /v1/models` and `POST /v1/chat/completions` with the
* same StepFun credential: the audio and image-editing models answer 404 "the
* model ... does not exist or you do not have access to it", and the two
* Step-3.5 snapshots answer 400 "this model is not enabled for the Responses
* API".
*
* A listing is an advertisement, not a promise: eight of the eleven ids one
* StepFun key lists cannot serve a chat turn at all, and a menu entry whose
* every use ends in an error is the defect this catalog exists to remove. They
* are listed here rather than dropped silently — the settings panel names them
* — and a model the endpoint starts serving again is one line away from the
* menu.
*/
const REFUSED_CHAT_MODEL_IDS = [
	"step-3.5-flash",
	"step-3.5-flash-2603",
	"step-explore",
	"step-image-edit-2",
	"stepaudio-2.5-asr",
	"stepaudio-2.5-chat",
	"stepaudio-2.5-realtime",
	"stepaudio-2.5-tts"
];
/** Whether the endpoint's chat route answers for one upstream id. */
function servesChat(id, refused = REFUSED_CHAT_MODEL_IDS) {
	return !refused.includes(id);
}
/**
* Whether one model accepts image input, after the deployment's own choice.
*
* Resolution order is explicit setting, then the registry's verified verdict,
* then permissive: the endpoint — not this registry — is the authority on a
* model's modality and discloses none, so the registry can only ever be
* incomplete. A wrong "no" makes a documented capability unreachable for every
* deployment at once; a wrong "yes" costs one upstream error that names the
* model. `vision: false` stays the way to say "verified text-only".
* @param id - upstream model id, alias resolved through {@link identityKey}.
* @param declared - the deployment's per-model choices.
*/
function acceptsImages(id, declared, registry = REGISTRY) {
	const chosen = declared?.get(identityKey(id, registry));
	if (chosen !== void 0) return chosen;
	return matchRegistry(id, registry)?.vision !== false;
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
function identityKey(id, registry = REGISTRY) {
	const entry = matchRegistry(id, registry);
	if (entry === void 0) return id;
	return registry.find((candidate) => candidate.displayName === entry.displayName)?.id ?? id;
}
/** Collapse the registry into one identity per display name, in registry order. */
function modelIdentities(registry = REGISTRY) {
	const byName = /* @__PURE__ */ new Map();
	for (const entry of registry) {
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
* @param upstream - one listing row, or a hand-built row for a registry entry.
* @param groupReasoning - the group's own vocabulary, used when nothing else declares one.
* @param declaredVision - the deployment's per-model image capability.
* @returns the model as the menu presents it.
*/
function catalogEntry(upstream, groupReasoning, declaredVision, registry = REGISTRY) {
	const entry = matchRegistry(upstream.id, registry);
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
		vision: acceptsImages(upstream.id, declaredVision, registry),
		rank: Number.MAX_SAFE_INTEGER
	};
	return {
		upstreamId: upstream.id,
		displayName: entry.displayName,
		contextWindow: entry.contextWindow,
		contextOptions: contextChoicesFor(entry.contextWindow),
		...reasoning === void 0 ? {} : { reasoning },
		vision: acceptsImages(upstream.id, declaredVision, registry),
		rank: entry.rank ?? Number.MAX_SAFE_INTEGER
	};
}
/**
* One group's own model menu: the models that group's menu offers, in the
* order the menu renders them. Membership is the group's live listing — the
* credential scopes what the route serves — plus the registry entries tagged
* for that group, so a group's menu holds its own models instead of every
* group's and a model the endpoint starts listing appears without a plugin
* release. Ids the endpoint refuses on its chat route never appear
* ({`link servesChat}). A missing or empty listing falls back to the whole
* registry, so a degraded endpoint cannot empty the menu.
*
* The adapter's `listModels` and the settings panel's per-group model editor
* both project through here, so the list a user configures cannot drift from
* the list the picker shows.
* `param key - the group whose catalog is projected.
* `param listing - that group's live listing, or `undefined` when unreachable.
* `param options - the deployment's visibility, ordering, and modality choices.
* `returns one row per model identity, in menu order.
*/
function groupCatalog(key, listing, options = {}) {
	const registry = options.family?.registry ?? REGISTRY;
	const refused = options.family?.refused ?? REFUSED_CHAT_MODEL_IDS;
	const groupReasoning = options.family === void 0 ? GROUP_DEFAULTS[key].reasoning : options.family.defaults[key]?.reasoning;
	const rows = listing === void 0 ? [] : [...listing];
	for (const entry of registry) {
		if (!servesGroup(entry, key)) continue;
		if (!rows.some((row) => row.id === entry.id)) rows.push({ id: entry.id });
	}
	if (rows.length === 0 && options.registryFallback !== false) for (const entry of registry) rows.push({ id: entry.id });
	const rankOf = (id) => {
		const at = options.recommended?.indexOf(identityKey(id, registry)) ?? -1;
		return at === -1 ? Number.MAX_SAFE_INTEGER : at;
	};
	const ranked = rows.filter((row) => servesChat(row.id, refused) && options.hidden?.has(row.id) !== true).map((row, index) => ({
		index,
		row,
		rank: rankOf(row.id)
	})).sort((left, right) => left.rank - right.rank || left.index - right.index);
	const byName = /* @__PURE__ */ new Map();
	for (const { row } of ranked) {
		const model = catalogEntry(row, groupReasoning, options.vision, registry);
		const hit = byName.get(model.displayName);
		if (hit === void 0) {
			byName.set(model.displayName, {
				upstreamId: row.id,
				ids: [row.id],
				displayName: model.displayName,
				contextWindow: model.contextWindow,
				...model.contextOptions === void 0 ? {} : { contextOptions: [...model.contextOptions] },
				...model.reasoning === void 0 ? {} : { reasoning: model.reasoning },
				vision: model.vision,
				rank: model.rank
			});
			continue;
		}
		hit.ids.push(row.id);
	}
	return [...byName.values()];
}
/** Go vocabulary shared by the deepseek/glm-5.3-flash/kimi-k3/longcat/mimo-v2.5/minimax-m3/qwen3.8 generation. */
const GO_FULL_REASONING = {
	efforts: [
		"none",
		"minimal",
		"low",
		"medium",
		"high",
		"xhigh",
		"max"
	],
	defaultEffort: "high"
};
/** GLM-5.1/5.2/5.3 on Go: thinking cannot be disabled; `minimal`, `none` and `off` all answer 400. */
const GO_GLM_REASONING = {
	efforts: [
		"low",
		"medium",
		"high",
		"xhigh",
		"max"
	],
	defaultEffort: "high"
};
/** muses/grok on the Go responses surface: `none` and `max` answer 400. */
const GO_RESPONSES_REASONING = {
	efforts: [
		"minimal",
		"low",
		"medium",
		"high",
		"xhigh"
	],
	defaultEffort: "medium"
};
/** Qwen3.7 generation on Go: `max`, `minimum` and `off` answer 400. */
const GO_QWEN37_REASONING = {
	efforts: [
		"none",
		"minimal",
		"low",
		"medium",
		"high",
		"xhigh"
	],
	defaultEffort: "medium"
};
/**
* The OpenCode Go registry. Every entry is a membership source for the single
* `go` group, so the menu holds the whole catalog even while the live listing
* is unreachable. `contextWindow` follows the model's published window
* (models.dev); reasoning vocabularies are the live-verified accept sets.
*/
const GO_REGISTRY = [
	{
		id: "deepseek-v4.1-flash",
		displayName: "DeepSeek V4.1 Flash",
		family: "deepseek",
		contextWindow: 1e6,
		reasoning: GO_FULL_REASONING,
		vision: true,
		groups: ["go"],
		rank: 1
	},
	{
		id: "glm-5.3",
		displayName: "GLM-5.3",
		family: "glm",
		contextWindow: 1e6,
		reasoning: GO_GLM_REASONING,
		vision: false,
		groups: ["go"],
		rank: 2
	},
	{
		id: "kimi-k3",
		displayName: "Kimi K3",
		family: "kimi",
		contextWindow: CONTEXT_1M,
		reasoning: GO_FULL_REASONING,
		vision: true,
		groups: ["go"],
		rank: 3
	},
	{
		id: "deepseek-v4-pro",
		displayName: "DeepSeek V4 Pro",
		family: "deepseek",
		contextWindow: 1e6,
		reasoning: GO_FULL_REASONING,
		vision: false,
		groups: ["go"],
		rank: 4
	},
	{
		id: "qwen3.8-max",
		displayName: "Qwen3.8 Max",
		family: "qwen",
		contextWindow: 1e6,
		reasoning: GO_FULL_REASONING,
		vision: true,
		groups: ["go"],
		rank: 5
	},
	{
		id: "grok-4.6",
		displayName: "Grok 4.6",
		family: "grok",
		contextWindow: 5e5,
		reasoning: GO_RESPONSES_REASONING,
		vision: true,
		protocol: "responses",
		groups: ["go"],
		rank: 6
	},
	{
		id: "deepseek-v4-flash",
		displayName: "DeepSeek V4 Flash",
		family: "deepseek",
		contextWindow: 1e6,
		reasoning: GO_FULL_REASONING,
		vision: false,
		groups: ["go"]
	},
	{
		id: "deepseek-v4-flash-vision-exp",
		displayName: "DeepSeek V4 Flash Vision",
		family: "deepseek",
		contextWindow: 1e6,
		reasoning: GO_FULL_REASONING,
		vision: true,
		groups: ["go"]
	},
	{
		id: "deepseek-flash",
		displayName: "DeepSeek Flash",
		family: "deepseek",
		contextWindow: FALLBACK_CONTEXT_WINDOW,
		reasoning: GO_FULL_REASONING,
		groups: ["go"]
	},
	{
		id: "glm-5.1",
		displayName: "GLM-5.1",
		family: "glm",
		contextWindow: 202752,
		reasoning: GO_GLM_REASONING,
		vision: false,
		groups: ["go"]
	},
	{
		id: "glm-5.2",
		displayName: "GLM-5.2",
		family: "glm",
		contextWindow: 1e6,
		reasoning: GO_GLM_REASONING,
		vision: false,
		groups: ["go"]
	},
	{
		id: "glm-5.3-flash",
		displayName: "GLM-5.3 Flash",
		family: "glm",
		contextWindow: 1e6,
		reasoning: GO_FULL_REASONING,
		vision: true,
		groups: ["go"]
	},
	{
		id: "gpt-5.6-luna",
		displayName: "GPT-5.6 Luna",
		family: "gpt",
		contextWindow: 105e4,
		reasoning: {
			efforts: [
				"none",
				"low",
				"medium",
				"high",
				"xhigh",
				"max"
			],
			defaultEffort: "medium"
		},
		vision: true,
		protocol: "responses",
		groups: ["go"]
	},
	{
		id: "hy3",
		displayName: "HY-3",
		family: "hunyuan",
		contextWindow: 256e3,
		vision: false,
		groups: ["go"]
	},
	{
		id: "hy4-preview",
		displayName: "HY-4 Preview",
		family: "hunyuan",
		contextWindow: 1024e3,
		vision: false,
		groups: ["go"]
	},
	{
		id: "kimi-k2.6",
		displayName: "Kimi K2.6",
		family: "kimi",
		contextWindow: CONTEXT_256K,
		vision: true,
		groups: ["go"]
	},
	{
		id: "kimi-k2.7-code",
		displayName: "Kimi K2.7 Code",
		family: "kimi",
		contextWindow: CONTEXT_256K,
		reasoning: {
			efforts: [
				"off",
				"minimal",
				"low",
				"medium",
				"high",
				"xhigh",
				"max"
			],
			defaultEffort: "medium"
		},
		vision: true,
		groups: ["go"]
	},
	{
		id: "longcat-2.0",
		displayName: "LongCat 2.0",
		family: "longcat",
		contextWindow: 1e6,
		reasoning: GO_FULL_REASONING,
		vision: false,
		groups: ["go"]
	},
	{
		id: "mimo-v2.5",
		displayName: "MiMo V2.5",
		family: "mimo",
		contextWindow: 1e6,
		vision: true,
		groups: ["go"]
	},
	{
		id: "mimo-v2.5-pro",
		displayName: "MiMo V2.5 Pro",
		family: "mimo",
		contextWindow: CONTEXT_1M,
		reasoning: {
			efforts: [
				"none",
				"low",
				"medium",
				"high"
			],
			defaultEffort: "medium"
		},
		vision: false,
		groups: ["go"]
	},
	{
		id: "minimax-m2.5",
		displayName: "MiniMax M2.5",
		family: "minimax",
		contextWindow: CONTEXT_200K,
		reasoning: {
			efforts: [
				"minimal",
				"low",
				"medium",
				"high",
				"xhigh",
				"max"
			],
			defaultEffort: "medium"
		},
		vision: false,
		groups: ["go"]
	},
	{
		id: "minimax-m3",
		displayName: "MiniMax M3",
		family: "minimax",
		contextWindow: 1e6,
		reasoning: GO_FULL_REASONING,
		vision: true,
		inlineReasoning: true,
		groups: ["go"]
	},
	{
		id: "muse-spark-1.2-contributor",
		displayName: "Muse Spark 1.2 Contributor",
		family: "meta",
		contextWindow: CONTEXT_1M,
		reasoning: GO_RESPONSES_REASONING,
		vision: true,
		protocol: "responses",
		groups: ["go"]
	},
	{
		id: "muse-spark-1.3-contributor",
		displayName: "Muse Spark 1.3 Contributor",
		family: "meta",
		contextWindow: CONTEXT_1M,
		reasoning: GO_RESPONSES_REASONING,
		vision: true,
		protocol: "responses",
		groups: ["go"]
	},
	{
		id: "omen-alpha",
		displayName: "Omen Alpha",
		family: "omen",
		contextWindow: 5e5,
		reasoning: {
			efforts: [
				"none",
				"minimal",
				"low",
				"medium",
				"high",
				"max"
			],
			defaultEffort: "medium"
		},
		vision: true,
		groups: ["go"]
	},
	{
		id: "qwen3.6-plus",
		displayName: "Qwen3.6 Plus",
		family: "qwen",
		contextWindow: 1e6,
		reasoning: {
			efforts: [
				"none",
				"minimum",
				"low",
				"medium",
				"high",
				"xhigh"
			],
			defaultEffort: "medium"
		},
		vision: true,
		groups: ["go"]
	},
	{
		id: "qwen3.7-max",
		displayName: "Qwen3.7 Max",
		family: "qwen",
		contextWindow: 1e6,
		reasoning: GO_QWEN37_REASONING,
		vision: false,
		groups: ["go"]
	},
	{
		id: "qwen3.7-plus",
		displayName: "Qwen3.7 Plus",
		family: "qwen",
		contextWindow: 1e6,
		reasoning: GO_QWEN37_REASONING,
		vision: true,
		groups: ["go"]
	},
	{
		id: "qwen3.8-flash",
		displayName: "Qwen3.8 Flash",
		family: "qwen",
		contextWindow: 1e6,
		reasoning: GO_FULL_REASONING,
		vision: true,
		groups: ["go"]
	}
];
/**
* Ids the Go endpoint lists but cannot serve a chat turn for on any wire
* protocol, verified by request: `minimax-m2.7` answers 503 on both
* chat-completions and responses, and `hy3-preview` answers 400
* "Model is unavailable". They stay listed (the probe table names them) but
* never reach the menu.
*/
const GO_REFUSED_MODEL_IDS = ["hy3-preview", "minimax-m2.7"];
/** Go menu leads: the models whose thinking actually streams, in preference order. */
const GO_DEFAULT_RECOMMENDED = GO_REGISTRY.filter((entry) => entry.rank !== void 0).slice().sort((left, right) => left.rank - right.rank).map((entry) => entry.id);
//#endregion
//#region src/family.ts
/**
* Provider families: the fixed description of one upstream API surface this
* plugin serves. A family owns a settings namespace, an endpoint origin pin,
* a credential-reference namespace, a set of group routes, a model registry,
* and the wire-level quirks that surface differs in (session headers, the
* thinking spelling, per-model protocol overrides). Pure metadata with no
* Node imports: the browser client reads the same descriptors as the Host.
*
* @module dsh-protocom-api/family
*/
/** The Protocom official API family: the four original group routes. */
const PROTOCOM = {
	ns: "protocom-api",
	label: "Protocom",
	baseURL: DEFAULT_BASE_URL,
	origin: DEFAULT_BASE_URL_ORIGIN,
	credentialRef: /^PROTOCOM_[A-Z0-9_]+$/,
	keys: GROUP_KEYS,
	defaults: GROUP_DEFAULTS,
	providerOf,
	groupOf,
	keyRef: defaultKeyRef,
	recommended: DEFAULT_RECOMMENDED,
	registry: REGISTRY,
	refused: REFUSED_CHAT_MODEL_IDS,
	telemetryPath: "/api/protocom-api/balance",
	telemetryKind: "balance"
};
/** OpenCode Go endpoint base; `/v1` is appended per request. */
const GO_DEFAULT_BASE_URL = "https://opencode.ai/zen/go";
/** Origin of {@link GO_DEFAULT_BASE_URL}: the pin for stored Go keys. */
const GO_DEFAULT_BASE_URL_ORIGIN = new URL(GO_DEFAULT_BASE_URL).origin;
/** Credential references the Go family resolves. */
const GO_CREDENTIAL_REF = /^OPENCODE_[A-Z0-9_]+$/;
/**
* The provider route the Go group registers under. `opencode-go` itself is
* taken in DSH 1.5: the shipped `dsh-llm-pi-ai` plugin declares every pi-ai
* catalog route unconditionally, and `opencode-go` is one of them, so a
* second registration under that name is a DUPLICATE_DIRECTORY boot failure.
* `-sub` distinguishes this plugin's subscription route from the built-in.
*/
const GO_PROVIDER = "opencode-go-sub";
/**
* The OpenCode Go subscription family: one group, one provider route
* (`opencode-go-sub`). The endpoint serves roughly thirty models over
* chat-completions except a per-model set that only answers on the Responses
* surface — those carry `protocol: 'responses'` in the registry. Session
* scoping is contractual: every request sends `x-opencode-session`.
*/
const OPENCODE_GO = {
	ns: "opencode-go",
	label: "OpenCode Go",
	baseURL: GO_DEFAULT_BASE_URL,
	origin: GO_DEFAULT_BASE_URL_ORIGIN,
	credentialRef: GO_CREDENTIAL_REF,
	keys: ["go"],
	defaults: { go: {
		displayName: "OpenCode Go",
		protocol: "chat-completions",
		contextLengths: [
			204800,
			262144,
			409600,
			1048576
		]
	} },
	providerOf: () => GO_PROVIDER,
	groupOf: (provider) => provider === "opencode-go-sub" ? "go" : void 0,
	keyRef: () => "OPENCODE_GO_API_KEY",
	recommended: GO_DEFAULT_RECOMMENDED,
	registry: GO_REGISTRY,
	refused: GO_REFUSED_MODEL_IDS,
	sessionHeader: "x-opencode-session",
	chatThinking: "effort-only",
	telemetryPath: "/api/opencode-go/usage",
	telemetryKind: "quota"
};
/** Every family this plugin mounts. */
const FAMILIES = [PROTOCOM, OPENCODE_GO];
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
* The only credential references the Protocom family resolves: its own
* namespaced environment-variable names. An open shape let a rewritten
* `baseURL` pair any `process.env` name with an arbitrary endpoint, turning
* the environment fallback into an exfiltration primitive. The Go family's
* own namespace is `OPENCODE_` (see `family.ts`).
*/
const PROTOCOM_CREDENTIAL_REF = /^PROTOCOM_[A-Z0-9_]+$/;
const group = z.object({
	enabled: z.boolean().default(false),
	apiKey: z.string().role("credential-ref"),
	protocol: z.union(["chat-completions", "responses"]),
	contextLengths: z.array(z.number().step(1).min(1)),
	showBalance: z.boolean().default(true),
	replayReasoning: z.boolean().default(false),
	assistantTextReplay: z.union([
		"keep",
		"drop",
		"user"
	]).default("keep")
});
/**
* The settings-section schema for one family: every field shares its shape
* across families, while `baseURL` and `recommendedModels` default to the
* family's own shipped values.
*/
function sectionSchema(baseURL, recommended) {
	return z.object({
		baseURL: z.string().default(baseURL),
		allowCustomBaseURL: z.boolean(),
		streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
		groups: z.dict(group).default({}),
		hiddenModels: z.array(z.string()).default([]),
		recommendedModels: z.array(z.string()).default([...recommended]),
		modelContexts: z.dict(z.array(z.number().step(1).min(1))).default({}),
		visionModels: z.dict(z.boolean()).default({})
	});
}
/** Settings-section schema for the `protocom-api` namespace. */
const ProtocomSection = sectionSchema(DEFAULT_BASE_URL, DEFAULT_RECOMMENDED);
/** Settings-section schema for the `opencode-go` namespace. */
const GoSection = sectionSchema(GO_DEFAULT_BASE_URL, GO_DEFAULT_RECOMMENDED);
/** Runtime schema for the plugin's yml configuration. */
const Config = z.object({
	baseURL: z.string().default(DEFAULT_BASE_URL),
	allowCustomBaseURL: z.boolean(),
	streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
	groups: z.dict(group).default({}),
	hiddenModels: z.array(z.string()).default([]),
	recommendedModels: z.array(z.string()).default([...DEFAULT_RECOMMENDED]),
	modelContexts: z.dict(z.array(z.number().step(1).min(1))).default({}),
	visionModels: z.dict(z.boolean()).default({}),
	opencode: GoSection
});
/**
* The one explicit resolve step from raw config to validated connection
* facts. Programmatic construction may bypass Schemastery normalization, so
* every bound is re-judged here.
* @param config - raw plugin config or resolved settings snapshot.
* @returns validated connection facts for all four groups.
*/
function resolveAdapterOptions(config, family = PROTOCOM) {
	const baseURL = resolveBaseURL((config.baseURL ?? family.baseURL).replace(/\/+$/, "").replace(/\/v1$/, ""));
	if (config.allowCustomBaseURL !== true && new URL(baseURL).origin !== family.origin) throw new Error(`${family.ns}: baseURL "${baseURL}" points away from the shipped endpoint (${family.origin}); set allowCustomBaseURL: true to confirm this deployment really sends its API key there`);
	const streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? 3e5;
	if (!Number.isFinite(streamIdleTimeoutMs) || streamIdleTimeoutMs <= 0 || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) throw new Error(`${family.ns}: streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`);
	const supplied = config.groups ?? {};
	for (const key of Object.keys(supplied)) if (!family.keys.includes(key)) throw new Error(`${family.ns}: unknown group "${key}"; expected one of ${family.keys.join(", ")}`);
	const groups = /* @__PURE__ */ new Map();
	for (const key of family.keys) {
		const source = supplied[key] ?? {};
		const defaults = family.defaults[key] ?? {
			displayName: key,
			protocol: "chat-completions"
		};
		if (source.contextLengths !== void 0) {
			if (source.contextLengths.some((length) => !Number.isSafeInteger(length) || length <= 0)) throw new Error(`${family.ns}: group "${key}" contextLengths must be positive integers`);
			if (new Set(source.contextLengths).size !== source.contextLengths.length) throw new Error(`${family.ns}: group "${key}" contextLengths must not contain duplicates`);
		}
		const effectiveLengths = source.contextLengths ?? defaults.contextLengths;
		let apiKeyRef;
		if (source.apiKey !== void 0) {
			if (!family.credentialRef.test(source.apiKey)) throw new Error(`${family.ns}: group "${key}" apiKey must match ${String(family.credentialRef)}`);
			try {
				apiKeyRef = credentialRef(source.apiKey);
			} catch (error) {
				throw new Error(`${family.ns}: group "${key}" apiKey is not a valid credential reference`, { cause: error });
			}
		}
		groups.set(key, {
			key,
			provider: family.providerOf(key),
			displayName: defaults.displayName,
			enabled: source.enabled ?? false,
			protocol: source.protocol ?? defaults.protocol,
			...apiKeyRef === void 0 ? {} : { apiKeyRef },
			...effectiveLengths === void 0 ? {} : { contextLengths: [...effectiveLengths] },
			showBalance: source.showBalance ?? true,
			replayReasoning: source.replayReasoning ?? false,
			assistantTextReplay: source.assistantTextReplay ?? "keep"
		});
	}
	const hidden = config.hiddenModels ?? [];
	for (const id of hidden) if (typeof id !== "string" || id.length === 0) throw new Error(`${family.ns}: hiddenModels entries must be non-empty model ids`);
	const recommended = config.recommendedModels ?? family.recommended;
	for (const id of recommended) if (typeof id !== "string" || id.length === 0) throw new Error(`${family.ns}: recommendedModels entries must be non-empty model ids`);
	const contexts = /* @__PURE__ */ new Map();
	for (const [id, lengths] of Object.entries(config.modelContexts ?? {})) {
		if (id.length === 0) throw new Error(`${family.ns}: modelContexts keys must be non-empty model ids`);
		if (lengths.length === 0) throw new Error(`${family.ns}: modelContexts["${id}"] must list at least one length`);
		if (lengths.some((length) => !Number.isSafeInteger(length) || length <= 0)) throw new Error(`${family.ns}: modelContexts["${id}"] lengths must be positive integers`);
		if (new Set(lengths).size !== lengths.length) throw new Error(`${family.ns}: modelContexts["${id}"] lengths must not repeat`);
		contexts.set(identityKey(id, family.registry), [...lengths].sort((left, right) => left - right));
	}
	const vision = /* @__PURE__ */ new Map();
	for (const [id, accepts] of Object.entries(config.visionModels ?? {})) {
		if (id.length === 0) throw new Error(`${family.ns}: visionModels keys must be non-empty model ids`);
		if (typeof accepts !== "boolean") throw new Error(`${family.ns}: visionModels["${id}"] must be a boolean`);
		vision.set(identityKey(id, family.registry), accepts);
	}
	return {
		family,
		baseURL,
		streamIdleTimeoutMs,
		groups,
		modelContexts: contexts,
		visionModels: vision,
		hiddenModels: new Set(hidden),
		recommendedModels: [...new Set(recommended.map((id) => identityKey(id, family.registry)))]
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
	const label = connection.label ?? "Protocom";
	let response;
	try {
		response = await fetch(url, {
			method: "POST",
			headers: {
				"authorization": `Bearer ${connection.apiKey}`,
				"content-type": "application/json",
				"accept": "text/event-stream",
				...attributionHeaders(),
				...connection.headers
			},
			body: serialized,
			...signal === void 0 ? {} : { signal }
		});
	} catch (error) {
		if (signal?.aborted) throw new LlmError(`${label} request aborted by caller`, "ABORTED", { cause: error });
		throw new LlmError(`${label} API request to ${url} failed`, "TRANSPORT", { cause: error });
	}
	if (response.ok) {
		if (!response.body) throw new LlmError(`${label} API returned no response body`, "EMPTY_RESPONSE");
		return response;
	}
	let message = `${label} API error (HTTP ${response.status})`;
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
		cause: new Error(rawResponse.length > 0 ? rawResponse : `${label} HTTP ${response.status}`),
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
* Resolve the wire thinking fields for one request. The default `toggle`
* spelling sends `thinking: {type}` plus `reasoning_effort`: `off` disables
* thinking explicitly; any other effort enables it and rides as
* `reasoning_effort`; an absent effort leaves the provider's own default
* alone. `effort-only` (OpenCode Go) sends `reasoning_effort` verbatim — the
* gateway parses it without a `thinking` block, which GLM routes refuse
* outright — and the disabling word (`none`, `off`) is part of the model's
* advertised effort vocabulary rather than a special case here.
*/
function resolveThinking(effort, mode = "toggle") {
	if (mode === "effort-only") return effort === void 0 ? {} : { reasoning_effort: effort };
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
	if (contentHasImage(blocks)) throw new LlmError("The chat-completions adapter does not support image content here.", "UNSUPPORTED_CONTENT");
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
	throw new LlmError("assistant messages are serialized by assistantMessages()", "INVALID_REQUEST");
}
/**
* The wire messages one assistant turn becomes. An image is a caller bug here
* (assistant output is declared text-only), and the text may be dropped or
* re-attributed when the route cannot carry it.
*/
function assistantMessages(message, replayReasoning, assistantTextReplay) {
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
	const body = {
		role: "assistant",
		content: text,
		...replayReasoning && reasoning.length > 0 ? { reasoning_content: reasoning } : {},
		...toolCalls.length > 0 ? { tool_calls: toolCalls } : {}
	};
	if (text.length === 0 || assistantTextReplay === "keep") return [body];
	if (assistantTextReplay === "drop") return [{
		...body,
		content: ""
	}];
	return [{
		role: "user",
		name: "assistant",
		content: text
	}, {
		...body,
		content: ""
	}];
}
/** The wire messages one harness message becomes, under the route's modes. */
function wireMessages(message, images, replayReasoning, assistantTextReplay) {
	if (message.role === "assistant") return assistantMessages(message, replayReasoning, assistantTextReplay);
	return [wireMessage(message, images)];
}
/** Serialize one request into the chat-completions wire body. */
function serializeChatRequest(options, model, images, replayReasoning = false, assistantTextReplay = "keep", thinking = "toggle") {
	const messages = [];
	if (options.system !== void 0) messages.push({
		role: "system",
		content: options.system
	});
	for (const message of options.messages) messages.push(...wireMessages(message, images, replayReasoning, assistantTextReplay));
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
		...resolveThinking(options.reasoningEffort, thinking)
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
const OPEN_TAG = "<think>";
const CLOSE_TAG = "</think>";
/**
* Lift an inline `<think>…</think>` segment out of a streamed `content`
* string. Some routes (MiniMax M3 on OpenCode Go) emit thinking inside the
* content stream rather than on a reasoning field; keeping the tag split-safe
* across chunk boundaries is the whole job — a suffix that is a proper prefix
* of the boundary tag is buffered until the next chunk resolves it, and a
* buffered suffix that turns out not to be a tag flows through as text.
*/
var ThinkTagExtractor = class {
	pending = "";
	state = "text";
	/** Consume one content delta; emit the segments it completes. */
	feed(input) {
		this.pending += input;
		const out = [];
		for (;;) {
			const tag = this.state === "text" ? OPEN_TAG : CLOSE_TAG;
			const at = this.pending.indexOf(tag);
			if (at === -1) {
				let keep = 0;
				for (let length = Math.min(tag.length - 1, this.pending.length); length > 0; length--) if (tag.startsWith(this.pending.slice(this.pending.length - length))) {
					keep = length;
					break;
				}
				const emit = this.pending.slice(0, this.pending.length - keep);
				if (emit.length > 0) out.push({
					kind: this.state,
					text: emit
				});
				this.pending = this.pending.slice(this.pending.length - keep);
				return out;
			}
			if (at > 0) out.push({
				kind: this.state,
				text: this.pending.slice(0, at)
			});
			this.state = this.state === "text" ? "reasoning" : "text";
			this.pending = this.pending.slice(at + tag.length);
		}
	}
	/** Emit whatever remains when the stream ends; an unclosed think stays reasoning. */
	flush() {
		const out = this.pending.length > 0 ? [{
			kind: this.state,
			text: this.pending
		}] : [];
		this.pending = "";
		return out;
	}
};
/**
* Consume SSE data payloads (ending with `[DONE]`) and yield StreamChunks.
* `block-end`s, `usage`, and `finish` are deferred to the `[DONE]` sentinel
* so no chunk follows `finish`. A `stop` (or absent) finish with no opened
* blocks maps to an `EMPTY_RESPONSE` error finish instead of a successful
* empty message.
*/
async function* translateChatCompletions(payloads, behavior = {}) {
	let nextIndex = 0;
	let textBlock;
	let reasoningBlock;
	const toolBlocks = /* @__PURE__ */ new Map();
	const order = [];
	let pendingFinish;
	let pendingUsage;
	const think = behavior.inlineReasoning === true ? new ThinkTagExtractor() : void 0;
	function* emitReasoning(text) {
		if (text.length === 0) return;
		if (!reasoningBlock) {
			reasoningBlock = open("reasoning");
			yield {
				type: "block-start",
				index: reasoningBlock.index,
				blockType: "reasoning"
			};
		}
		reasoningBlock.text += text;
		yield {
			type: "reasoning-delta",
			index: reasoningBlock.index,
			text
		};
	}
	function* emitText(text) {
		if (text.length === 0) return;
		if (!textBlock) {
			textBlock = open("text");
			yield {
				type: "block-start",
				index: textBlock.index,
				blockType: "text"
			};
		}
		textBlock.text += text;
		yield {
			type: "text-delta",
			index: textBlock.index,
			text
		};
	}
	function* emitSegment(segment) {
		yield* segment.kind === "reasoning" ? emitReasoning(segment.text) : emitText(segment.text);
	}
	function open(kind) {
		const block = {
			index: nextIndex++,
			kind,
			text: ""
		};
		order.push(block);
		return block;
	}
	function* closeOut() {
		if (think !== void 0) for (const segment of think.flush()) yield* emitSegment(segment);
		for (const block of order) yield {
			type: "block-end",
			index: block.index,
			block: closeBlock$1(block)
		};
		if (pendingUsage) yield {
			type: "usage",
			usage: pendingUsage
		};
		yield {
			type: "finish",
			reason: closeOutReason()
		};
	}
	function closeOutReason() {
		const reason = pendingFinish ?? { kind: "stop" };
		return reason.kind === "stop" && order.length === 0 ? {
			kind: "error",
			failure: {
				message: "model returned a completed response with no content",
				code: EMPTY_RESPONSE_CODE
			}
		} : reason;
	}
	for await (const payload of payloads) {
		if (payload === "[DONE]") {
			yield* closeOut();
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
			const reasoning = delta?.reasoning_content ?? (typeof delta?.reasoning === "string" ? delta.reasoning : void 0) ?? delta?.reasoning_details?.map((detail) => detail.text ?? "").join("");
			if (typeof reasoning === "string" && reasoning.length > 0) yield* emitReasoning(reasoning);
			const content = delta?.content;
			if (typeof content === "string" && content.length > 0) {
				if (think === void 0) yield* emitText(content);
				else for (const segment of think.feed(content)) yield* emitSegment(segment);
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
	if (pendingFinish !== void 0) {
		yield* closeOut();
		return;
	}
	throw new LlmError("SSE payload stream ended without [DONE]", "STREAM_CLOSED");
}
/** Stream one chat-completions call as harness chunks. */
async function* streamChatCompletions(connection, options, model, images, behavior = {}) {
	const response = await postSse(connection, "chat/completions", serializeChatRequest(options, model, images, behavior.replayReasoning ?? false, behavior.assistantTextReplay ?? "keep", behavior.thinking ?? "toggle"), options.signal);
	yield* translateChatCompletions(behavior.inlineReasoning === true ? parseSseUntilEof(response.body) : parseSse(response.body), behavior.inlineReasoning === true ? { inlineReasoning: true } : {});
}
//#endregion
//#region src/protocol/responses.ts
/**
* OpenAI responses wire protocol (the Codex group). Minimal hand-rolled SSE
* handling: requests map messages to `input` items and the reasoning effort
* to `reasoning.effort`; stream events resolve through their payload `type`
* field, terminating at `response.completed` / `response.failed` rather than
* relying on a `[DONE]` sentinel. Images ride as inline base64
* `input_image` parts, so a multimodal model is reachable on either wire
* protocol. Tool calls stream twice on this protocol —
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
/**
* The content parts of one input item: the block's text first, then every image
* this request retained as the inline data URL the endpoint accepts. An item
* whose parts all failed to resolve still carries its text, because an empty
* content array is a wire error and the text is what keeps the replayed turn
* faithful.
*/
function inputParts(blocks, images) {
	const text = flattenText(blocks);
	const parts = text.length > 0 ? [{
		type: "input_text",
		text
	}] : [];
	for (const block of blocks) {
		if (block.type !== "image") continue;
		const url = images?.get(String(block.attachment.attachmentId));
		if (url !== void 0) parts.push({
			type: "input_image",
			image_url: url
		});
	}
	return parts.length === 0 ? [{
		type: "input_text",
		text
	}] : parts;
}
function wireInput(message, images) {
	if (message.role === "system") return [inputTextItem("system", flattenText(message.content))];
	if (message.role === "user") {
		const result = message.content.find((block) => block.type === "tool-result");
		if (result !== void 0) {
			const parts = inputParts(result.content, images);
			return [{
				type: "function_call_output",
				call_id: String(result.toolCallId),
				output: parts.length === 1 && parts[0]?.type === "input_text" ? parts[0].text : parts
			}];
		}
		return [{
			type: "message",
			role: "user",
			content: inputParts(message.content, images)
		}];
	}
	if (contentHasImage(message.content)) throw new LlmError("The protocom-api responses adapter does not support image content on an assistant message.", "UNSUPPORTED_CONTENT");
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
function serializeResponsesRequest(options, model, images) {
	const input = [];
	for (const message of options.messages) input.push(...wireInput(message, images));
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
* The reasoning text one complete reasoning item carries, when it carries any.
* Providers spell the same content as `reasoning_text` parts, as summary
* parts, or as both; a provider that streams nothing and only restates the
* finished item still delivers its thinking through here.
*/
function itemReasoningText(item) {
	const parts = [...(item.content ?? []).filter((part) => part.type === "reasoning_text").map((part) => part.text ?? ""), ...(item.summary ?? []).map((part) => part.text ?? "")].filter((text) => text.length > 0);
	return parts.length === 0 ? void 0 : parts.join("");
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
			case "response.reasoning_text.delta":
			case "response.reasoning_summary_text.delta":
				yield* emitReasoning(typeof event.delta === "string" ? event.delta : void 0);
				break;
			case "response.reasoning.done":
			case "response.reasoning_text.done":
			case "response.reasoning_summary_text.done":
				yield* emitReasoning(streamedRemainder(reasoningBlock?.text ?? "", typeof event.text === "string" ? event.text : void 0));
				break;
			case "response.reasoning_part.done":
			case "response.reasoning_summary_part.done":
				yield* emitReasoning(streamedRemainder(reasoningBlock?.text ?? "", typeof event.part?.text === "string" ? event.part.text : void 0));
				break;
			case "response.output_item.added": {
				const item = event.item;
				if (item?.type === "reasoning") {
					yield* emitReasoning(streamedRemainder(reasoningBlock?.text ?? "", itemReasoningText(item)));
					break;
				}
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
				if (item?.type === "reasoning") {
					yield* emitReasoning(streamedRemainder(reasoningBlock?.text ?? "", itemReasoningText(item)));
					break;
				}
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
				const incomplete = event.type === "response.incomplete" || event.response?.status === "incomplete";
				pendingFinish = sawToolCall ? { kind: "tool-calls" } : reason === "max_output_tokens" || reason === "max_tokens" || incomplete && reason === void 0 ? { kind: "max-tokens" } : { kind: "stop" };
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
async function* streamResponses(connection, options, model, images) {
	yield* translateResponses(parseSseUntilEof((await postSse(connection, "responses", serializeResponsesRequest(options, model, images), options.signal)).body));
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
/** One adapter serving every enabled route of one provider family. */
var ProtocomAdapter = class extends LlmAdapter {
	config;
	listings = /* @__PURE__ */ new Map();
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
		return {
			id: provider,
			name: key === void 0 ? provider : family.defaults[key]?.displayName ?? provider
		};
	}
	providerRetryPolicy(_provider) {
		return RETRY_POLICY;
	}
	/** The enabled group behind one route; every dispatch path starts here. */
	groupFor(provider) {
		const family = this.family();
		const key = family.groupOf(provider);
		const group = key === void 0 ? void 0 : this.config.options().groups.get(key);
		if (group === void 0 || !group.enabled) throw new LlmError(`${family.ns}: provider route "${provider}" is not an enabled group`, "NO_PROVIDER");
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
	* The input modalities one route advertises for one model. Image input is
	* declared wherever the model accepts it — the deployment's own choice, then
	* the registry's verified verdict, then permissive — and both wire protocols
	* carry one, so no protocol-shaped hole is left for a capability to fall
	* into.
	*/
	inputModalitiesFor(upstreamId) {
		return acceptsImages(upstreamId, this.config.options().visionModels, this.family().registry) ? ["text", "image"] : ["text"];
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
		if (chosen !== void 0 && chosen.length > 0) {
			const allowed = chosen.filter((length) => length <= model.contextWindow);
			if (allowed.length > 0) return [...allowed].sort((left, right) => left - right);
			return;
		}
		return variantLengths(model.contextOptions, group.contextLengths);
	}
	/** The catalog entries one model advertises, one per variant. */
	modelEntries(provider, group, model) {
		const inputModalities = this.inputModalitiesFor(model.upstreamId);
		const lengths = this.contextLengthsFor(group, model);
		if (lengths === void 0) return [{
			provider,
			id: model.upstreamId,
			name: displayNameWithContext(model.displayName, model.contextWindow),
			inputModalities
		}];
		return lengths.map((length) => ({
			provider,
			id: encodeVariantId(model.upstreamId, length),
			name: displayNameWithContext(model.displayName, length),
			inputModalities
		}));
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
		} catch {
			listing = void 0;
		}
		return groupCatalog(group.key, listing, {
			hidden: hiddenModels,
			recommended: recommendedModels,
			vision: visionModels,
			family: this.family()
		}).flatMap((model) => this.modelEntries(provider, group, model));
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
		const family = this.family();
		const entry = matchRegistry(upstreamId, family.registry);
		const contextWindow = variant ?? entry?.contextWindow ?? FALLBACK_CONTEXT_WINDOW;
		let displayName = entry?.displayName;
		if (displayName === void 0) try {
			const row = (await this.upstreamModels(group)).find((candidate) => candidate.id === upstreamId);
			displayName = row?.displayName !== void 0 && row.displayName !== upstreamId ? row.displayName : upstreamId;
		} catch {
			displayName = upstreamId;
		}
		const reasoning = entry?.reasoning ?? await this.disclosedReasoning(group, upstreamId) ?? family.defaults[group.key]?.reasoning;
		return {
			provider,
			id: model,
			name: displayNameWithContext(displayName, contextWindow),
			inputModalities: this.inputModalitiesFor(upstreamId),
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
		const family = this.family();
		const apiKey = await this.config.resolveApiKey(group);
		const headers = family.sessionHeader === void 0 ? void 0 : (() => {
			const session = options.sessionId === void 0 ? this.fallbackSession : String(options.sessionId);
			return {
				[family.sessionHeader]: session,
				"x-deepseek-harness-session-id": session
			};
		})();
		const connection = {
			baseURL,
			apiKey,
			label: family.label,
			...headers === void 0 ? {} : { headers }
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
			const pending = this.protocolCall(connection, callOptions, group, model);
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
			if (timeoutOf(watchdog.signal, STREAM_IDLE_TIMEOUT_CODE) !== void 0) throw new LlmError(`${family.label} stream idle for ${streamIdleTimeoutMs}ms`, "TIMEOUT", { cause: error });
			if (options.signal?.aborted) throw new LlmError(`${family.label} request aborted by caller`, "ABORTED", { cause: error });
			throw error;
		} finally {
			consumer.abort(`${family.label} stream consumer stopped`);
			watchdog[Symbol.dispose]();
			if (!exhausted && iterator !== void 0 && iterator.return !== void 0) {
				const pendingReturn = iterator.return();
				try {
					await Promise.race([pendingReturn, teardownGrace()]);
				} catch {}
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
		const projected = messages === options.messages ? options : {
			...options,
			messages: [...messages]
		};
		const family = this.family();
		const entry = matchRegistry(model, family.registry);
		return (entry?.protocol ?? group.protocol) === "responses" ? streamResponses(connection, projected, model, images) : streamChatCompletions(connection, projected, model, images, {
			replayReasoning: group.replayReasoning,
			assistantTextReplay: group.assistantTextReplay,
			thinking: family.chatThinking,
			inlineReasoning: entry?.inlineReasoning
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
		const refs = /* @__PURE__ */ new Map();
		for (const message of options.messages) collectImageRefs(message.content, refs);
		if (refs.size === 0) return {
			images: void 0,
			messages: options.messages
		};
		if (!acceptsImages(model, this.config.options().visionModels)) throw new LlmError(`Protocom model "${model}" does not accept image input.`, "UNSUPPORTED_CONTENT");
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
function numberField$1(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function stringField$1(value) {
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
	const mode = stringField$1(report.mode);
	if (mode !== void 0) balance.mode = mode;
	const status = stringField$1(report.status);
	if (status !== void 0) balance.status = status;
	const unit = stringField$1(report.unit);
	if (unit !== void 0) balance.unit = unit;
	const limit = numberField$1(report.quota?.limit);
	if (limit !== void 0) balance.limit = limit;
	const used = numberField$1(report.quota?.used);
	if (used !== void 0) balance.used = used;
	const remaining = numberField$1(report.quota?.remaining ?? report.remaining);
	if (remaining !== void 0) balance.remaining = remaining;
	const balanceField = numberField$1(report.balance);
	if (balanceField !== void 0) balance.balance = balanceField;
	const planName = stringField$1(report.planName);
	if (planName !== void 0) balance.planName = planName;
	const dailyUsageUsd = numberField$1(report.subscription?.daily_usage_usd);
	if (dailyUsageUsd !== void 0) balance.dailyUsageUsd = dailyUsageUsd;
	const dailyLimitUsd = numberField$1(report.subscription?.daily_limit_usd);
	if (dailyLimitUsd !== void 0) balance.dailyLimitUsd = dailyLimitUsd;
	const expiresAt = stringField$1(report.subscription?.expires_at);
	if (expiresAt !== void 0) balance.expiresAt = expiresAt;
	const todayRequests = numberField$1(today?.requests);
	if (todayRequests !== void 0) balance.todayRequests = todayRequests;
	const todayCost = numberField$1(today?.cost);
	if (todayCost !== void 0) balance.todayCost = todayCost;
	const rpm = numberField$1(report.usage?.rpm);
	if (rpm !== void 0) balance.rpm = rpm;
	const tpm = numberField$1(report.usage?.tpm);
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
	const rateMultiplier = numberField$1(report.resolved_rate_multiplier);
	if (rateMultiplier !== void 0) parsed.rateMultiplier = rateMultiplier;
	const groupRateMultiplier = numberField$1(report.group_rate_multiplier);
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
const JSON_HEADERS$1 = {
	"content-type": "application/json; charset=utf-8",
	"cache-control": "no-store",
	"x-content-type-options": "nosniff"
};
function json$1(status, body) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...JSON_HEADERS$1 }
	});
}
function describeError$1(error) {
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
				...JSON_HEADERS$1,
				allow: "GET"
			}
		});
		const groupParam = new URL(request.url).searchParams.get("group");
		const options = hooks.options();
		if (groupParam !== null) {
			const group = options.groups.get(groupParam);
			if (group === void 0 || !group.enabled || !group.showBalance) return json$1(404, { error: "no enabled balance-reporting group" });
			try {
				return json$1(200, await service.balance(group.key, true));
			} catch (error) {
				hooks.log?.(`protocom-api: balance query for group "${group.key}" failed: ${describeError$1(error)}`);
				return json$1(502, { error: "the balance query failed" });
			}
		}
		const groups = {};
		await Promise.all([...options.groups.values()].filter((group) => group.enabled && group.showBalance).map(async (group) => {
			try {
				groups[group.key] = await service.balance(group.key);
			} catch (error) {
				hooks.log?.(`protocom-api: balance query for group "${group.key}" failed: ${describeError$1(error)}`);
				groups[group.key] = { error: "the balance query failed" };
			}
		}));
		return json$1(200, { groups });
	};
}
//#endregion
//#region src/usage-view.ts
function numberField(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function stringField(value) {
	return typeof value === "string" && value.length > 0 ? value : void 0;
}
function normalizeWindow(value) {
	if (value === null || typeof value !== "object") return void 0;
	const window = {};
	const percent = numberField(value.percent);
	if (percent !== void 0) window.percent = percent;
	const status = stringField(value.status);
	if (status !== void 0) window.status = status;
	const resetsAt = stringField(value.resetsAt);
	if (resetsAt !== void 0) window.resetsAt = resetsAt;
	return window;
}
/**
* Re-validate one usage reply that crossed a trust boundary. The browser
* casts the JSON body to {@link GoUsageView}; a malformed or hostile reply
* must not reach a `toFixed`/`Date.parse` and crash the strip. Unrecognized
* fields are ignored and a non-object body is refused rather than
* half-accepted.
*/
function parseGoUsage(body) {
	if (body === null || typeof body !== "object" || Array.isArray(body)) return void 0;
	const usage = body.usage;
	if (usage === null || typeof usage !== "object") return void 0;
	const view = {};
	const rolling = normalizeWindow(usage.rolling);
	if (rolling !== void 0) view.rolling = rolling;
	const weekly = normalizeWindow(usage.weekly);
	if (weekly !== void 0) view.weekly = weekly;
	const monthly = normalizeWindow(usage.monthly);
	if (monthly !== void 0) view.monthly = monthly;
	return view;
}
/**
* The subscription's quota, served from cache while fresh. The key is the
* family's single `go` group; a disabled or keyless group answers the failure
* the strip displays.
*/
var GoUsageService = class GoUsageService {
	hooks;
	/** Cache lifetime for one quota reply. */
	static TTL_MS = 6e4;
	cached;
	failedAt;
	constructor(hooks) {
		this.hooks = hooks;
	}
	/** Forget the cached reply (a configuration change may alter the group). */
	invalidate() {
		this.cached = void 0;
		this.failedAt = void 0;
	}
	/** The whole account's quota windows. */
	usage() {
		const options = this.hooks.options();
		const group = options.groups.get("go");
		if (group === void 0 || !group.enabled) return Promise.reject(new LlmError("opencode-go: group \"go\" is not enabled", "USAGE_FAILED"));
		if (this.cached !== void 0 && Date.now() - this.cached.at < GoUsageService.TTL_MS) return this.cached.value;
		if (this.failedAt !== void 0 && Date.now() - this.failedAt < 5e3) return Promise.reject(new LlmError("opencode-go: the usage query is backing off after a failure", "USAGE_FAILED"));
		const value = this.fetchUsage(options.baseURL, group);
		value.then(() => {
			this.failedAt = void 0;
		}, () => {
			this.failedAt = Date.now();
			if (this.cached?.value === value) this.cached = void 0;
		});
		this.cached = {
			at: Date.now(),
			value
		};
		return value;
	}
	async fetchUsage(baseURL, group) {
		const apiKey = await this.hooks.resolveApiKey(group);
		const url = `${baseURL}/v1/usage`;
		let response;
		try {
			response = await fetch(url, {
				method: "GET",
				headers: {
					"accept": "application/json",
					"authorization": `Bearer ${apiKey}`,
					...attributionHeaders()
				}
			});
		} catch (error) {
			throw new LlmError(`could not reach ${url}`, "USAGE_FAILED", { cause: error });
		}
		if (!response.ok) throw new LlmError(`${url} answered ${response.status}${response.status === 401 || response.status === 403 ? "; check the API key" : ""}`, "USAGE_FAILED", { status: response.status });
		const parsed = parseGoUsage(await response.json());
		if (parsed === void 0) throw new LlmError("the usage endpoint did not answer with a usage object", "USAGE_FAILED");
		return parsed;
	}
};
/**
* Response headers every usage answer carries. Account state is live and
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
* Build the `GET /api/opencode-go/usage` Fetch handler for the Host's shared
* `/api` channel. Authorization belongs to the carrier, which applies its
* trust policy before dispatch (the `connection.fetch.register` contract), so
* this handler never inspects the peer address or the Host header. A disabled
* or missing `go` group answers 404; an upstream failure answers a fixed
* `{error}` row — the message names neither the credential reference nor any
* caller-supplied input, and the detail goes to the local log instead.
*/
function goUsageFetchHandler(service, hooks) {
	return async (request) => {
		if (request.method !== "GET") return new Response(null, {
			status: 405,
			headers: {
				...JSON_HEADERS,
				allow: "GET"
			}
		});
		const group = hooks.options().groups.get("go");
		if (group === void 0 || !group.enabled) return json(404, { error: "the OpenCode Go group is not enabled" });
		try {
			return json(200, await service.usage());
		} catch (error) {
			hooks.log?.(`opencode-go: usage query failed: ${describeError(error)}`);
			return json(502, { error: "the usage query failed" });
		}
	};
}
//#endregion
//#region src/index.ts
const name = "protocom-api";
const inject = ["llm"];
/** Mount one provider family: adapter, routes, settings section, telemetry. */
function mountFamily(ctx, family, schema, base, telemetry) {
	const ns = family.ns;
	let current = () => base;
	let lastRaw;
	let lastGood;
	const options = () => {
		const raw = current();
		if (raw === lastRaw && lastGood !== void 0) return lastGood;
		try {
			const next = resolveAdapterOptions(raw, family);
			lastRaw = raw;
			lastGood = next;
			return next;
		} catch (error) {
			if (lastGood === void 0) throw error;
			lastRaw = raw;
			ctx.logger.error(`${ns}: keeping the last good configuration after an invalid settings section`);
			ctx.logger.error(error);
			return lastGood;
		}
	};
	options();
	const resolveApiKey = async (group) => {
		const ref = group.apiKeyRef;
		if (ref === void 0) throw new LlmError(`${ns}: no API key configured for provider route "${group.provider}"; set groups.${group.key}.apiKey in the "${ns}" settings section to a credential reference`, "MISSING_CREDENTIAL");
		if (!family.credentialRef.test(ref)) throw new LlmError(`${ns}: credential reference "${ref}" is outside this family's credential namespace`, "MISSING_CREDENTIAL");
		const credentials = ctx.get("credentials");
		if (credentials !== void 0) {
			const hit = await credentials.resolve(ref);
			if (hit?.value !== void 0) return assertUsableApiKey(hit.value, "dsh-protocom-api", ref);
		}
		const ambient = process.env[ref];
		if (ambient !== void 0 && ambient.length > 0) return assertUsableApiKey(ambient, "dsh-protocom-api", ref);
		throw new LlmError(`${ns}: no API key for provider route "${group.provider}"; store ${ref} through the credentials service, or export ${ref} in the launching environment`, "MISSING_CREDENTIAL");
	};
	const adapter = new ProtocomAdapter({
		options,
		resolveApiKey,
		resolveAttachments: () => ctx.get("attachments")
	});
	const quota = telemetry({
		options,
		resolveApiKey,
		log: (message) => {
			ctx.logger.warn(message);
		}
	});
	let syncRoutes = () => {};
	ctx.effect(() => {
		const directory = ctx.llm.registerConfigurableProviders(family.keys.map((key) => ({
			provider: family.providerOf(key),
			displayName: family.defaults[key]?.displayName ?? key,
			settingsNs: ns,
			settingsPath: ["groups", key]
		})));
		const discovery = ctx.llm.registerModelDiscovery(ns, (request, signal) => discoverModels(request, signal, {
			baseURL: () => options().baseURL,
			resolveApiKey: async (provider) => {
				const group = [...options().groups.values()].find((candidate) => candidate.provider === provider);
				if (group === void 0) return void 0;
				if (!group.enabled) throw new Error(`${ns}: group "${group.key}" is disabled; toggle it on in the "${ns}" settings section before discovering models`);
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
		settingsCtx.settings.installSection(ctx, ns, schema, base, {
			setSource: (source) => {
				current = source;
			},
			onChange: () => {
				syncRoutes();
				adapter.invalidateListings();
				quota.invalidate();
			}
		});
	});
	quota.mount(ctx);
}
/** The Protocom balance surface: per-group currency balance plus rate enrich. */
function protocomTelemetry(hooks) {
	const balance = new BalanceService({
		options: hooks.options,
		resolveApiKey: hooks.resolveApiKey
	});
	return {
		invalidate: () => {
			balance.invalidate();
		},
		mount: (ctx) => {
			ctx.inject(["connection"], (connectionCtx) => {
				const connection = Reflect.get(connectionCtx, "connection");
				if (connection === void 0) return;
				connectionCtx.effect(() => connection.fetch.register({
					path: PROTOCOM.telemetryPath,
					methods: ["GET"],
					requestBody: "buffered",
					fetch: balanceFetchHandler(balance, {
						options: hooks.options,
						resolveApiKey: hooks.resolveApiKey,
						log: hooks.log
					})
				}));
			});
		}
	};
}
/** The Go quota surface: the subscription's rolling/weekly/monthly windows. */
function goTelemetry(hooks) {
	const usage = new GoUsageService({
		options: hooks.options,
		resolveApiKey: hooks.resolveApiKey
	});
	return {
		invalidate: () => {
			usage.invalidate();
		},
		mount: (ctx) => {
			ctx.inject(["connection"], (connectionCtx) => {
				const connection = Reflect.get(connectionCtx, "connection");
				if (connection === void 0) return;
				connectionCtx.effect(() => connection.fetch.register({
					path: OPENCODE_GO.telemetryPath,
					methods: ["GET"],
					requestBody: "buffered",
					fetch: goUsageFetchHandler(usage, {
						options: hooks.options,
						resolveApiKey: hooks.resolveApiKey,
						log: hooks.log
					})
				}));
			});
		}
	};
}
function apply(ctx, config) {
	const { opencode, ...protocom } = config;
	mountFamily(ctx, PROTOCOM, ProtocomSection, protocom, protocomTelemetry);
	mountFamily(ctx, OPENCODE_GO, GoSection, opencode ?? GoSection({}), goTelemetry);
}
//#endregion
export { BalanceService, CONTEXT_LADDER, Config, DEFAULT_BASE_URL, DEFAULT_BASE_URL_ORIGIN, DEFAULT_RECOMMENDED, DEFAULT_STREAM_IDLE_TIMEOUT_MS, FALLBACK_CONTEXT_WINDOW, FAMILIES, GO_CREDENTIAL_REF, GO_DEFAULT_BASE_URL, GO_DEFAULT_BASE_URL_ORIGIN, GO_DEFAULT_RECOMMENDED, GO_REFUSED_MODEL_IDS, GO_REGISTRY, GROUP_DEFAULTS, GROUP_KEYS, GoSection, GoUsageService, OPENCODE_GO, PROTOCOM, PROTOCOM_CREDENTIAL_REF, ProtocomAdapter, ProtocomSection, REFUSED_CHAT_MODEL_IDS, REGISTRY, ThinkTagExtractor, acceptsImages, apply, balanceFetchHandler, catalogEntry, contextChoicesFor, contextLabel, decodeVariantId, discoverModels, displayNameWithContext, encodeVariantId, endpointOrigin, fetchUpstreamModels, goUsageFetchHandler, groupCatalog, groupOf, identityKey, inject, matchRegistry, modelIdentities, name, normalizeUsage, parseBalanceView, parseGoUsage, parseModelsListing, parseRateMultiplier, parseUsage, providerOf, resolveAdapterOptions, resolveBaseURL, servesChat, servesGroup, stripVariantId, variantLengths };
