window.__ModuleLoader__.load({
	id: "dsh-protocom-api",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/commandcode-tiers.ts
		/** Models sharing one vocabulary, keyed by the comma-joined efforts. */
		const SETS = {
			"none": [
				"MiniMaxAI/MiniMax-M2.5",
				"MiniMaxAI/MiniMax-M2.7",
				"Qwen/Qwen3.6-Max-Preview",
				"Qwen/Qwen3.6-Plus",
				"Qwen/Qwen3.7-Flash",
				"Qwen/Qwen3.7-Max",
				"Qwen/Qwen3.7-Plus",
				"claude-haiku-4-5-20251001",
				"inclusionai/ling-3.0-flash-sante:free",
				"meituan/LongCat-2.0",
				"moonshotai/Kimi-K2.5",
				"moonshotai/Kimi-K2.6",
				"moonshotai/Kimi-K2.7-Code",
				"moonshotai/Kimi-K2.7-Code-Highspeed",
				"nvidia/nemotron-3-ultra-550b-a55b",
				"poolside/laguna-s-2.1-free",
				"stepfun/Step-3.5-Flash",
				"stepfun/Step-3.7-Flash",
				"tencent/hy3-paid",
				"thinkingmachines/inkling",
				"thinkingmachines/inkling-small",
				"xiaomi/mimo-v2.5",
				"xiaomi/mimo-v2.5-pro",
				"xiaomi/mimo-v2.6-flash",
				"xiaomi/mimo-v2.6-pro",
				"xiaomi/mimo-v2.6-pro-ultraspeed",
				"zai-org/GLM-5",
				"zai-org/GLM-5.1",
				"zai-org/GLM-5.2-Fast"
			],
			"low,medium,high,xhigh,max": [
				"claude-fable-5",
				"claude-fable-5-1",
				"claude-opus-4-7",
				"claude-opus-4-8",
				"claude-opus-5",
				"claude-opus-5-5",
				"claude-sonnet-4-6",
				"claude-sonnet-5",
				"gpt-5.6-luna",
				"gpt-5.6-sol",
				"gpt-5.6-terra",
				"gpt-6-astra",
				"gpt-6-luna",
				"gpt-6-sol",
				"meta/muse-spark-1.3"
			],
			"low,medium,high": [
				"MiniMaxAI/MiniMax-M3",
				"google/gemini-3.1-flash-lite",
				"google/gemini-3.5-flash",
				"google/gemini-3.5-flash-lite",
				"google/gemini-3.6-flash",
				"google/gemini-3.7-flash",
				"google/gemini-3.8-flash",
				"gpt-5.4-mini",
				"stealth/space-bunny-alpha",
				"stepfun/Step-5-Preview",
				"tencent/hy4-preview",
				"xai/grok-4.5"
			],
			"low,medium,high,xhigh": [
				"gpt-5.3-codex",
				"gpt-5.4",
				"gpt-5.5",
				"meta/muse-spark-1.1",
				"meta/muse-spark-1.2",
				"meta/muse-spark-1.2-contributor",
				"meta/muse-spark-1.3-contributor",
				"xai/grok-4.6",
				"xai/grok-4.7"
			],
			"low,high,max": [
				"deepseek/deepseek-v4-flash-fast",
				"deepseek/deepseek-v4.1-flash",
				"moonshotai/Kimi-K3",
				"z-ai/glm-5.3-flash",
				"z-ai/glm-5.3-flashx",
				"zai-org/GLM-5.3"
			],
			"low,medium,xhigh": [
				"Qwen/Qwen3.8-27B",
				"Qwen/Qwen3.8-Flash",
				"Qwen/Qwen3.8-Max",
				"Qwen/Qwen3.8-Max-0902",
				"Qwen/Qwen3.8-Omni-Flash",
				"stealth/pixel-canary"
			],
			"high,max": [
				"deepseek/deepseek-v4-flash",
				"deepseek/deepseek-v4-flash-vision-exp",
				"deepseek/deepseek-v4-pro",
				"zai-org/GLM-5.2"
			],
			"high,xhigh": ["sakana/fugu-ultra"]
		};
		/** Upstream id -> its effort vocabulary. */
		const BY_ID = /* @__PURE__ */ new Map();
		for (const [key, ids] of Object.entries(SETS)) {
			if (key === "none") continue;
			const efforts = key.split(",");
			const defaultEffort = efforts.includes("high") ? "high" : efforts[0];
			for (const id of ids) BY_ID.set(id, {
				efforts,
				defaultEffort
			});
		}
		/**
		* The effort vocabulary this gateway accepts for one upstream id.
		* @param upstreamId - the model id as the endpoints listing reports it.
		* @returns its efforts, or undefined when it takes none or is unknown.
		*/
		function commandCodeReasoning(upstreamId) {
			return BY_ID.get(upstreamId);
		}
		//#endregion
		//#region src/commandcode-catalog.ts
		/** The page carrying the catalog. */
		const COMMANDCODE_CATALOG_URL = "https://commandcode.ai/docs/plans/goat";
		//#endregion
		//#region src/commandcode.ts
		/** Endpoint base. `/v1/models` is appended for discovery; any endpoint-root
		* normalization that strips a trailing `/v1` must leave `/provider/v1` intact. */
		const COMMANDCODE_BASE_URL = "https://api.commandcode.ai/provider";
		/** The origin a stored key may be sent to without explicit confirmation. */
		const COMMANDCODE_BASE_URL_ORIGIN = new URL(COMMANDCODE_BASE_URL).origin;
		/** The one provider route this family registers. */
		const COMMANDCODE_PROVIDER = "commandcode";
		/**
		* The Command Code family. One group (`cc`), one route, no session header:
		* unlike OpenCode Go this endpoint accepts requests without session scoping,
		* which was confirmed by the public listing answering without one.
		*/
		const COMMANDCODE = {
			ns: "commandcode",
			sectionKey: "commandcode",
			label: "Command Code",
			baseURL: COMMANDCODE_BASE_URL,
			origin: COMMANDCODE_BASE_URL_ORIGIN,
			credentialRef: /^COMMANDCODE_[A-Z0-9_]+$/,
			keys: ["cc"],
			defaults: { cc: {
				displayName: "Command Code",
				protocol: "chat-completions",
				contextLengths: [
					2e5,
					256e3,
					4e5,
					1e6
				]
			} },
			providerOf: () => COMMANDCODE_PROVIDER,
			groupOf: (provider) => provider === "commandcode" ? "cc" : void 0,
			keyRef: () => "COMMANDCODE_API_KEY",
			recommended: [],
			registry: [],
			refused: [],
			capabilityCatalogUrl: COMMANDCODE_CATALOG_URL,
			reasoningFor: commandCodeReasoning,
			chatThinking: "effort-only",
			planIdPath: "/alpha/billing/subscriptions",
			creditsPath: "/alpha/billing/credits",
			usagePath: "/alpha/usage/summary",
			telemetryPath: "/api/commandcode/account",
			telemetryKind: "account"
		};
		//#endregion
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
				contextLengths: CONTEXT_LADDER,
				reasoning: {
					efforts: [
						"minimal",
						"low",
						"medium",
						"high"
					],
					defaultEffort: "medium"
				}
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
		//#region src/context-variants.ts
		/**
		* Context-variant id codec. A variant entry's model id is
		* `<upstreamId>::ctx@<tokens>`; the suffix rides through the harness as an
		* opaque model id and is stripped back to the upstream id at dispatch.
		*
		* @module dsh-protocom-api/context-variants
		*/
		const MARKER = "::ctx@";
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
		* The wire protocol a gateway-declared endpoint list implies, or undefined when
		* the list names none this plugin can speak.
		*
		* Preference order is chat-completions, then responses, then messages: a model
		* offered on several surfaces is served on the first one this plugin has the
		* richest, best-tested support for, and only a model that declares NO OpenAI
		* surface falls through to the Anthropic wire.
		* @param endpoints - the gateway's own `supported_endpoints` list.
		* @returns the protocol to use, or undefined when nothing here can serve it.
		*/
		function protocolForEndpoints(endpoints) {
			if (endpoints === void 0 || endpoints.length === 0) return void 0;
			if (endpoints.includes("/chat/completions")) return "chat-completions";
			if (endpoints.includes("/responses")) return "responses";
			if (endpoints.includes("/messages")) return "messages";
		}
		/**
		* Whether a model is servable at all on the endpoint's own declared surfaces.
		*
		* This is the honesty gate for a family whose gateway publishes
		* `supported_endpoints`: a model advertising only a wire this plugin does not
		* implement is EXCLUDED rather than listed. Listing it would be worse than
		* useless — every call fails with a 400 that looks like a plugin bug rather
		* than a missing capability.
		* @param model - the upstream row, endpoints included.
		* @returns whether at least one declared endpoint maps to a supported wire.
		*/
		function servesDeclaredEndpoints(model) {
			if (model.endpoints === void 0 || model.endpoints.length === 0) return true;
			const protocol = protocolForEndpoints(model.endpoints);
			return protocol !== void 0 && protocol !== "messages";
		}
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
		* The full vocabulary this relay accepts, for a model verified against all of
		* it. Live-verified 2026-09-27: every level answers 200.
		*
		* Relay-scoped, like GLM_REASONING and GPT_REASONING above, and deliberately
		* not shared with GO_FULL_REASONING: the relay spells the disabling word
		* `none` and answers 400 to `off`, while the Go gateway is the exact reverse.
		*/
		const FULL_REASONING = {
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
		/**
		* The ladder steps one model can offer.
		*
		* A rung is offered when it is no larger than the model's window, and the
		* model's OWN window is always offered as a final rung. Both halves matter:
		*
		*  - Without the second, a model whose window falls between two rungs loses
		*    its ceiling. The ladder is binary (1,048,576) while providers publish
		*    decimal figures, so a 1,000,000-token model used to top out at 400K --
		*    24 of the 41 Go entries could never be offered their own window, and a
		*    500,000-token model could never be offered more than 400K either.
		*
		*  - The window is added once and sorted, so a model that IS a rung does not
		*    list it twice.
		* @param contextWindow - the model's declared capacity.
		* @returns the offered lengths, smallest first.
		*/
		function contextChoicesFor(contextWindow) {
			return [...CONTEXT_LADDER.filter((length) => length < contextWindow), contextWindow].sort((left, right) => left - right);
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
					efforts: [
						"minimal",
						"low",
						"medium",
						"high",
						"xhigh",
						"max"
					],
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
						"none",
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
						"none",
						"low",
						"high",
						"max"
					],
					defaultEffort: "none"
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
						"none",
						"low",
						"high",
						"max"
					],
					defaultEffort: "none"
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
						"none",
						"low",
						"medium",
						"high",
						"xhigh"
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
						"none",
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
			},
			{
				id: "mimo-v2.6-flash",
				displayName: "MiMo V2.6 Flash",
				family: "mimo",
				contextWindow: CONTEXT_1M,
				reasoning: FULL_REASONING,
				vision: true
			},
			{
				id: "mimo-v2.6-pro",
				displayName: "MiMo V2.6 Pro",
				family: "mimo",
				contextWindow: CONTEXT_1M,
				reasoning: FULL_REASONING,
				vision: true
			},
			{
				id: "xiaomi/mimo-v2.6-flash",
				displayName: "MiMo V2.6 Flash",
				family: "mimo",
				contextWindow: CONTEXT_1M,
				reasoning: FULL_REASONING,
				vision: true
			},
			{
				id: "xiaomi/mimo-v2.6-pro-ultraspeed",
				displayName: "MiMo V2.6 Pro Ultraspeed",
				family: "mimo",
				contextWindow: CONTEXT_1M,
				reasoning: FULL_REASONING,
				vision: true
			},
			{
				id: "gpt-6-luna",
				displayName: "GPT-6 Luna",
				family: "gpt",
				contextWindow: 105e4,
				reasoning: FULL_REASONING,
				vision: true,
				protocol: "responses"
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
		* Ids a listing advertises but the endpoint cannot serve a chat turn for,
		* verified by request. Two kinds live here, because both produce the same
		* defect -- a menu entry whose every use ends in an error:
		*
		* - **Refused on this route only.** StepFun's audio and image-editing models
		*   answer 404 "the model ... does not exist or you do not have access to it",
		*   and the two Step-3.5 snapshots answer 400 "this model is not enabled for
		*   the Responses API". Verified with the StepFun credential against both
		*   /v1/chat/completions and /v1/responses.
		* - **Refused on every route.** Four aggregate ids answer 400 "Model X is not
		*   available on this endpoint. Call it on /provider/v1/chat/completions
		*   instead." on both routes. That named path is not a usable API on this
		*   relay -- it answers a Cloudflare 525 SSL-handshake-failed HTML page, or
		*   HTML with HTTP 200 -- so there is nothing the adapter could route to.
		*
		* A listing is an advertisement, not a promise: eight of the eleven ids one
		* StepFun key lists and four of the twenty-six an aggregate key lists cannot
		* serve a turn at all, and a menu entry whose every use ends in an error is
		* the defect this catalog exists to remove. They are listed here rather than
		* dropped silently -- the settings panel names them "endpoint does not serve"
		* -- and a model the endpoint starts serving again is one line away from the
		* menu.
		*
		* Every id below was re-verified by live request on the release that added it;
		* no entry is inferred from documentation.
		*/
		const REFUSED_CHAT_MODEL_IDS = [
			"step-3.5-flash",
			"step-3.5-flash-2603",
			"step-explore",
			"step-image-edit-2",
			"stepaudio-2.5-asr",
			"stepaudio-2.5-chat",
			"stepaudio-2.5-realtime",
			"stepaudio-2.5-tts",
			"Qwen/Qwen3.8-Flash",
			"google/gemini-3.7-flash",
			"tencent/hy4-preview",
			"inclusionai/ling-3.0-flash-sante:free",
			"meituan/LongCat-2.0"
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
		/** Short capacity label: 128K, 256K, 512K, 1M. */
		function contextLabel(tokens) {
			if (tokens === 1e6) return "1M (dec)";
			if (tokens % 1048576 === 0) return `${tokens / 1048576}M`;
			return `${Math.round(tokens / 1024)}K`;
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
				...upstream.contextWindow === void 0 ? {} : { contextWindowDisclosed: true },
				...reasoning === void 0 ? {} : { reasoning },
				vision: declaredVision?.get(identityKey(upstream.id, registry)) ?? upstream.vision ?? acceptsImages(upstream.id, void 0, registry),
				rank: Number.MAX_SAFE_INTEGER
			};
			return {
				upstreamId: upstream.id,
				displayName: entry.displayName,
				contextWindow: entry.contextWindow,
				contextOptions: contextChoicesFor(entry.contextWindow),
				...reasoning === void 0 ? {} : { reasoning },
				vision: declaredVision?.get(identityKey(upstream.id, registry)) ?? upstream.vision ?? acceptsImages(upstream.id, void 0, registry),
				rank: entry.rank ?? Number.MAX_SAFE_INTEGER
			};
		}
		/**
		* The context steps one model may be offered.
		*
		* One expression, evaluated by both the adapter that mints menu entries and the
		* settings row that draws the chips, so the two cannot disagree -- the defect
		* that made a row show a single pressed chip which refused every click.
		*
		* Three inputs, in order of authority:
		*
		*  1. the registry's own options for a model it sizes,
		*  2. the endpoint's DISCLOSED length, when it publishes one per row,
		*  3. the group ladder unfiltered, when nothing but this plugin's assumption
		*     bounds the model.
		*
		* The distinction in (2) and (3) is load-bearing rather than pedantic. Command
		* Code publishes `context_length` on every row, so a step above it is an entry
		* the model cannot honour: a 256K model was offered 400K and 1M. StepFun
		* publishes nothing, and its uncurated ids carry only a floor guess, so the same
		* filtering there would hide steps those models serve.
		* @param model - the projected row.
		* @param ladder - the group's effective ladder.
		* @returns the steps to offer, never empty.
		*/
		function contextStepsFor(model, ladder) {
			if (model.contextOptions !== void 0) return variantLengths(model.contextOptions, ladder) ?? [model.contextWindow];
			if (ladder === void 0 || ladder.length === 0) return [model.contextWindow];
			const allowed = model.contextWindowDisclosed === true ? ladder.filter((length) => length <= model.contextWindow) : [...ladder];
			return allowed.length > 0 ? allowed : [model.contextWindow];
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
			const ranked = rows.filter((row) => servesChat(row.id, refused) && servesDeclaredEndpoints(row) && row.outOfPlan !== true && options.hidden?.has(row.id) !== true).map((row, index) => ({
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
						...model.contextWindowDisclosed === true ? { contextWindowDisclosed: true } : {},
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
				id: "grok-4.7",
				displayName: "Grok 4.7",
				family: "grok",
				contextWindow: 5e5,
				reasoning: GO_RESPONSES_REASONING,
				vision: true,
				protocol: "responses",
				groups: ["go"],
				rank: 7
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
			},
			{
				id: "kimi-k2.5",
				displayName: "Kimi K2.5",
				family: "kimi",
				contextWindow: CONTEXT_256K,
				vision: true,
				groups: ["go"]
			},
			{
				id: "glm-5",
				displayName: "GLM-5",
				family: "glm",
				contextWindow: 202752,
				vision: false,
				groups: ["go"]
			},
			{
				id: "mimo-v2-pro",
				displayName: "MiMo V2 Pro",
				family: "mimo",
				contextWindow: CONTEXT_1M,
				vision: false,
				groups: ["go"]
			},
			{
				id: "mimo-v2-omni",
				displayName: "MiMo V2 Omni",
				family: "mimo",
				contextWindow: CONTEXT_256K,
				vision: true,
				groups: ["go"]
			},
			{
				id: "mimo-v2.6-pro",
				displayName: "MiMo V2.6 Pro",
				family: "mimo",
				contextWindow: CONTEXT_1M,
				vision: true,
				groups: ["go"]
			},
			{
				id: "mimo-v2.6-flash",
				displayName: "MiMo V2.6 Flash",
				family: "mimo",
				contextWindow: CONTEXT_1M,
				vision: true,
				groups: ["go"]
			},
			{
				id: "longcat-2.5-preview-free",
				displayName: "LongCat 2.5 Preview",
				family: "longcat",
				contextWindow: 1e6,
				vision: true,
				groups: ["go"]
			},
			{
				id: "qwen3.5-plus",
				displayName: "Qwen3.5 Plus",
				family: "qwen",
				contextWindow: CONTEXT_256K,
				vision: true,
				groups: ["go"]
			},
			{
				id: "space-bunny-free",
				displayName: "Space Bunny Free",
				family: "stealth",
				contextWindow: CONTEXT_1M,
				reasoning: {
					efforts: [
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
				id: "grok-4.5",
				displayName: "Grok 4.5",
				family: "grok",
				contextWindow: 5e5,
				reasoning: {
					efforts: [
						"low",
						"medium",
						"high"
					],
					defaultEffort: "medium"
				},
				vision: true,
				groups: ["go"]
			},
			{
				id: "gpt-6-luna",
				displayName: "GPT-6 Luna",
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
			sectionKey: "protocom",
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
			sectionKey: "opencodeGo",
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
		const FAMILIES = [
			PROTOCOM,
			OPENCODE_GO,
			COMMANDCODE
		];
		//#endregion
		//#region src/fusion.ts
		/**
		* Fusion dual-model routing — the browser-safe core.
		*
		* One settings section names two seats: the LEADER that plans and reviews the
		* main conversation, and the CODER that every delegated subagent request is
		* pinned to. This module owns the namespace, the stored shape, and the
		* resolution both halves agree on; `fusion-host.ts` turns a resolved value
		* into the Host-side request rewrite, and the client section edits it.
		*
		* Deliberately import-free, like `family.ts` and `model-registry.ts`: the
		* browser client reads the same descriptors as the Host.
		*
		* @module dsh-protocom-api/fusion
		*/
		/**
		* Diagnostic label for this feature, and the settings-page cell key.
		*
		* It is NOT a settings namespace: 1.7 keys a form by Loader entry, and this
		* section is the `fusion` field of the plugin's single Config. The name
		* survives because log lines and the sidebar cell still need a stable word for
		* it.
		*/
		const FUSION_NS = "model-fusion";
		Object.freeze([
			"EMPTY_RESPONSE",
			"RATE_LIMIT",
			"SERVER",
			"TIMEOUT",
			"TRANSPORT"
		]);
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
			const usage = body.usage ?? body;
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
		//#endregion
		//#region src/commandcode-view.ts
		/** A finite number, or undefined. */
		function num(value) {
			return typeof value === "number" && Number.isFinite(value) ? value : void 0;
		}
		/** Read one object member as a record, or undefined. */
		function rec(value) {
			return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
		}
		/**
		* Normalize one rolling window.
		* @param raw - the window object from the reply.
		* @returns the window, or undefined when it carries nothing usable.
		*/
		function parseCommandCodeWindow(raw) {
			const source = rec(raw);
			if (source === void 0) return void 0;
			const used = num(source["used"]);
			const cap = num(source["cap"]);
			if (used === void 0 || cap === void 0) return void 0;
			const resetAt = num(source["resetAt"]);
			return {
				used,
				cap,
				remaining: Math.max(cap - used, 0),
				percent: cap > 0 ? Math.min(Math.max(Math.round(used / cap * 100), 0), 100) : 0,
				exceeded: source["exceeded"] === true,
				...resetAt === void 0 ? {} : { resetAt }
			};
		}
		/**
		* Normalize the credits reply.
		* @param body - the parsed `/alpha/billing/credits` body.
		* @returns the credit state, or undefined when the body is unusable.
		*/
		function parseCommandCodeCredits(body) {
			const credits = rec(rec(body)?.["credits"]);
			const limits = rec(rec(body)?.["windowLimits"]);
			if (credits === void 0 && limits === void 0) return void 0;
			const monthlyCredits = num(credits?.["monthlyCredits"]);
			const purchasedCredits = num(credits?.["purchasedCredits"]);
			const freeCredits = num(credits?.["freeCredits"]);
			const fiveHour = parseCommandCodeWindow(limits?.["fiveHour"]);
			const weekly = parseCommandCodeWindow(limits?.["weekly"]);
			const result = {
				...monthlyCredits === void 0 ? {} : { monthlyCredits },
				...purchasedCredits === void 0 ? {} : { purchasedCredits },
				...freeCredits === void 0 ? {} : { freeCredits },
				...fiveHour === void 0 ? {} : { fiveHour },
				...weekly === void 0 ? {} : { weekly }
			};
			return Object.keys(result).length === 0 ? void 0 : result;
		}
		/**
		* Normalize the usage reply.
		*
		* `successRate` is published as a percentage, but a fraction is accepted and
		* scaled: a value at or below 1 that is not exactly 0 or 1 is read as a
		* fraction, which is the only reading under which the number means anything.
		* @param body - the parsed `/alpha/usage/summary` body.
		* @returns the usage totals, or undefined when the body is unusable.
		*/
		function parseCommandCodeUsage(body) {
			const source = rec(body);
			if (source === void 0) return void 0;
			const rawRate = num(source["successRate"]);
			const successRatePercent = rawRate === void 0 ? void 0 : rawRate > 1 && rawRate <= 100 ? rawRate : rawRate >= 0 && rawRate <= 1 ? rawRate * 100 : void 0;
			const requests = num(source["totalCount"]);
			const completed = num(source["completedCount"]);
			const failed = num(source["failedCount"]);
			const cost = num(source["totalCost"]);
			const averageCost = num(source["averageCost"]);
			const tokensIn = num(source["totalTokensIn"]);
			const tokensOut = num(source["totalTokensOut"]);
			const tokens = num(source["totalTokens"]);
			const periodBasis = typeof source["periodBasis"] === "string" && source["periodBasis"].length > 0 ? source["periodBasis"] : void 0;
			const result = {
				...requests === void 0 ? {} : { requests },
				...completed === void 0 ? {} : { completed },
				...failed === void 0 ? {} : { failed },
				...cost === void 0 ? {} : { cost },
				...averageCost === void 0 ? {} : { averageCost },
				...successRatePercent === void 0 ? {} : { successRatePercent },
				...tokensIn === void 0 ? {} : { tokensIn },
				...tokensOut === void 0 ? {} : { tokensOut },
				...tokens === void 0 ? {} : { tokens },
				...periodBasis === void 0 ? {} : { periodBasis }
			};
			return Object.keys(result).length === 0 ? void 0 : result;
		}
		/**
		* Re-validate the account route's reply on the browser side.
		*
		* The wire body is a trust boundary — it comes back through the Host, but the
		* strip must not reach into a malformed shape and crash — so the client parses
		* the same normalized view the Host produced rather than asserting it. Both
		* halves are optional and their reachability is carried explicitly.
		* @param body - the parsed route reply.
		* @returns the view, or undefined when the body carries nothing renderable.
		*/
		function parseCommandCodeAccountView(body) {
			const source = rec(body);
			if (source === void 0) return void 0;
			const half = (value) => {
				const entry = rec(value);
				if (entry === void 0) return void 0;
				const error = typeof entry["error"] === "string" && entry["error"].length > 0 ? entry["error"] : void 0;
				return {
					reachable: entry["reachable"] === true,
					...error === void 0 ? {} : { error }
				};
			};
			const credits = half(source["credits"]);
			const usage = half(source["usage"]);
			if (credits === void 0 || usage === void 0) return void 0;
			const account = rec(source["account"]);
			const normalized = account === void 0 ? void 0 : parseCommandCodeAccount(account["credits"] === void 0 ? void 0 : {
				credits: account["credits"],
				windowLimits: account["windowLimits"]
			}, account["usage"]);
			return {
				...normalized === void 0 ? {} : { account: normalized },
				credits,
				usage,
				...source["credentialRejected"] === true ? { credentialRejected: true } : {}
			};
		}
		/**
		* Normalize the whole account surface from the two replies, either of which may
		* be missing. A read failure on one half never clears the other.
		* @param creditsBody - the parsed credits body, when the read succeeded.
		* @param usageBody - the parsed usage body, when the read succeeded.
		* @returns the account state, or undefined when neither half is usable.
		*/
		function parseCommandCodeAccount(creditsBody, usageBody) {
			const credits = creditsBody === void 0 ? void 0 : parseCommandCodeCredits(creditsBody);
			const usage = usageBody === void 0 ? void 0 : parseCommandCodeUsage(usageBody);
			if (credits === void 0 && usage === void 0) return void 0;
			return {
				...credits === void 0 ? {} : { credits },
				...usage === void 0 ? {} : { usage }
			};
		}
		//#endregion
		//#region src/client/operations.ts
		/**
		* The Loader entry id this plugin's settings form is keyed by; mirrors
		* `PROTOCOM_NS` on the Host and the `id` in `cordis.patch.yml`.
		*
		* Every family addresses this ONE entry. 1.7 keys a form by profile row, and a
		* plugin has exactly one Config, so the four sections cannot each own a
		* namespace — a family that still asked for `'opencode-go'` would be told
		* `settings namespace unavailable`, and one that wrote an unrooted path into
		* the shared entry would be refused for addressing a non-volatile field.
		*/
		const PROTOCOM_ENTRY_ID$1 = "protocom-api";
		/**
		* Bind one section's Host operations to the plugin's Remote surface.
		*
		* Reads and writes go to the single Loader entry, with the family's
		* `sectionKey` as the path root; model discovery keeps using `ns`, because
		* discovery keys live in their own map and are registered per family. The
		* section component above this boundary keeps working in section-relative
		* paths, so the 1.7 nesting stays in exactly one place.
		* @param ctx - the plugin's context, which declares `remote.credentials`,
		* `remote.llm`, and `remote.settings` in its own `inject`.
		* @param scope - the family's discovery key and Config section.
		* @returns the operations one provider section invokes.
		*/
		function createProtocomOperations(ctx, scope = {
			ns: PROTOCOM_ENTRY_ID$1,
			sectionKey: "protocom"
		}) {
			const { ns: discoveryNs, sectionKey } = scope;
			/** Root a section-relative path at this family's field of the shared entry. */
			const rooted = (path) => [sectionKey, ...path];
			return {
				describeSettings: async () => {
					const response = await ctx.remote.settings.describe();
					if (!response.ok) return void 0;
					const entry = response.value.namespaces.find((ns) => ns.ns === PROTOCOM_ENTRY_ID$1);
					if (entry === void 0) return void 0;
					const value = entry.value;
					const section = value !== null && typeof value === "object" && !Array.isArray(value) ? value[sectionKey] : void 0;
					return {
						...entry,
						value: section ?? {}
					};
				},
				describeCredentials: async (refs) => {
					const response = await ctx.remote.credentials.describe([...refs]);
					return response.ok ? response.value : {};
				},
				storeApiKey: async (group, ref, value, expectedRevision) => {
					const stored = await ctx.remote.credentials.set(ref, value);
					if (!stored.ok) return stored.error.message;
					const pointed = await ctx.remote.settings.mutate(PROTOCOM_ENTRY_ID$1, [{
						op: "set",
						path: rooted([
							"groups",
							group,
							"apiKey"
						]),
						value: ref
					}, {
						op: "set",
						path: rooted([
							"groups",
							group,
							"enabled"
						]),
						value: true
					}], expectedRevision);
					return pointed.ok ? void 0 : pointed.error.message;
				},
				writeSettings: async (ops, expectedRevision) => {
					const rootedOps = ops.map((op) => ({
						...op,
						path: rooted(op.path)
					}));
					const response = await ctx.remote.settings.mutate(PROTOCOM_ENTRY_ID$1, rootedOps, expectedRevision);
					if (response.ok) {
						const value = response.value.value;
						const section = value !== null && typeof value === "object" && !Array.isArray(value) ? value[sectionKey] : void 0;
						return {
							kind: "written",
							view: {
								...response.value,
								value: section ?? {}
							}
						};
					}
					const { code, message } = response.error;
					return code === "settings/conflict" ? {
						kind: "conflict",
						message
					} : {
						kind: "refused",
						message
					};
				},
				discoverModels: async (request) => {
					const response = await ctx.remote.llm.discoverModels(discoveryNs, request);
					return response.ok ? {
						kind: "found",
						models: response.value
					} : {
						kind: "refused",
						message: response.error.message
					};
				}
			};
		}
		//#endregion
		//#region src/client/ProtocomSection.tsx
		/**
		* Provider settings section — shared by the Protocom and OpenCode Go
		* families: one collapsible card per group. A card carries the group's own
		* enable switch, API key, and — the step that follows saving a key — the
		* exact models that group contributes to the model menu, one control row
		* each for visibility, context lengths, image input, and menu priority. The
		* endpoint's raw listing (model ↔ upstream id) stays behind a collapsed row:
		* it is a diagnostic, not a setting. Every mutation writes through the wire
		* (settings.mutate / credentials.set) scoped to the family's own namespace;
		* the page reloads its snapshot after each landed write.
		*/
		function sectionOf(view) {
			const value = view?.value;
			return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
		}
		function groupValueOf(section, key, family) {
			const raw = section.groups?.[key] ?? {};
			const defaults = family.defaults[key];
			return {
				enabled: raw.enabled ?? false,
				protocol: raw.protocol ?? defaults?.protocol ?? "chat-completions",
				contextLengths: raw.contextLengths?.length ? raw.contextLengths : [...defaults?.contextLengths ?? []],
				showBalance: raw.showBalance ?? true,
				apiKeys: raw.apiKeys ?? [],
				keyPolicy: raw.keyPolicy ?? "sticky"
			};
		}
		function formatAmount(value, unit) {
			return unit === "USD" ? `$${value.toFixed(2)}` : `${value}${unit === void 0 ? "" : ` ${unit}`}`;
		}
		/** The quota strip of a Go group card: the subscription's three rate windows. */
		function QuotaView({ usage, phase, error, onRefresh, t }) {
			const rows = [
				[t("quotaRolling"), usage?.rolling],
				[t("quotaWeekly"), usage?.weekly],
				[t("quotaMonthly"), usage?.monthly]
			].filter((pair) => pair[1] !== void 0);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "protocom-balance",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "protocom-balance-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("usageQuota") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "protocom-button",
							disabled: phase === "loading",
							onClick: onRefresh,
							children: phase === "loading" ? t("refreshing") : t("refresh")
						})]
					}),
					phase === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "protocom-error",
						children: `${t("loadFailed")}: ${error ?? ""}`
					}) : null,
					phase === "ready" && rows.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "protocom-notice",
						children: t("none")
					}) : null,
					rows.map(([label, window]) => {
						const percent = window.percent ?? 0;
						const limited = window.status === "rate-limited";
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "protocom-quota-row",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "protocom-quota-label",
									children: label
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "protocom-quota-bar",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: limited || percent > 80 ? "protocom-quota-fill is-warn" : "protocom-quota-fill",
										style: { width: `${Math.min(100, Math.max(0, percent))}%` }
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "protocom-quota-num",
									children: [`${percent}%`, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: limited ? t("quotaRateLimited") : window.resetsAt === void 0 ? "" : `${t("quotaResets")} ${window.resetsAt.slice(0, 10)}` })]
								})
							]
						}, label);
					})
				]
			});
		}
		/**
		* The Command Code account strip: remaining credits, the two rolling dollar
		* windows, and the period's usage totals.
		*
		* Every figure is a dollar amount or a count the endpoint actually stated. The
		* monthly number is a BALANCE whose pool size is never published, so it renders
		* as an amount rather than being forced into a percentage.
		*/
		function AccountView({ view, phase, error, onRefresh, t }) {
			const credits = view?.account?.credits;
			const usage = view?.account?.usage;
			const money = (value) => value === void 0 ? t("none") : "$" + value.toFixed(2);
			const windowRow = (label, window) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "protocom-quota-row",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "protocom-quota-label",
						children: label
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "protocom-quota-bar",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: window !== void 0 && window.exceeded ? "protocom-quota-fill is-warn" : "protocom-quota-fill",
							style: { width: (window?.percent ?? 0) + "%" }
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "protocom-quota-num",
						children: [window === void 0 ? t("none") : money(window.used) + " " + t("accountUsedOfCap") + " " + money(window.cap), window?.resetAt === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("accountResets") + " " + new Date(window.resetAt).toLocaleString() })]
					})
				]
			}, label);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "protocom-balance",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "protocom-balance-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("accountCredits") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "protocom-button",
							disabled: phase === "loading",
							onClick: onRefresh,
							children: phase === "loading" ? t("refreshing") : t("refresh")
						})]
					}),
					view?.credentialRejected === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "protocom-error",
						children: t("accountCredential")
					}) : null,
					phase === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "protocom-error",
						children: error ?? t("loadFailed")
					}) : null,
					phase !== "error" && view !== void 0 && !view.credits.reachable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "protocom-notice",
						children: view.credits.error ?? t("accountUnavailable")
					}) : null,
					credits === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "protocom-quota",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "protocom-balance-grid",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "protocom-balance-item",
									children: [t("accountMonthly") + " ", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: money(credits.monthlyCredits) })]
								}), credits.purchasedCredits === void 0 || credits.purchasedCredits === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "protocom-balance-item",
									children: [t("balance") + " ", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: money(credits.purchasedCredits) })]
								})]
							}),
							windowRow(t("accountFiveHour"), credits.fiveHour),
							windowRow(t("accountWeekly"), credits.weekly)
						]
					}),
					view !== void 0 && !view.usage.reachable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "protocom-notice",
						children: view.usage.error ?? t("accountUnavailable")
					}) : null,
					usage === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "protocom-quota",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "protocom-balance-item",
							children: t("accountUsage")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "protocom-balance-grid",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "protocom-balance-item",
									children: [t("accountRequests") + " ", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: usage.requests ?? t("none") })]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "protocom-balance-item",
									children: [t("accountSuccessRate") + " ", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: usage.successRatePercent === void 0 ? t("none") : usage.successRatePercent + "%" })]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "protocom-balance-item",
									children: [t("accountCost") + " ", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: money(usage.cost) })]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "protocom-balance-item",
									children: [t("accountTokens") + " ", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: usage.tokens ?? (usage.tokensIn ?? 0) + " / " + (usage.tokensOut ?? 0) })]
								})
							]
						})]
					})
				]
			});
		}
		/** The balance strip of one group card. */
		function BalanceView({ group, balance, phase, error, onRefresh, t }) {
			const items = [];
			const heroQuota = balance !== void 0 && balance.remaining !== void 0 && balance.limit !== void 0 && balance.limit > 0;
			if (balance !== void 0) {
				if (!heroQuota) {
					if (balance.remaining !== void 0) items.push([t("remaining"), formatAmount(balance.remaining, balance.unit)]);
					if (balance.limit !== void 0) items.push([t("limit"), formatAmount(balance.limit, balance.unit)]);
				}
				if (balance.balance !== void 0) items.push([t("balanceAmount"), formatAmount(balance.balance, balance.unit)]);
				if (balance.planName !== void 0) items.push([t("plan"), balance.planName]);
				if (balance.todayRequests !== void 0 || balance.todayCost !== void 0) {
					const parts = [balance.todayRequests === void 0 ? void 0 : `${balance.todayRequests} ${t("requests")}`, balance.todayCost === void 0 ? void 0 : formatAmount(balance.todayCost, balance.unit ?? "USD")].filter((part) => part !== void 0);
					items.push([t("today"), parts.join(" · ")]);
				}
				if (balance.rpm !== void 0 || balance.tpm !== void 0) items.push([t("rateWindow"), `RPM ${balance.rpm ?? t("none")} · TPM ${balance.tpm ?? t("none")}`]);
				if (balance.expiresAt !== void 0) items.push([t("expiresAt"), balance.expiresAt.slice(0, 10)]);
				if (balance.rateMultiplier !== void 0) items.push([t("rateMultiplier"), `×${balance.rateMultiplier}`]);
				if (balance.groupRateMultiplier !== void 0) items.push([t("groupRateMultiplier"), `×${balance.groupRateMultiplier}`]);
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "protocom-balance",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "protocom-balance-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("balance") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "protocom-button",
							disabled: phase === "loading",
							onClick: onRefresh,
							children: phase === "loading" ? t("refreshing") : t("refresh")
						})]
					}),
					phase === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "protocom-error",
						children: `${t("loadFailed")}: ${error ?? ""}`
					}) : null,
					phase === "ready" && items.length === 0 && !heroQuota ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "protocom-notice",
						children: t("none")
					}) : null,
					heroQuota && balance !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "protocom-quota",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "protocom-quota-hero",
							children: [formatAmount(balance.remaining, balance.unit), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: `/ ${formatAmount(balance.limit, balance.unit)} ${t("limit")}` })]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "protocom-quota-bar",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: (balance.limit - balance.remaining) / balance.limit > .8 ? "protocom-quota-fill is-warn" : "protocom-quota-fill",
								style: { width: `${Math.min(100, Math.max(0, (balance.limit - balance.remaining) / balance.limit * 100))}%` }
							})
						})]
					}) : null,
					items.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "protocom-balance-grid",
						children: items.map(([label, value]) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "protocom-balance-item",
							children: [`${label} `, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: value })]
						}, label))
					})
				]
			});
		}
		/** How many rows a group may hold before its list offers a filter box. */
		const FILTER_THRESHOLD = 8;
		/** One model's control row inside its group's card. */
		function ModelRow({ model, group, family, hidden, recommended, contexts, vision, writable, busy, t, onWrite }) {
			const [openRow, setOpenRow] = (0, react.useState)(false);
			const key = identityKey(model.upstreamId, family.registry);
			const hiddenSet = new Set(hidden);
			const shown = model.ids.every((id) => !hiddenSet.has(id));
			const starred = recommended.includes(key);
			const options = contextStepsFor(model, group.contextLengths);
			const stored = (contexts[key] ?? []).filter((length) => options.includes(length));
			const chosen = stored.length > 0 ? stored : options;
			const images = vision[key] ?? model.vision;
			const meta = [...model.reasoning === void 0 ? [] : [t("tagReasoning")]].join(" · ");
			const toggleShown = () => {
				const rest = hidden.filter((id) => !model.ids.includes(id));
				const next = shown ? [...rest, ...model.ids] : rest;
				onWrite(next.length === 0 ? [{
					op: "unset",
					path: ["hiddenModels"]
				}] : [{
					op: "set",
					path: ["hiddenModels"],
					value: next
				}]);
			};
			const writeContexts = (next) => {
				onWrite(next.length === options.length && next.every((length, index) => length === options[index]) ? [{
					op: "unset",
					path: ["modelContexts", key]
				}] : [{
					op: "set",
					path: ["modelContexts", key],
					value: next
				}]);
			};
			const toggleVision = () => {
				onWrite(images ? [{
					op: "set",
					path: ["visionModels", key],
					value: false
				}] : [{
					op: "unset",
					path: ["visionModels", key]
				}]);
			};
			const toggleStar = () => {
				const rest = recommended.filter((id) => id !== key);
				const next = starred ? rest : [...rest, key];
				onWrite(next.length === 0 ? [{
					op: "unset",
					path: ["recommendedModels"]
				}] : [{
					op: "set",
					path: ["recommendedModels"],
					value: next
				}]);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: shown ? "protocom-model-row" : "protocom-model-row is-off",
				title: model.ids.join("\n"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "protocom-model-pick",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: shown,
								disabled: !writable || busy,
								"aria-label": model.displayName,
								onChange: toggleShown
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "protocom-model-dot" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "protocom-model-name",
								children: model.displayName
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "protocom-model-spacer" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "protocom-model-summary",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "protocom-summary-ctx",
								children: chosen.map((length) => contextLabel(length)).join(" · ")
							}),
							images ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "protocom-summary-tag",
								children: t("tagVision")
							}) : null,
							starred ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "protocom-summary-tag is-lead",
								children: t("tagLead")
							}) : null
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "protocom-model-more",
						"aria-expanded": openRow,
						"aria-label": t("rowSettings"),
						title: t("rowSettings"),
						onClick: () => {
							setOpenRow(!openRow);
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "protocom-caret",
							"aria-hidden": "true",
							children: openRow ? "▾" : "▸"
						})
					}),
					openRow ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "protocom-model-detail",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "protocom-detail-field",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "protocom-detail-label",
									children: t("contextTitle")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "protocom-ctx",
									role: "group",
									"aria-label": t("contextTitle"),
									children: options.map((length) => {
										const on = chosen.includes(length);
										const last = on && chosen.length === 1;
										return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: on ? "is-on" : void 0,
											"aria-pressed": on,
											disabled: !writable || busy || last,
											title: last ? t("contextLastTitle") : t("contextTitle"),
											onClick: () => {
												writeContexts(on ? chosen.filter((value) => value !== length) : [...chosen, length].sort((left, right) => left - right));
											},
											children: contextLabel(length)
										}, length);
									})
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "protocom-detail-field",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "protocom-detail-label",
									children: t("visionTitle")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: images ? "protocom-vision is-on" : "protocom-vision",
									disabled: !writable || busy,
									"aria-pressed": images,
									onClick: toggleVision,
									children: images ? t("tagVision") : t("visionOff")
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "protocom-detail-field",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "protocom-detail-label",
									children: t("leadTitle")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: starred ? "protocom-model-star is-on" : "protocom-model-star",
									disabled: !writable || busy,
									"aria-pressed": starred,
									onClick: toggleStar,
									children: "★"
								})]
							}),
							meta.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "protocom-detail-field",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "protocom-detail-label",
									children: t("capabilityTitle")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "protocom-model-meta",
									children: meta
								})]
							})
						]
					}) : null
				]
			});
		}
		/** One group's card: credentials, its own menu models, and its balance. */
		function GroupCard({ groupKey, group, family, credential, writable, revision, probe, hidden, recommended, contexts, vision, operations, t, onChanged, onCommitted, onProbe }) {
			const ref = family.keyRef(groupKey);
			const [keyDraft, setKeyDraft] = (0, react.useState)("");
			const [keyBusy, setKeyBusy] = (0, react.useState)(false);
			const [keyMessage, setKeyMessage] = (0, react.useState)(void 0);
			const [poolDraft, setPoolDraft] = (0, react.useState)(void 0);
			const [poolNotice, setPoolNotice] = (0, react.useState)(void 0);
			/** The pool as the settings document states it; the draft wins while editing. */
			const [cardError, setCardError] = (0, react.useState)(void 0);
			const [busy, setBusy] = (0, react.useState)(false);
			const [open, setOpen] = (0, react.useState)(true);
			const [filter, setFilter] = (0, react.useState)("");
			const [balance, setBalance] = (0, react.useState)({
				phase: "idle",
				data: void 0,
				error: void 0
			});
			/**
			* Commit the pool textarea. Blank lines are dropped rather than stored as
			* empty references, and a repeat is refused locally so the operator sees
			* which line is at fault instead of a Host-level message about the group.
			*/
			const savePool = () => {
				if (poolDraft === void 0) return;
				const entries = poolDraft.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
				const seen = /* @__PURE__ */ new Set();
				for (const entry of entries) {
					if (seen.has(entry)) {
						setPoolNotice({
							kind: "error",
							text: `${t("keyPoolDuplicate")} ${entry}`
						});
						return;
					}
					seen.add(entry);
				}
				setPoolNotice(void 0);
				setPoolDraft(void 0);
				write(entries.length === 0 ? [{
					op: "unset",
					path: [
						"groups",
						groupKey,
						"apiKeys"
					]
				}] : [{
					op: "set",
					path: [
						"groups",
						groupKey,
						"apiKeys"
					],
					value: entries
				}]);
			};
			const write = (ops) => {
				setCardError(void 0);
				setBusy(true);
				operations.writeSettings(ops, revision).then(async (outcome) => {
					if (outcome.kind === "written") {
						onCommitted(outcome.view);
						return;
					}
					setCardError(outcome.message);
					await onChanged();
				}).finally(() => {
					setBusy(false);
				});
			};
			const loadBalance = async () => {
				setBalance((previous) => ({
					...previous,
					phase: "loading",
					error: void 0
				}));
				try {
					const response = await fetch(`${family.telemetryPath}?group=${groupKey}`);
					const unavailable = family.telemetryKind === "quota" ? t("quotaUnavailable") : family.telemetryKind === "account" ? t("accountUnavailable") : t("balanceUnavailable");
					if (response.status === 401 || response.status === 403 || response.status === 404) {
						setBalance({
							phase: "error",
							data: void 0,
							error: unavailable
						});
						return;
					}
					if (!response.ok) {
						const body = await response.json().catch(() => void 0);
						throw new Error(typeof body?.error === "string" ? body.error : `HTTP ${response.status}`);
					}
					const raw = await response.json();
					const data = family.telemetryKind === "quota" ? parseGoUsage(raw) : family.telemetryKind === "account" ? parseCommandCodeAccountView(raw) : parseBalanceView(raw);
					if (data === void 0) throw new Error(unavailable);
					setBalance({
						phase: "ready",
						data,
						error: void 0
					});
				} catch (error) {
					setBalance({
						phase: "error",
						data: void 0,
						error: error instanceof Error ? error.message : String(error)
					});
				}
			};
			const balanceVisible = group.enabled && group.showBalance;
			(0, react.useEffect)(() => {
				if (balanceVisible && balance.phase === "idle") loadBalance();
			}, [balanceVisible]);
			const saveKey = () => {
				if (keyDraft.length === 0 || keyBusy) return;
				setKeyBusy(true);
				setKeyMessage(void 0);
				operations.storeApiKey(groupKey, ref, keyDraft, revision).then(async (failure) => {
					if (failure !== void 0) {
						setKeyMessage({
							kind: "error",
							text: failure
						});
						return;
					}
					setKeyDraft("");
					setKeyMessage({
						kind: "ok",
						text: t("keySaved")
					});
					await onChanged();
				}).finally(() => {
					setKeyBusy(false);
				});
			};
			const credentialConfigured = credential?.configured === true;
			const rows = groupCatalog(groupKey, (probe.phase === "ready" ? probe.models : void 0)?.map((model) => ({
				id: model.id,
				...model.name === void 0 ? {} : { displayName: model.name }
			})), {
				recommended,
				family,
				registryFallback: probe.phase === "ready" || probe.phase === "error"
			});
			const needle = filter.trim().toLowerCase();
			const visibleRows = needle.length === 0 ? rows : rows.filter((row) => row.displayName.toLowerCase().includes(needle) || row.ids.some((id) => id.toLowerCase().includes(needle)));
			const groupIds = rows.flatMap((row) => [...row.ids]);
			const hiddenInGroup = groupIds.filter((id) => hidden.includes(id));
			const entryCount = visibleRows.reduce((total, row) => {
				const lengths = contexts[identityKey(row.upstreamId, family.registry)] ?? variantLengths(row.contextOptions, group.contextLengths) ?? [row.contextWindow];
				return total + Math.max(1, lengths.length);
			}, 0);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: group.enabled ? "protocom-card" : "protocom-card is-off",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "protocom-card-head",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "protocom-card-toggle",
							"aria-expanded": open,
							title: open ? t("collapse") : t("expand"),
							onClick: () => {
								setOpen(!open);
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "protocom-caret",
								"aria-hidden": "true",
								children: open ? "▾" : "▸"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "protocom-card-name",
								children: t(`group${groupKey.charAt(0).toUpperCase()}${groupKey.slice(1)}`)
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "protocom-tag",
							title: t("protocol"),
							children: group.protocol
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "protocom-head-state",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: credentialConfigured ? "protocom-dot is-on" : "protocom-dot" }),
								credentialConfigured ? t("keyConfigured") : t("keyMissing"),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "protocom-switch",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											role: "switch",
											checked: group.enabled,
											disabled: !writable || busy,
											"aria-label": t("enabled"),
											onChange: () => {
												write([{
													op: "set",
													path: [
														"groups",
														groupKey,
														"enabled"
													],
													value: !group.enabled
												}]);
											}
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "protocom-switch-track",
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "protocom-switch-thumb" })
										}),
										t("enabled")
									]
								})
							]
						})
					]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "protocom-card-body",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "protocom-field",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "protocom-field-label",
									children: t("apiKey")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "password",
									className: "protocom-input",
									value: keyDraft,
									placeholder: credentialConfigured ? t("keyConfigured") : t("keyPlaceholder"),
									"aria-label": `${t("apiKey")} (${ref})`,
									disabled: !writable || credential?.writable === false,
									autoComplete: "new-password",
									spellCheck: false,
									onChange: (event) => {
										setKeyDraft(event.target.value);
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "protocom-button protocom-button-primary",
									disabled: !writable || keyBusy || keyDraft.length === 0,
									onClick: saveKey,
									children: keyBusy ? t("savingKey") : t("saveKey")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "protocom-key-state",
							children: credentialConfigured ? `${t("keyConfigured")} (${ref})` : `${t("keyMissing")} (${ref})`
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "protocom-field",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "protocom-field-label",
									children: t("keyPool")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
									className: "protocom-input protocom-keypool",
									rows: Math.max(2, (group.apiKeys?.length ?? 0) + 1),
									value: poolDraft ?? (group.apiKeys ?? []).join("\n"),
									placeholder: t("keyPoolPlaceholder"),
									"aria-label": t("keyPool"),
									disabled: !writable || busy,
									spellCheck: false,
									onChange: (event) => {
										setPoolDraft(event.target.value);
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "protocom-button",
									disabled: !writable || busy || poolDraft === void 0,
									onClick: savePool,
									children: t("keyPoolApply")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "protocom-notice",
							children: t("keyPoolHint")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "protocom-field",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "protocom-field-label",
								children: t("keyPolicy")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								className: "protocom-input",
								"aria-label": t("keyPolicy"),
								value: group.keyPolicy ?? "sticky",
								disabled: !writable || busy,
								onChange: (event) => {
									write([{
										op: "set",
										path: [
											"groups",
											groupKey,
											"keyPolicy"
										],
										value: event.target.value
									}]);
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "sticky",
									children: t("keyPolicySticky")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "round-robin",
									children: t("keyPolicyRoundRobin")
								})]
							})]
						}),
						poolNotice === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: poolNotice.kind === "ok" ? "protocom-status" : "protocom-error",
							children: poolNotice.text
						}),
						keyMessage === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: keyMessage.kind === "ok" ? "protocom-status" : "protocom-error",
							children: keyMessage.kind === "ok" ? keyMessage.text : `${t("keyFailed")}: ${keyMessage.text}`
						}),
						cardError === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "protocom-error",
							children: cardError
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "protocom-models-head",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "protocom-models-title",
									children: t("models")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "protocom-models-count",
									children: rows.length === 0 ? "" : `${rows.length} ${t("modelCount")} · ${entryCount} ${t("menuEntries")}`
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "protocom-model-spacer" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "protocom-button",
									disabled: probe.phase === "loading" || !writable,
									onClick: onProbe,
									children: probe.phase === "loading" ? t("probing") : t("probeRefresh")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "protocom-button",
									disabled: !writable || busy || hiddenInGroup.length === 0,
									onClick: () => {
										const next = hidden.filter((id) => !groupIds.includes(id));
										write(next.length === 0 ? [{
											op: "unset",
											path: ["hiddenModels"]
										}] : [{
											op: "set",
											path: ["hiddenModels"],
											value: next
										}]);
									},
									children: t("selectAll")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "protocom-button",
									disabled: !writable || busy || hiddenInGroup.length >= groupIds.length,
									onClick: () => {
										write([{
											op: "set",
											path: ["hiddenModels"],
											value: [.../* @__PURE__ */ new Set([...hidden, ...groupIds])]
										}]);
									},
									children: t("selectNone")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "protocom-notice",
							children: t("modelsHint")
						}),
						probe.phase === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "protocom-error",
							children: `${t("probeFailed")}: ${probe.message}`
						}) : null,
						probe.phase === "ready" && probe.models.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "protocom-notice",
							children: t("probeEmpty")
						}) : null,
						probe.phase !== "ready" && !credentialConfigured ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "protocom-notice",
							children: t("probeNeedsKey")
						}) : null,
						probe.phase === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "protocom-notice",
							children: t("listingFallback")
						}) : null,
						rows.length > FILTER_THRESHOLD ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "text",
							className: "protocom-input",
							value: filter,
							placeholder: t("filterModels"),
							"aria-label": t("filterModels"),
							onChange: (event) => {
								setFilter(event.target.value);
							}
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "protocom-models",
							children: visibleRows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelRow, {
								model: row,
								group,
								family,
								hidden,
								recommended,
								contexts,
								vision,
								writable,
								busy,
								t,
								onWrite: write
							}, row.displayName))
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
							className: "protocom-advanced",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("probeDetails") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "protocom-advanced-body",
								children: probe.phase === "ready" && probe.models.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", {
									className: "protocom-probe-table",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("colModel") }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("colId") }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("colServed") })
									] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: probe.models.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: matchRegistry(model.id, family.registry)?.displayName ?? (model.name !== void 0 && model.name !== model.id ? model.name : model.id) }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "protocom-probe-id",
											children: model.id
										}) }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: servesChat(model.id, family.refused) ? t("servedYes") : t("servedNo") })
									] }, model.id)) })]
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "protocom-notice",
									children: t("probeHint")
								})
							})]
						}),
						balanceVisible ? family.telemetryKind === "quota" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuotaView, {
							usage: balance.data,
							phase: balance.phase,
							error: balance.error,
							onRefresh: () => {
								loadBalance();
							},
							t
						}) : family.telemetryKind === "account" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountView, {
							view: balance.data,
							phase: balance.phase,
							error: balance.error,
							onRefresh: () => {
								loadBalance();
							},
							t
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BalanceView, {
							group: groupKey,
							balance: balance.data,
							phase: balance.phase,
							error: balance.error,
							onRefresh: () => {
								loadBalance();
							},
							t
						}) : null
					]
				}) : null]
			});
		}
		/**
		* Render the Protocom API section content column.
		* `param props - slot-delivered injected dependencies.
		* `returns the section, or null while the shell has not injected yet.
		*/
		function ProtocomSection(props) {
			const { operations, t, family, copy } = props;
			if (operations === void 0 || t === void 0 || family === void 0 || copy === void 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Loaded, {
				operations,
				t,
				family,
				copy
			});
		}
		function Loaded({ operations, t, family, copy }) {
			const [state, setState] = (0, react.useState)({
				phase: "loading",
				credentials: {}
			});
			const [baseDraft, setBaseDraft] = (0, react.useState)(void 0);
			const [allowCustomDraft, setAllowCustomDraft] = (0, react.useState)(void 0);
			const [baseBusy, setBaseBusy] = (0, react.useState)(false);
			const [baseNotice, setBaseNotice] = (0, react.useState)(void 0);
			const [retryAttemptsDraft, setRetryAttemptsDraft] = (0, react.useState)(void 0);
			const [retryDelayDraft, setRetryDelayDraft] = (0, react.useState)(void 0);
			const [probes, setProbes] = (0, react.useState)({});
			const load = async () => {
				const view = await operations.describeSettings();
				if (view === void 0) {
					setState({
						phase: "error",
						credentials: {},
						error: `${t("entryUnavailable")} (${PROTOCOM_ENTRY_ID$1})`
					});
					return;
				}
				const credentials = await operations.describeCredentials(family.keys.map((key) => family.keyRef(key)));
				setState({
					phase: "ready",
					view,
					credentials
				});
			};
			/**
			* Adopt a view the Host has just committed.
			*
			* Only the settings value is replaced, and it is replaced from the reply the
			* write already carried. The previous behaviour re-read BOTH the settings and
			* every group's credential state on each write, then swapped the whole page
			* state -- one round trip and a full-subtree re-render per toggle, which is
			* what a person sees as the page flashing. Credential state cannot change
			* from a settings write, so re-reading it was pure cost.
			* @param view - the committed section view, already section-shaped.
			*/
			const applyCommitted = (view) => {
				setState((previous) => previous.phase === "ready" ? {
					...previous,
					view,
					credentials: previous.credentials
				} : previous);
			};
			(0, react.useEffect)(() => {
				if (state.phase === "loading") load();
			}, []);
			const baseURL = state.phase === "ready" ? sectionOf(state.view).baseURL : void 0;
			const runProbe = (groupKey) => {
				setProbes((current) => ({
					...current,
					[groupKey]: { phase: "loading" }
				}));
				operations.discoverModels({
					provider: family.providerOf(groupKey),
					...baseURL === void 0 ? {} : { baseURL }
				}).then((outcome) => {
					setProbes((current) => ({
						...current,
						[groupKey]: outcome.kind === "found" ? {
							phase: "ready",
							models: outcome.models
						} : {
							phase: "error",
							message: outcome.message
						}
					}));
				});
			};
			const section = state.phase === "ready" ? sectionOf(state.view) : {};
			const probeKey = family.keys.filter((key) => groupValueOf(section, key, family).enabled && state.credentials[family.keyRef(key)]?.configured === true && probes[key] === void 0).join(",");
			(0, react.useEffect)(() => {
				for (const key of probeKey.length === 0 ? [] : probeKey.split(",")) runProbe(key);
			}, [probeKey]);
			if (state.phase === "loading") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "protocom-notice",
				children: t("loading")
			});
			if (state.phase === "error") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "protocom-section",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "protocom-error",
					children: `${t("loadFailed")}: ${state.error ?? ""}`
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "protocom-button",
					onClick: () => {
						load();
					},
					children: t("retry")
				})]
			});
			const revision = state.view?.revision;
			const writable = revision !== void 0;
			const allowCustom = allowCustomDraft ?? section.allowCustomBaseURL ?? false;
			/**
			* Apply the advanced block. The retry budget shares this control, so it must
			* work when the operator changed only a number and never touched the endpoint:
			* the effective base URL is the draft when there is one, the stored value
			* otherwise, and the shipped default as the last resort.
			*/
			const applyBaseURL = () => {
				if (baseBusy) return;
				const nextBaseURL = baseDraft ?? baseURL ?? family.baseURL;
				let origin;
				try {
					origin = new URL(nextBaseURL).origin;
				} catch {
					origin = void 0;
				}
				const needsCustom = origin !== void 0 && origin !== family.origin;
				if (needsCustom && !allowCustom) {
					setBaseNotice({
						kind: "error",
						text: t("allowCustomRequired")
					});
					return;
				}
				const attempts = Number(retryAttemptsDraft ?? retryMaxAttempts);
				const delay = Number(retryDelayDraft ?? retryMaxDelayMs);
				if (!Number.isSafeInteger(attempts) || attempts < 0 || attempts > 100) {
					setBaseNotice({
						kind: "error",
						text: t("retryInvalidAttempts")
					});
					return;
				}
				if (!Number.isFinite(delay) || delay < 500 || delay > 2147483647) {
					setBaseNotice({
						kind: "error",
						text: t("retryInvalidDelay")
					});
					return;
				}
				setBaseBusy(true);
				setBaseNotice(void 0);
				operations.writeSettings([
					...needsCustom ? [{
						op: "set",
						path: ["allowCustomBaseURL"],
						value: true
					}, {
						op: "set",
						path: ["baseURL"],
						value: nextBaseURL
					}] : [{
						op: "unset",
						path: ["allowCustomBaseURL"]
					}, {
						op: "set",
						path: ["baseURL"],
						value: nextBaseURL
					}],
					{
						op: "set",
						path: ["retryMaxAttempts"],
						value: attempts
					},
					{
						op: "set",
						path: ["retryMaxDelayMs"],
						value: delay
					}
				], revision).then(async (outcome) => {
					if (outcome.kind !== "written") {
						setBaseNotice({
							kind: "error",
							text: outcome.message
						});
						await load();
						return;
					}
					setBaseNotice({
						kind: "ok",
						text: t("saved")
					});
					await load();
				}).finally(() => {
					setBaseBusy(false);
				});
			};
			const retryMaxAttempts = section.retryMaxAttempts ?? 20;
			const retryMaxDelayMs = section.retryMaxDelayMs ?? 36e5;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "protocom-section",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						className: "protocom-title",
						children: copy.title
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "protocom-intro",
						children: copy.intro
					}),
					writable ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "protocom-notice",
						children: t("readOnly")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						className: "protocom-groups",
						children: family.keys.map((key) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GroupCard, {
							groupKey: key,
							family,
							group: groupValueOf(section, key, family),
							credential: state.credentials[family.keyRef(key)],
							writable,
							revision,
							probe: probes[key] ?? { phase: "idle" },
							hidden: section.hiddenModels ?? [],
							recommended: section.recommendedModels ?? family.recommended,
							contexts: section.modelContexts ?? {},
							vision: section.visionModels ?? {},
							operations,
							t,
							onChanged: load,
							onCommitted: applyCommitted,
							onProbe: () => {
								runProbe(key);
							}
						}, key))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
						className: "protocom-advanced",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("advanced") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "protocom-advanced-body",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "protocom-field-label",
										children: t("baseUrl")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "text",
										className: "protocom-input",
										value: baseDraft ?? baseURL ?? "",
										"aria-label": t("baseUrl"),
										disabled: !writable,
										onChange: (event) => {
											setBaseDraft(event.target.value);
										}
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: "protocom-check",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: allowCustom,
											disabled: !writable,
											"aria-label": t("allowCustom"),
											onChange: (event) => {
												setAllowCustomDraft(event.target.checked);
											}
										}), t("allowCustom")]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "protocom-notice",
										children: t("allowCustomHint")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "protocom-button",
										disabled: !writable || baseBusy,
										onClick: applyBaseURL,
										children: baseBusy ? t("applying") : t("apply")
									})
								]
							}),
							baseNotice === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: baseNotice.kind === "ok" ? "protocom-status" : "protocom-error",
								children: baseNotice.text
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "protocom-advanced-body",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "protocom-field-label",
									children: t("retryMaxAttempts")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "number",
									className: "protocom-input",
									min: 0,
									max: 100,
									value: retryAttemptsDraft ?? String(retryMaxAttempts),
									"aria-label": t("retryMaxAttempts"),
									disabled: !writable,
									onChange: (event) => {
										setRetryAttemptsDraft(event.target.value);
									}
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "protocom-notice",
								children: t("retryMaxAttemptsHint")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "protocom-advanced-body",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "protocom-field-label",
									children: t("retryMaxDelayMs")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "number",
									className: "protocom-input",
									min: 500,
									value: retryDelayDraft ?? String(retryMaxDelayMs),
									"aria-label": t("retryMaxDelayMs"),
									disabled: !writable,
									onChange: (event) => {
										setRetryDelayDraft(event.target.value);
									}
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "protocom-notice",
								children: t("retryMaxDelayMsHint")
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region src/client/FusionSection.tsx
		/**
		* Fusion dual-model settings section: a status card on the settings page whose
		* Configure button opens the seat editor. The editor stages both seats and the
		* two switches locally and commits them as ONE revision-fenced mutation, so a
		* half-configured pair is never stored. Saving also soft-applies the leader
		* (default model, then the current top-level Session) unless the deployment
		* turned that off — the composer can still switch away, which is what makes it
		* soft rather than a lock.
		*
		* Model options come from the Host catalog the composer itself uses, so the
		* list is exactly the enabled providers' selectable models, and each context
		* variant (`::ctx@N`) is its own row because choosing a context is choosing
		* that row.
		*/
		/** The registry describing one provider route, when a family owns it. */
		function registryFor(provider) {
			for (const family of FAMILIES) if (family.groupOf(provider) !== void 0) return family.registry;
			return [];
		}
		function routeOption(provider, providerName, model) {
			const decoded = decodeVariantId(model.id);
			const entry = matchRegistry(stripVariantId(model.id), registryFor(provider));
			return {
				key: `${provider}\u0000${model.id}`,
				provider,
				providerName,
				model: model.id,
				modelName: model.name,
				contextWindow: decoded.contextWindow ?? entry?.contextWindow,
				efforts: model.reasoning?.efforts ?? [],
				defaultEffort: model.reasoning?.defaultEffort,
				pricing: entry?.pricing
			};
		}
		/** Flatten the catalog into per-route rows. */
		function routeOptions(catalog) {
			return catalog.groups.flatMap((group) => group.models.map((model) => routeOption(group.id, group.name, model)));
		}
		/** The catalog row a stored seat names, when that route is still offered. */
		function optionFor(options, seat) {
			if (seat?.provider === void 0 || seat.model === void 0) return void 0;
			return options.find((option) => option.provider === seat.provider && option.model === seat.model);
		}
		/** Whether a stored seat names both halves of a route. */
		function seatComplete(seat) {
			return seat?.provider !== void 0 && seat.provider !== "" && seat.model !== void 0 && seat.model !== "";
		}
		/** Format one per-million-token price for the cost strip. */
		function price(value) {
			return `$${value % 1 === 0 ? value.toFixed(0) : value.toFixed(2)}`;
		}
		/** The stored section as an editable draft, with defaults resolved. */
		function draftFrom(state) {
			const value = state.value;
			return {
				enabled: value?.enabled ?? false,
				leader: seatComplete(value?.leader) ? { ...value.leader } : void 0,
				coder: seatComplete(value?.coder) ? { ...value.coder } : void 0,
				includeForks: value?.includeForks ?? true,
				applyLeader: value?.applyLeader ?? true
			};
		}
		/**
		* Compute the cost strip's shares.
		*
		* Pricing comes from this plugin's own registry, and no entry currently carries
		* a `pricing` block — the endpoints publish no price list this plugin can
		* verify, so every row renders its "no published price" state today. The
		* computation is real rather than stubbed so that filling in registry pricing
		* is all it takes for the strip to light up.
		* @param leader - the leader seat's published price, if any.
		* @param coder - the coder seat's published price, if any.
		* @returns one row per seat, in strip order, and the priced total.
		*/
		function costBreakdown(leader, coder) {
			const total = [leader, coder].filter((entry) => entry !== void 0).reduce((sum, entry) => sum + entry.input + entry.output, 0);
			const shareOf = (pricing) => {
				if (pricing === void 0 || total === 0) return 0;
				return (pricing.input + pricing.output) / total * 100;
			};
			return {
				rows: [{
					key: "seatLeader",
					pricing: leader,
					share: shareOf(leader)
				}, {
					key: "seatCoder",
					pricing: coder,
					share: shareOf(coder)
				}],
				total
			};
		}
		/** The cost strip: the two seats' published prices and their relative weight. */
		function CostStrip({ leader, coder, t }) {
			const { rows } = costBreakdown(leader?.pricing, coder?.pricing);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "protocom-fusion-cost",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "protocom-fusion-cost-title",
						children: t("costTitle")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "protocom-fusion-bar",
						role: "presentation",
						children: rows.map((row) => row.pricing === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "protocom-fusion-bar-part",
							style: { width: `${row.share}%` },
							title: t(row.key)
						}, row.key))
					}),
					rows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "protocom-fusion-cost-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "protocom-fusion-cost-seat",
							children: t(row.key)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "protocom-fusion-cost-prices",
							children: row.pricing === void 0 ? t("costUnknown") : `${t("costInput")} ${price(row.pricing.input)} · ${t("costCache")} ${row.pricing.cacheRead === void 0 ? t("costUnknown") : price(row.pricing.cacheRead)} · ${t("costOutput")} ${price(row.pricing.output)}`
						})]
					}, row.key))
				]
			});
		}
		/** One seat editor row: the route picker, its context badge, and its effort list. */
		function SeatRow({ seat, options, value, disabled, unavailable, onChange, t }) {
			const selected = optionFor(options, value);
			const label = seat === "leader" ? t("seatLeader") : t("seatCoder");
			const pickerId = `fusion-${seat}-model`;
			const effortId = `fusion-${seat}-effort`;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "protocom-fusion-seat",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "protocom-fusion-seat-head",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								className: "protocom-fusion-seat-label",
								htmlFor: pickerId,
								children: label
							}),
							selected?.contextWindow === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "protocom-fusion-ctx",
								children: [
									t("contextLabel"),
									" ",
									contextLabel(selected.contextWindow)
								]
							}),
							unavailable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "protocom-fusion-unavailable",
								children: t("seatUnavailable")
							}) : null
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
						id: pickerId,
						className: "protocom-input",
						"aria-label": label,
						disabled,
						value: selected?.key ?? "",
						onChange: (event) => {
							const next = options.find((option) => option.key === event.target.value);
							if (next === void 0) {
								onChange(void 0);
								return;
							}
							onChange({
								provider: next.provider,
								model: next.model
							});
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: "",
							children: t("seatUnset")
						}), options.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: option.key,
							children: `${option.providerName} · ${option.modelName}`
						}, option.key))]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "protocom-fusion-effort",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							className: "protocom-fusion-effort-label",
							htmlFor: effortId,
							children: t("effortLabel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
							id: effortId,
							className: "protocom-input",
							"aria-label": `${label} ${t("effortLabel")}`,
							disabled: disabled || selected === void 0 || selected.efforts.length === 0,
							value: value?.reasoningEffort ?? "",
							onChange: (event) => {
								if (selected === void 0) return;
								const effort = event.target.value;
								onChange({
									provider: selected.provider,
									model: selected.model,
									...effort === "" ? {} : { reasoningEffort: effort }
								});
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "",
								children: selected?.defaultEffort === void 0 ? t("effortDefault") : `${t("effortDefault")} (${selected.defaultEffort})`
							}), (selected?.efforts ?? []).map((effort) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: effort.id,
								children: effort.name
							}, effort.id))]
						})]
					})
				]
			});
		}
		/** One switch, matching the provider cards' own control. */
		function Toggle({ id, checked, disabled, onChange, label }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: "protocom-switch",
				htmlFor: id,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						id,
						type: "checkbox",
						checked,
						disabled,
						onChange: (event) => {
							onChange(event.target.checked);
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "protocom-switch-track",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "protocom-switch-thumb" })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label })
				]
			});
		}
		/**
		* Render the Fusion settings section and, on demand, its seat editor.
		* @param props - locale copy, the injected Host operations, and the heading.
		* @returns the section, or nothing until the shell injects.
		*/
		function FusionSection(props) {
			const { operations, t, copy } = props;
			if (operations === void 0 || t === void 0 || copy === void 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FusionBody, {
				operations,
				t,
				copy
			});
		}
		function FusionBody({ operations, t, copy }) {
			const [state, setState] = (0, react.useState)(() => operations.section());
			const [draft, setDraft] = (0, react.useState)(void 0);
			const [load, setLoad] = (0, react.useState)({ phase: "loading" });
			const [busy, setBusy] = (0, react.useState)(false);
			const [notice, setNotice] = (0, react.useState)(void 0);
			(0, react.useEffect)(() => operations.subscribe(() => {
				setState(operations.section());
			}), [operations]);
			(0, react.useEffect)(() => {
				let live = true;
				(async () => {
					const outcome = await operations.loadCatalog();
					if (!live) return;
					setLoad(outcome.kind === "found" ? {
						phase: "ready",
						catalog: outcome.catalog
					} : {
						phase: "error",
						message: outcome.message
					});
				})();
				return () => {
					live = false;
				};
			}, [operations]);
			const catalog = load.phase === "ready" ? load.catalog : void 0;
			const options = catalog === void 0 ? [] : routeOptions(catalog);
			const stored = draftFrom(state);
			const editing = draft !== void 0;
			const effective = draft ?? stored;
			/** Stage one edit over the draft (seeding it from the stored section first). */
			const patch = (change) => {
				setDraft((current) => ({
					...current ?? { ...stored },
					...change
				}));
			};
			const open = () => {
				setNotice(void 0);
				setDraft({ ...stored });
			};
			const save = async () => {
				if (draft === void 0 || busy) return;
				if (draft.enabled && (!seatComplete(draft.leader) || !seatComplete(draft.coder))) {
					setNotice({
						kind: "error",
						text: t("needBothSeats")
					});
					return;
				}
				setBusy(true);
				setNotice(void 0);
				try {
					const written = await operations.saveFusion(draft, state.revision);
					if (written.kind !== "written") {
						setNotice({
							kind: "error",
							text: written.kind === "conflict" ? t("conflict") : `${t("saveFailed")}: ${written.message}`
						});
						return;
					}
					const failures = draft.enabled && draft.applyLeader && seatComplete(draft.leader) ? await operations.applyLeader(draft.leader) : [];
					setDraft(void 0);
					setNotice(failures.length === 0 ? {
						kind: "ok",
						text: t("saved")
					} : {
						kind: "error",
						text: `${t("savedApplyFailed")}: ${failures.join(" ")}`
					});
				} finally {
					setBusy(false);
				}
			};
			const hasStoredSeats = seatComplete(stored.leader) || seatComplete(stored.coder);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "protocom-section",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						className: "protocom-title",
						children: copy.title
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "protocom-intro",
						children: copy.intro
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "protocom-card",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "protocom-card-head",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: stored.enabled ? "protocom-dot is-on" : "protocom-dot" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "protocom-card-name",
										children: t("statusTitle")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "protocom-head-state",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "protocom-tag",
											children: stored.enabled ? t("statusOn") : t("statusOff")
										})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "protocom-button",
										onClick: open,
										disabled: busy || load.phase !== "ready",
										children: t("configure")
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "protocom-notice",
								children: hasStoredSeats ? `${t("seatLeader")}: ${seatSummary(stored.leader, t)} · ${t("seatCoder")}: ${seatSummary(stored.coder, t)}` : t("noSeats")
							}),
							load.phase === "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "protocom-notice",
								children: t("loading")
							}) : null,
							load.phase === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
								className: "protocom-error",
								children: [
									`${t("catalogFailed")}: ${load.message}`,
									" ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "protocom-button",
										onClick: () => {
											setLoad({ phase: "loading" });
											operations.loadCatalog().then((outcome) => {
												setLoad(outcome.kind === "found" ? {
													phase: "ready",
													catalog: outcome.catalog
												} : {
													phase: "error",
													message: outcome.message
												});
											});
										},
										children: t("retry")
									})
								]
							}) : null,
							load.phase === "ready" && load.catalog.failures.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "protocom-notice",
								children: t("catalogPartial")
							}) : null,
							state.status === "unavailable" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "protocom-notice",
								children: t("sectionUnavailable")
							}) : null,
							notice === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: notice.kind === "ok" ? "protocom-status" : "protocom-error",
								children: notice.text
							})
						]
					}),
					editing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "protocom-fusion-modal",
						role: "dialog",
						"aria-label": t("modalTitle"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "protocom-fusion-modal-body",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
									className: "protocom-fusion-modal-title",
									children: t("modalTitle")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "protocom-fusion-modal-intro",
									children: t("modalIntro")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toggle, {
									id: "fusion-enabled",
									checked: effective.enabled,
									disabled: busy,
									onChange: (next) => {
										patch({ enabled: next });
									},
									label: t("enabled")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SeatRow, {
									seat: "leader",
									options,
									value: effective.leader,
									disabled: busy,
									unavailable: seatComplete(effective.leader) && optionFor(options, effective.leader) === void 0,
									onChange: (next) => {
										patch({ leader: next });
									},
									t
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SeatRow, {
									seat: "coder",
									options,
									value: effective.coder,
									disabled: busy,
									unavailable: seatComplete(effective.coder) && optionFor(options, effective.coder) === void 0,
									onChange: (next) => {
										patch({ coder: next });
									},
									t
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toggle, {
									id: "fusion-forks",
									checked: effective.includeForks,
									disabled: busy,
									onChange: (next) => {
										patch({ includeForks: next });
									},
									label: t("includeForks")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toggle, {
									id: "fusion-apply-leader",
									checked: effective.applyLeader,
									disabled: busy,
									onChange: (next) => {
										patch({ applyLeader: next });
									},
									label: t("applyLeader")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CostStrip, {
									leader: optionFor(options, effective.leader),
									coder: optionFor(options, effective.coder),
									t
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "protocom-fusion-actions",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "protocom-button",
										disabled: busy,
										onClick: () => {
											setDraft(void 0);
											setNotice(void 0);
										},
										children: t("cancel")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "protocom-button protocom-button-primary",
										disabled: busy || !state.writable,
										onClick: () => {
											save();
										},
										children: busy ? t("saving") : t("save")
									})]
								})
							]
						})
					}) : null
				]
			});
		}
		/** One seat's one-line summary, or its unset marker. */
		function seatSummary(seat, t) {
			if (!seatComplete(seat)) return t("seatUnset");
			return seat.reasoningEffort === void 0 ? seat.model : `${seat.model} (${seat.reasoningEffort})`;
		}
		//#endregion
		//#region src/client/fusion-operations.ts
		/**
		* The Loader entry id this plugin's settings form is keyed by; mirrors
		* `PROTOCOM_NS` on the Host.
		*
		* 1.7 keys a form by profile row rather than by a namespace the plugin
		* registers, and one entry has exactly one Config. All four sections therefore
		* share this id and are addressed by their path prefix within it — see
		* {@link FUSION_SECTION_PATH}.
		*/
		const PROTOCOM_ENTRY_ID = "protocom-api";
		/** Where the Fusion section sits inside that one Config. */
		const FUSION_SECTION_PATH = "fusion";
		/** Read the shell's current Session id, or undefined in the no-session view. */
		function currentSessionId(ctx) {
			return ctx.sessions?.list.getSnapshot().current;
		}
		/**
		* Pick the Session a leader change should apply to: the current one, and only
		* when it is a top-level conversation. A subagent Session is deliberately
		* excluded — addressing one through this Host API activates persisted history
		* outside the parent-continuation path, which the harness refuses, and a
		* subagent belongs on the coder seat anyway.
		* @param rows - the client Session list.
		* @param current - the id the shell currently shows, when any.
		* @returns the id to select a model on, or undefined when none qualifies.
		*/
		function leaderTargetSession(rows, current) {
			if (current === void 0) return void 0;
			const row = rows.find((candidate) => candidate.sessionId === current);
			if (row === void 0) return void 0;
			return row.origin === "subagent" ? void 0 : current;
		}
		/**
		* The path operations that write one draft as a complete section.
		*
		* Every path is rooted at the section name because 1.7 addresses fields from
		* the Config root: the form belongs to the entry, and `fusion` is the section
		* inside it rather than a namespace of its own.
		*/
		function fusionOps(draft) {
			const path = (...rest) => [FUSION_SECTION_PATH, ...rest];
			return [
				{
					op: "set",
					path: path("enabled"),
					value: draft.enabled
				},
				{
					op: "set",
					path: path("leader"),
					value: seatValue(draft.leader)
				},
				{
					op: "set",
					path: path("coder"),
					value: seatValue(draft.coder)
				},
				{
					op: "set",
					path: path("includeForks"),
					value: draft.includeForks
				},
				{
					op: "set",
					path: path("applyLeader"),
					value: draft.applyLeader
				}
			];
		}
		/** One seat as a plain JSON object; an unset seat writes as `{}`. */
		function seatValue(seat) {
			if (seat === void 0) return {};
			return {
				provider: seat.provider,
				model: seat.model,
				...seat.reasoningEffort === void 0 ? {} : { reasoningEffort: seat.reasoningEffort }
			};
		}
		/**
		* Bind the Fusion section's Host operations.
		* @param ctx - the plugin's context, which declares `remote.session` and
		* `configForms` in its own `inject`.
		* @param t - the section's translator. The `applyLeader` outcomes that are not
		* failures but still need saying -- "there is no session to apply this to" --
		* are prose, so the wording stays with the locale rather than here.
		*/
		function createFusionOperations(ctx, t) {
			const scope = ctx.configForms.get(PROTOCOM_ENTRY_ID);
			const session = ctx.remote.session;
			return {
				loadCatalog: async () => {
					const response = await session.modelCatalog();
					return response.ok ? {
						kind: "found",
						catalog: response.value
					} : {
						kind: "refused",
						message: response.error.message
					};
				},
				section: () => {
					const snapshot = scope.getSnapshot();
					return {
						status: snapshot.status,
						value: snapshot.value,
						revision: snapshot.revision,
						writable: snapshot.writable
					};
				},
				subscribe: (listener) => scope.subscribe(listener),
				saveFusion: async (draft, expectedRevision) => {
					try {
						await scope.mutate(fusionOps(draft), expectedRevision);
						return { kind: "written" };
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						return /conflict/i.test(message) ? {
							kind: "conflict",
							message
						} : {
							kind: "refused",
							message
						};
					}
				},
				applyLeader: async (seat) => {
					const failures = [];
					const current = currentSessionId(ctx);
					if (current === void 0) {
						failures.push(t("applyLeaderNoSession"));
						return failures;
					}
					const listed = await session.list({});
					if (!listed.ok) {
						failures.push(listed.error.message);
						return failures;
					}
					const target = leaderTargetSession(listed.value.items, current);
					if (target === void 0) {
						failures.push(t("applyLeaderSubagent"));
						return failures;
					}
					const selected = await session.selectModel({
						sessionId: target,
						provider: seat.provider,
						model: seat.model,
						...seat.reasoningEffort === void 0 ? {} : { reasoningEffort: seat.reasoningEffort }
					});
					if (!selected.ok) failures.push(selected.error.message);
					return failures;
				}
			};
		}
		//#endregion
		//#region src/client/locale.ts
		/** Copy dictionaries for the Protocom API settings section. */
		/** English strings (the key-set source of truth for this pair). */
		const en = {
			nav: "Protocom API",
			navGo: "OpenCode Go",
			title: "Protocom API",
			titleGo: "OpenCode Go",
			intro: "Connect to the Protocom official API. Each group below is an independent provider route with its own API key.",
			introGo: "Connect to an OpenCode Go subscription. The single Go route carries every model the endpoint serves; thinking-effort, context length, and menu ordering are set per model below.",
			readOnly: "The settings document is read-only in this deployment.",
			advanced: "Advanced",
			baseUrl: "Base URL",
			allowCustom: "Allow a custom endpoint",
			allowCustomHint: "Required before a non-default Base URL takes effect: the stored API key would be sent to that host.",
			allowCustomRequired: "Tick \"Allow a custom endpoint\" first: this Base URL is not the shipped endpoint.",
			keyPool: "Key pool",
			keyPoolHint: "Extra credential references for this group, one per line. Sticky mode pins one key per conversation so its prefix cache stays warm; round-robin spreads load at the cost of that cache.",
			keyPoolPlaceholder: "PROTOCOM_AGGREGATE_API_KEY_2",
			keyPolicy: "Key selection",
			keyPolicySticky: "Sticky (keep one key per conversation)",
			keyPolicyRoundRobin: "Round-robin (rotate every request)",
			keyPoolDuplicate: "That reference is already in the pool.",
			keyPoolApply: "Save key pool",
			accountUnavailable: "Account details are not available in this deployment.",
			accountCredits: "Credits",
			accountMonthly: "Monthly remaining",
			accountFiveHour: "Five-hour window",
			accountWeekly: "Weekly window",
			accountUsedOfCap: "used of",
			accountResets: "resets",
			accountUsage: "Usage this period",
			accountRequests: "Requests",
			accountSuccessRate: "Success rate",
			accountTokens: "Tokens",
			accountCost: "Cost",
			accountCredential: "The API key was rejected; check it and save again.",
			retryMaxAttempts: "Retry attempts",
			retryMaxAttemptsHint: "How many times a dropped or failed request is retried before the step gives up. Only transient failures are retried; a bad key or a malformed request still fails at once.",
			retryMaxDelayMs: "Longest retry wait (ms)",
			retryMaxDelayMsHint: "Ceiling for one backoff wait. The delay doubles from 0.5s up to this value, so a long outage is waited out instead of ending an unattended run.",
			retryInvalidAttempts: "Enter a whole number of attempts between 0 and 100.",
			retryInvalidDelay: "Enter a wait of at least 500 ms, no more than the harness timer bound.",
			apply: "Apply",
			applying: "Applying…",
			saved: "Saved.",
			groupAggregate: "Aggregate",
			groupCodex: "Codex",
			groupStepfun: "StepFun",
			groupGrok: "Grok",
			groupGo: "Go",
			groupCc: "Command Code",
			enabled: "Enabled",
			protocol: "Protocol",
			apiKey: "API key",
			keyPlaceholder: "Enter your API key",
			keyConfigured: "API key configured",
			keyMissing: "API key missing",
			saveKey: "Save key",
			savingKey: "Saving…",
			keySaved: "API key saved.",
			keyFailed: "Saving the API key failed",
			probe: "Fetch available models",
			probeRefresh: "Refresh models",
			probing: "Asking the endpoint…",
			probeFailed: "Model discovery failed",
			probeEmpty: "The endpoint listed no models.",
			probeHint: "The raw listing. The menu never offers an id the endpoint refuses.",
			probeDetails: "Models and upstream IDs",
			probeNeedsKey: "Enable this group and save its key to list the models this group contributes to the menu.",
			listingFallback: "The endpoint did not answer with a model listing, so these rows come from the built-in catalog.",
			colModel: "Model",
			colId: "Upstream ID",
			colVariants: "Context variants",
			colServed: "Served",
			servedYes: "yes",
			servedNo: "no",
			models: "Models in the menu",
			modelsHint: "The rows below are this group's own menu entries. Tick one to list it, pick the context lengths it offers, mark whether its entries accept image input, and star the ones that should lead the menu. Each context length is its own menu entry.",
			modelCount: "models",
			menuEntries: "menu entries",
			filterModels: "Filter models",
			visionTitle: "Whether this model's menu entries accept image input",
			visionOff: "Text only",
			rowSettings: "Model settings",
			leadTitle: "Lead the menu",
			capabilityTitle: "Capabilities",
			tagLead: "lead",
			collapse: "Collapse",
			expand: "Expand",
			selectAll: "Show all",
			selectNone: "Hide all",
			starTitle: "Lead the menu with this model",
			unstarTitle: "Stop leading the menu with this model",
			contextTitle: "Context lengths this model offers",
			contextLastTitle: "A model must keep at least one context length",
			tagVision: "vision",
			tagReasoning: "thinking",
			balance: "Balance",
			refresh: "Refresh",
			refreshing: "Refreshing…",
			loading: "Loading…",
			loadFailed: "Loading failed",
			entryUnavailable: "the host is not serving this plugin's settings entry",
			balanceUnavailable: "Balance is not available in this deployment.",
			retry: "Retry",
			remaining: "Remaining",
			limit: "Limit",
			balanceAmount: "Balance",
			plan: "Plan",
			today: "Today",
			requests: "requests",
			cost: "cost",
			rateWindow: "Rate window",
			expiresAt: "Expires",
			rateMultiplier: "Billing rate",
			groupRateMultiplier: "Group rate",
			usageQuota: "Usage quota",
			quotaUnavailable: "Usage quota is not available in this deployment.",
			quotaRolling: "5-hour window",
			quotaWeekly: "Weekly",
			quotaMonthly: "Monthly",
			quotaResets: "resets",
			quotaRateLimited: "rate-limited",
			none: "—",
			navCommandCode: "Command Code",
			titleCommandCode: "Command Code",
			introCommandCode: "Connect a Command Code subscription. The single route carries every model your plan includes; the endpoint decides which wire each model is served on, so Anthropic-only models stay hidden until that wire is implemented.",
			navFusion: "Fusion dual-model",
			titleFusion: "Fusion dual-model",
			introFusion: "A strong model plans, a matched one executes: the main conversation runs on the leader seat, and every delegated subagent request is pinned to the coder seat.",
			statusTitle: "Dual-model routing",
			statusOn: "On",
			statusOff: "Off",
			configure: "Configure",
			noSeats: "No seats configured yet.",
			modalTitle: "Fusion dual-model",
			modalIntro: "Pick the two seats. The leader stays switchable from the composer; every subagent request follows the coder seat.",
			seatLeader: "Leader",
			seatCoder: "Coder",
			seatUnset: "Not set",
			seatUnavailable: "This route is no longer offered by the deployment",
			effortLabel: "Thinking effort",
			effortDefault: "Model default",
			contextLabel: "Context",
			includeForks: "Forked subagents also use the coder seat",
			applyLeader: "Also make the leader the default model",
			applyLeaderNoSession: "Open or start a conversation first: the leader seat applies to a session, and none is open.",
			applyLeaderSubagent: "The current conversation is a subagent, which keeps the coder seat. Open a main conversation to apply the leader.",
			costTitle: "Cost",
			costInput: "Input",
			costCache: "Cached",
			costOutput: "Output",
			costUnknown: "No published price",
			cancel: "Cancel",
			save: "Save and apply",
			saving: "Saving…",
			savedApplyFailed: "Saved, but applying the leader failed",
			needBothSeats: "Pick both a leader and a coder seat before enabling Fusion.",
			conflict: "This section changed elsewhere. Reopen the editor to see the current value.",
			saveFailed: "The deployment did not accept these values",
			catalogFailed: "Could not load the model list",
			catalogPartial: "Some providers did not answer; their models are missing from this list.",
			sectionUnavailable: "This deployment does not expose the Fusion section to this client."
		};
		/** Chinese strings. */
		const zh = {
			nav: "Protocom API",
			navGo: "OpenCode Go",
			title: "Protocom API",
			titleGo: "OpenCode Go",
			intro: "接入 Protocom 官方 API。下方每个分组都是一条独立的 provider route，各自配置 API key。",
			introGo: "接入 OpenCode Go 订阅。Go 这一条 route 承载端点提供的全部模型；思考强度、上下文版本和菜单排序均可在下方按模型设置。",
			readOnly: "当前部署的设置文档为只读。",
			advanced: "高级",
			baseUrl: "Base URL",
			allowCustom: "允许自定义端点",
			allowCustomHint: "非默认 Base URL 需要勾选此项才会生效：已保存的 API key 会被发往该地址。",
			allowCustomRequired: "请先勾选「允许自定义端点」：该 Base URL 不是官方端点。",
			keyPool: "密钥池",
			keyPoolHint: "该分组的额外凭据引用，每行一个。粘性模式为每个会话固定一把密钥，缓存前缀持续命中；轮询模式均衡负载，但会牺牲这份缓存。",
			keyPoolPlaceholder: "PROTOCOM_AGGREGATE_API_KEY_2",
			keyPolicy: "密钥选择方式",
			keyPolicySticky: "粘性（每个会话固定一把）",
			keyPolicyRoundRobin: "轮询（每次请求轮换）",
			keyPoolDuplicate: "该引用已经在密钥池中。",
			keyPoolApply: "保存密钥池",
			accountUnavailable: "当前部署不提供账户信息。",
			accountCredits: "额度",
			accountMonthly: "月度剩余",
			accountFiveHour: "5 小时窗口",
			accountWeekly: "每周窗口",
			accountUsedOfCap: "已用 / 上限",
			accountResets: "重置于",
			accountUsage: "本周期用量",
			accountRequests: "请求数",
			accountSuccessRate: "成功率",
			accountTokens: "Token",
			accountCost: "花费",
			accountCredential: "API 密钥被拒绝，请检查后重新保存。",
			retryMaxAttempts: "重试最大次数",
			retryMaxAttemptsHint: "请求掉线或失败后、放弃该步骤前最多重试几次。只重试瞬时故障；密钥错误或请求格式错误仍会立即失败。",
			retryMaxDelayMs: "重试最长时间（毫秒）",
			retryMaxDelayMsHint: "单次退避等待的上限。退避从 0.5 秒起逐次翻倍直到该值，因此长时间断网会一直等下去，而不是让无人值守的任务中断。",
			retryInvalidAttempts: "请输入 0 到 100 之间的整数次数。",
			retryInvalidDelay: "请输入不小于 500 毫秒、且不超过计时上限的等待时间。",
			apply: "应用",
			applying: "应用中…",
			saved: "已保存。",
			groupAggregate: "开源聚合",
			groupCodex: "Codex",
			groupStepfun: "StepFun",
			groupGrok: "Grok",
			groupGo: "Go",
			groupCc: "Command Code",
			enabled: "启用",
			protocol: "协议",
			apiKey: "API 密钥",
			keyPlaceholder: "输入你的 API 密钥",
			keyConfigured: "API 密钥已配置",
			keyMissing: "API 密钥未配置",
			saveKey: "保存密钥",
			savingKey: "保存中…",
			keySaved: "API 密钥已保存。",
			keyFailed: "保存 API 密钥失败",
			probe: "探测模型",
			probeRefresh: "刷新模型",
			probing: "正在询问端点…",
			probeFailed: "模型探测失败",
			probeEmpty: "端点未列出任何模型。",
			probeHint: "这里是对端点的原始列表演示；端点拒绝的 id 不会进入模型菜单。",
			probeDetails: "模型和上游 ID",
			probeNeedsKey: "启用该分组并保存密钥后，这里会列出它贡献给模型菜单的模型。",
			listingFallback: "端点未返回模型列表，下方来自内置名录。",
			colModel: "模型",
			colId: "上游 ID",
			colVariants: "上下文版本",
			colServed: "端点提供",
			servedYes: "是",
			servedNo: "否",
			models: "菜单中显示的模型",
			modelsHint: "下方就是该分组自己在模型菜单里的条目：勾选决定是否出现，右侧选择提供哪些上下文版本，「视觉」决定这些条目是否声明可接收图片，星标决定排序。每个上下文版本在菜单里是独立的一条。",
			modelCount: "个模型",
			menuEntries: "个菜单项",
			filterModels: "筛选模型",
			visionTitle: "该模型的菜单条目是否接收图片输入",
			visionOff: "仅文本",
			rowSettings: "模型设置",
			leadTitle: "在菜单中置顶",
			capabilityTitle: "能力",
			tagLead: "置顶",
			collapse: "收起",
			expand: "展开",
			selectAll: "全部显示",
			selectNone: "全部隐藏",
			starTitle: "让该模型排在菜单最前",
			unstarTitle: "取消置顶",
			contextTitle: "该模型提供哪些上下文版本",
			contextLastTitle: "至少要保留一个上下文版本",
			tagVision: "视觉",
			tagReasoning: "思考",
			balance: "余额",
			refresh: "刷新",
			refreshing: "刷新中…",
			loading: "加载中…",
			loadFailed: "加载失败",
			entryUnavailable: "宿主没有提供本插件的设置项",
			balanceUnavailable: "当前部署不提供余额信息。",
			retry: "重试",
			remaining: "剩余额度",
			limit: "总额度",
			balanceAmount: "余额",
			plan: "套餐",
			today: "今日用量",
			requests: "次请求",
			cost: "花费",
			rateWindow: "速率窗口",
			expiresAt: "到期时间",
			rateMultiplier: "计费倍率",
			groupRateMultiplier: "分组倍率",
			usageQuota: "用量配额",
			quotaUnavailable: "当前部署不提供用量配额信息。",
			quotaRolling: "5 小时窗口",
			quotaWeekly: "每周",
			quotaMonthly: "每月",
			quotaResets: "重置于",
			quotaRateLimited: "已限流",
			none: "—",
			navCommandCode: "Command Code",
			titleCommandCode: "Command Code",
			introCommandCode: "接入 Command Code 订阅。单条路由承载你套餐包含的全部模型；由端点自行声明每个模型走哪条通道，因此仅支持 Anthropic 通道的模型会暂时隐藏，直到该通道实现。",
			navFusion: "Fusion 双模型",
			titleFusion: "Fusion 双模型",
			introFusion: "强模型指挥，匹配模型执行——主线对话走指挥位，所有子智能体请求固定走执行位。",
			statusTitle: "双模型路由",
			statusOn: "已启用",
			statusOff: "未启用",
			configure: "配置",
			noSeats: "尚未配置席位。",
			modalTitle: "Fusion 双模型",
			modalIntro: "选择两个席位。指挥位仍可在输入框临时切换；所有子智能体请求都走执行位。",
			seatLeader: "指挥位",
			seatCoder: "执行位",
			seatUnset: "未设置",
			seatUnavailable: "当前部署不再提供该路由",
			effortLabel: "思考强度",
			effortDefault: "模型默认",
			contextLabel: "上下文",
			includeForks: "fork 子智能体也用执行位",
			applyLeader: "同时把指挥位设为默认模型",
			applyLeaderNoSession: "请先打开或新建一个会话：指挥位作用于会话，当前没有打开的会话。",
			applyLeaderSubagent: "当前会话是子智能体，它固定使用执行位。请打开一个主会话再应用指挥位。",
			costTitle: "成本",
			costInput: "输入",
			costCache: "缓存",
			costOutput: "输出",
			costUnknown: "暂无定价",
			cancel: "取消",
			save: "保存并应用",
			saving: "保存中…",
			savedApplyFailed: "已保存，但应用指挥位失败",
			needBothSeats: "启用 Fusion 前请先选择指挥位和执行位。",
			conflict: "该配置已在别处变更。请重新打开弹窗查看当前值。",
			saveFailed: "当前部署未接受这些配置",
			catalogFailed: "无法加载模型列表",
			catalogPartial: "部分 provider 未响应，其模型不在列表中。",
			sectionUnavailable: "当前部署未向此客户端开放 Fusion 配置。"
		};
		//#endregion
		//#region src/client/styles.ts
		/**
		* The section's stylesheet, injected as one `<style>` tag by the client
		* plugin (no CSS pipeline in this standalone build). All classes carry the
		* `protocom-` prefix.
		*/
		const SECTION_CSS = `
.protocom-section { display: flex; flex-direction: column; gap: 18px; max-width: 780px; }
.protocom-title { margin: 0; font-size: 18px; font-weight: 650; letter-spacing: 0.01em; }
.protocom-intro { margin: -6px 0 0; font-size: 13px; line-height: 1.55; opacity: 0.72; }
.protocom-notice { margin: 0; font-size: 12px; opacity: 0.7; }
.protocom-error { margin: 0; font-size: 12px; color: var(--dsh-danger, #d03050); }
.protocom-status { margin: 0; font-size: 12px; color: var(--dsh-success, #18a058); }
.protocom-advanced summary { cursor: pointer; font-size: 13px; opacity: 0.8; width: fit-content; }
.protocom-advanced-body { display: flex; gap: 8px; align-items: center; margin-top: 8px; }

.protocom-groups { display: flex; flex-direction: column; gap: 14px; list-style: none; margin: 0; padding: 0; }
.protocom-card {
  border: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.22));
  border-radius: 12px;
  padding: 14px 16px;
  display: flex; flex-direction: column; gap: 12px;
  background: var(--dsh-card, rgba(128, 128, 128, 0.045));
  transition: border-color 0.15s ease, opacity 0.15s ease;
}
.protocom-card:hover { border-color: var(--dsh-border-strong, rgba(128, 128, 128, 0.38)); }
.protocom-card.is-off > :not(.protocom-card-head) { opacity: 0.55; }

.protocom-card-head { display: flex; align-items: center; gap: 8px; }
.protocom-card-name { font-size: 14.5px; font-weight: 600; }
.protocom-tag { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--dsh-badge, rgba(128, 128, 128, 0.16)); opacity: 0.85; }
.protocom-head-state { margin-left: auto; display: flex; align-items: center; gap: 7px; font-size: 12px; opacity: 0.85; }
.protocom-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dsh-muted, #999); flex: none; }
.protocom-dot.is-on { background: var(--dsh-success, #18a058); }

.protocom-switch { position: relative; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-size: 12px; }
.protocom-switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.protocom-switch-track {
  width: 34px; height: 20px; border-radius: 999px; flex: none; position: relative;
  background: var(--dsh-border, rgba(128, 128, 128, 0.4));
  transition: background 0.15s ease;
}
.protocom-switch-thumb {
  position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.28);
  transition: transform 0.15s ease;
}
.protocom-switch input:checked + .protocom-switch-track { background: var(--dsh-accent, #3a7bfd); }
.protocom-switch input:checked + .protocom-switch-track .protocom-switch-thumb { transform: translateX(14px); }
.protocom-switch input:focus-visible + .protocom-switch-track { outline: 2px solid var(--dsh-accent, #3a7bfd); outline-offset: 2px; }
.protocom-switch input:disabled + .protocom-switch-track { opacity: 0.5; }

.protocom-field { display: flex; align-items: center; gap: 8px; }
.protocom-field-label { font-size: 12px; min-width: 64px; opacity: 0.7; }
.protocom-input {
  flex: 1; font-size: 13px; padding: 6px 10px; border-radius: 8px;
  border: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.35));
  background: var(--dsh-input, transparent); color: inherit;
  transition: border-color 0.15s ease;
}
.protocom-input:focus { outline: none; border-color: var(--dsh-accent, #3a7bfd); }
.protocom-key-state { font-size: 11px; opacity: 0.62; margin-top: -7px; }
/* The key pool is a list of credential references, one per line, so it needs a
   fixed-ish box rather than the single-line input the primary key uses. */
.protocom-keypool { resize: vertical; font-family: ui-monospace, monospace; font-size: 12px; line-height: 1.5; min-height: 46px; }

.protocom-button {
  font-size: 12px; padding: 5px 14px; border-radius: 8px; cursor: pointer;
  border: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.35));
  background: transparent; color: inherit;
  transition: background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
}
.protocom-button:hover:not(:disabled) { background: var(--dsh-hover, rgba(128, 128, 128, 0.12)); }
.protocom-button:disabled { opacity: 0.5; cursor: default; }
.protocom-button-primary { background: var(--dsh-accent, #3a7bfd); border-color: transparent; color: #fff; }
.protocom-button-primary:hover:not(:disabled) { background: var(--dsh-accent-hover, #2f6ae0); }

.protocom-probe-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.protocom-probe-table th, .protocom-probe-table td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.16)); }
.protocom-probe-table th { opacity: 0.62; font-weight: 500; font-size: 12px; }
.protocom-probe-table tbody tr:hover { background: var(--dsh-hover, rgba(128, 128, 128, 0.07)); }
.protocom-probe-id { font-family: ui-monospace, monospace; font-size: 11.5px; opacity: 0.62; }

.protocom-chip {
  display: inline-flex; align-items: center; margin: 2px 6px 2px 0; padding: 2px 10px;
  font-size: 11.5px; border-radius: 999px; cursor: pointer; user-select: none;
  border: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.35));
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.protocom-chip input { position: absolute; opacity: 0; width: 0; height: 0; }
.protocom-chip:hover { border-color: var(--dsh-accent, #3a7bfd); }
.protocom-chip.is-on { background: var(--dsh-accent, #3a7bfd); border-color: transparent; color: #fff; }

.protocom-card-toggle {
  display: inline-flex; align-items: center; gap: 6px; padding: 0; border: 0;
  background: transparent; color: inherit; font: inherit; cursor: pointer;
}
.protocom-card-toggle:hover .protocom-card-name { color: var(--dsh-accent, #3a7bfd); }
.protocom-caret { width: 10px; text-align: center; font-size: 10px; opacity: 0.5; }
.protocom-card-body { display: flex; flex-direction: column; gap: 12px; }
.protocom-models-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.protocom-models-title { font-size: 12.5px; font-weight: 600; }
.protocom-models-count { font-size: 11.5px; opacity: 0.6; font-variant-numeric: tabular-nums; }
.protocom-vision {
  font-size: 11px; padding: 3px 10px; min-height: 24px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.35));
  background: transparent; color: inherit; opacity: 0.55;
  transition: opacity 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.protocom-vision.is-on { opacity: 1; color: var(--dsh-accent, #3a7bfd); border-color: var(--dsh-accent, #3a7bfd); }
.protocom-vision:disabled { cursor: default; opacity: 0.4; }

/* The one bounded viewport in a card: a group may contribute hundreds of menu
   entries, and the card must not grow with them. */
.protocom-models { display: flex; flex-direction: column; gap: 1px; max-height: 340px; min-height: 44px; overflow-y: auto; }
.protocom-model-row {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 5px 8px; border-radius: 9px;
  transition: background 0.15s ease, opacity 0.15s ease;
}
.protocom-model-row:hover { background: var(--dsh-hover, rgba(128, 128, 128, 0.09)); }
.protocom-model-row.is-off { opacity: 0.42; }
.protocom-model-pick { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
.protocom-model-row input { position: absolute; opacity: 0; width: 0; height: 0; }
.protocom-model-row:focus-within { outline: 2px solid var(--dsh-accent, #3a7bfd); outline-offset: -2px; }
.protocom-model-dot {
  width: 8px; height: 8px; border-radius: 50%; flex: none;
  border: 1.5px solid var(--dsh-border, rgba(128, 128, 128, 0.5));
  transition: background 0.15s ease, border-color 0.15s ease;
}
.protocom-model-row:not(.is-off) .protocom-model-dot { background: var(--dsh-accent, #3a7bfd); border-color: var(--dsh-accent, #3a7bfd); }
.protocom-model-name { font-size: 12.5px; font-weight: 500; }
.protocom-model-row.is-off .protocom-model-name { text-decoration: line-through; }
.protocom-model-meta { font-size: 11px; opacity: 0.6; letter-spacing: 0.02em; }
.protocom-model-spacer { flex: 1 1 12px; }

/* The collapsed reading of a row: what it is set to, without opening it. */
.protocom-model-summary {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 11px; opacity: 0.62; font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.protocom-summary-ctx { letter-spacing: 0.02em; }
.protocom-summary-tag {
  border: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.3));
  border-radius: 999px; padding: 1px 7px; font-size: 10.5px;
}
.protocom-summary-tag.is-lead { color: var(--dsh-accent, #3a7bfd); border-color: var(--dsh-accent, #3a7bfd); }

/* The per-row disclosure. Sized to the 24px WCAG 2.2 target minimum. */
.protocom-model-more {
  border: 0; background: transparent; color: inherit; cursor: pointer;
  min-width: 24px; min-height: 24px; padding: 2px 6px; border-radius: 6px;
  display: inline-flex; align-items: center; justify-content: center;
  opacity: 0.45; transition: opacity 0.15s ease, background 0.15s ease;
}
.protocom-model-more:hover { opacity: 1; background: var(--dsh-hover, rgba(128, 128, 128, 0.14)); }
.protocom-model-more:focus-visible { outline: 2px solid var(--dsh-accent, #3a7bfd); outline-offset: 1px; }

/* The opened row: labelled fields on their own line, wrapping rather than
   compressing, so no control shrinks below its target size. */
.protocom-model-detail {
  flex: 1 0 100%; display: flex; flex-wrap: wrap; align-items: center;
  gap: 10px 18px; padding: 8px 2px 4px 26px;
  border-top: 1px dashed var(--dsh-border, rgba(128, 128, 128, 0.22));
  margin-top: 5px;
}
.protocom-detail-field { display: inline-flex; align-items: center; gap: 8px; }
.protocom-detail-label { font-size: 11px; opacity: 0.55; }
.protocom-model-star {
  border: 0; background: transparent; color: inherit; cursor: pointer;
  font-size: 12px; line-height: 1; padding: 3px 5px; border-radius: 50%;
  opacity: 0.3; transition: opacity 0.15s ease, color 0.15s ease;
}
.protocom-model-star:hover:not(:disabled) { opacity: 0.75; }
.protocom-model-star.is-on { opacity: 1; color: var(--dsh-accent, #3a7bfd); }
.protocom-model-star:disabled { cursor: default; }

.protocom-ctx { display: inline-flex; border: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.35)); border-radius: 999px; overflow: hidden; }
.protocom-ctx button {
  border: 0; border-right: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.22));
  background: transparent; color: inherit; cursor: pointer;
  font-size: 11px; padding: 4px 11px; font-variant-numeric: tabular-nums;
  /* WCAG 2.2 SC 2.5.8: a pointer target is at least 24x24 CSS px, or spaced so
     that 24px circles centred on adjacent targets do not intersect. */
  min-height: 24px;
  transition: background 0.15s ease, color 0.15s ease;
}
.protocom-ctx button:last-child { border-right: 0; }
.protocom-ctx button:hover:not(:disabled):not(.is-on) { background: var(--dsh-hover, rgba(128, 128, 128, 0.16)); }
.protocom-ctx button.is-on { background: var(--dsh-accent, #3a7bfd); color: #fff; }
.protocom-ctx button:disabled { cursor: default; }
.protocom-ctx button.is-on:disabled { opacity: 0.9; }

.protocom-balance { border-top: 1px dashed var(--dsh-border, rgba(128, 128, 128, 0.25)); padding-top: 10px; display: flex; flex-direction: column; gap: 8px; }
.protocom-balance-head { display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 600; }
.protocom-quota { display: flex; flex-direction: column; gap: 6px; }
.protocom-quota-hero { font-size: 18px; font-weight: 650; }
.protocom-quota-hero small { font-size: 12px; font-weight: 400; opacity: 0.6; margin-left: 6px; }
.protocom-quota-bar { height: 6px; border-radius: 999px; background: var(--dsh-track, rgba(128, 128, 128, 0.18)); overflow: hidden; }
.protocom-quota-fill { height: 100%; border-radius: 999px; background: var(--dsh-accent, #3a7bfd); transition: width 0.3s ease; }
.protocom-quota-fill.is-warn { background: var(--dsh-danger, #d03050); }
.protocom-quota-row { display: flex; align-items: center; gap: 10px; font-size: 12px; }
.protocom-quota-label { flex: 0 0 104px; opacity: 0.82; }
.protocom-quota-row .protocom-quota-bar { flex: 1; }
.protocom-quota-num { flex: 0 0 auto; min-width: 92px; text-align: right; opacity: 0.82; }
.protocom-quota-num small { opacity: 0.6; margin-left: 6px; }

.protocom-balance-grid { display: flex; flex-wrap: wrap; gap: 4px 18px; font-size: 12px; }
.protocom-balance-item { opacity: 0.82; }
.protocom-balance-item b { font-weight: 600; }

/* Fusion dual-model seat editor. The modal is a sheet anchored under the
   settings column rather than a full-viewport overlay, so the section it
   belongs to stays visible while it is open. */
.protocom-fusion-modal {
  border: 1px solid var(--dsh-border-strong, rgba(128, 128, 128, 0.38));
  border-radius: 12px;
  background: var(--dsh-card, rgba(128, 128, 128, 0.045));
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
}
.protocom-fusion-modal-body { display: flex; flex-direction: column; gap: 14px; padding: 16px 18px; }
.protocom-fusion-modal-title { margin: 0; font-size: 15px; font-weight: 650; }
.protocom-fusion-modal-intro { margin: -8px 0 0; font-size: 12.5px; line-height: 1.5; opacity: 0.72; }

.protocom-fusion-seat {
  display: flex; flex-direction: column; gap: 7px;
  border-top: 1px dashed var(--dsh-border, rgba(128, 128, 128, 0.25));
  padding-top: 12px;
}
.protocom-fusion-seat-head { display: flex; align-items: center; gap: 8px; }
.protocom-fusion-seat-label { font-size: 12.5px; font-weight: 600; }
.protocom-fusion-ctx {
  font-size: 11px; padding: 2px 9px; border-radius: 999px;
  background: var(--dsh-badge, rgba(128, 128, 128, 0.16)); opacity: 0.85;
  font-variant-numeric: tabular-nums; margin-left: auto;
}
.protocom-fusion-unavailable { font-size: 11px; color: var(--dsh-danger, #d03050); }
.protocom-fusion-effort { display: flex; align-items: center; gap: 8px; }
.protocom-fusion-effort-label { font-size: 12px; min-width: 64px; opacity: 0.7; }

.protocom-fusion-cost {
  display: flex; flex-direction: column; gap: 7px;
  border-top: 1px dashed var(--dsh-border, rgba(128, 128, 128, 0.25));
  padding-top: 12px;
}
.protocom-fusion-cost-title { font-size: 12.5px; font-weight: 600; }
.protocom-fusion-bar {
  display: flex; height: 8px; border-radius: 999px; overflow: hidden;
  background: var(--dsh-track, rgba(128, 128, 128, 0.18));
}
.protocom-fusion-bar-part { height: 100%; background: var(--dsh-accent, #3a7bfd); }
.protocom-fusion-bar-part + .protocom-fusion-bar-part { background: var(--dsh-success, #18a058); }
.protocom-fusion-cost-row { display: flex; align-items: baseline; gap: 10px; font-size: 12px; }
.protocom-fusion-cost-seat { flex: 0 0 72px; opacity: 0.72; }
.protocom-fusion-cost-prices { opacity: 0.85; font-variant-numeric: tabular-nums; }
.protocom-fusion-actions { display: flex; justify-content: flex-end; gap: 8px; }
`;
		//#endregion
		//#region src/client/index.ts
		/** The locale namespace this section owns. */
		const NS = "settings.protocom";
		/**
		* Required services. Deliberately NOT including the Fusion-only two
		* (`remote.session`, `configForms`): a missing entry here deactivates the
		* whole client plugin, which would take the working provider panels down with
		* a feature they do not depend on. Fusion declares its own dependencies in a
		* scoped `ctx.inject` below instead, so an unusual deployment loses the Fusion
		* section and nothing else — the same trade the Host half makes for
		* `connection`.
		*/
		const inject = [
			"slots",
			"locale",
			"remote",
			"remote.credentials",
			"remote.llm",
			"remote.settings"
		];
		/** Wire both provider sections into the settings page. */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}));
			const t = ctx.locale.bind(NS);
			const injectedFor = (family, titleKey, introKey) => () => ({
				operations: createProtocomOperations(ctx, family),
				t,
				family,
				copy: {
					title: t(titleKey),
					intro: t(introKey)
				}
			});
			ctx.effect(() => {
				const tag = document.createElement("style");
				tag.dataset["plugin"] = "dsh-protocom-api";
				tag.textContent = SECTION_CSS;
				document.head.appendChild(tag);
				return () => {
					tag.remove();
				};
			});
			/** Whether this deployment exposes the two services the Fusion section reads. */
			const fusionAvailable = () => ctx.get("remote") !== void 0 && ctx.remote.session !== void 0 && ctx.get("configForms") !== void 0;
			let fusionOperations;
			const fusionInjected = () => {
				fusionOperations ??= createFusionOperations(ctx, t);
				return {
					operations: fusionOperations,
					t,
					copy: {
						title: t("titleFusion"),
						intro: t("introFusion")
					}
				};
			};
			ctx.slots.inject("settings.section", () => {
				const protocom = ctx.slots.register({
					name: "settings.section",
					id: PROTOCOM.ns,
					order: 20,
					label: () => t("nav"),
					inject: injectedFor(PROTOCOM, "title", "intro")
				}, ProtocomSection);
				const go = ctx.slots.register({
					name: "settings.section",
					id: OPENCODE_GO.ns,
					order: 21,
					label: () => t("navGo"),
					inject: injectedFor(OPENCODE_GO, "titleGo", "introGo")
				}, ProtocomSection);
				const commandcode = ctx.slots.register({
					name: "settings.section",
					id: COMMANDCODE.ns,
					order: 23,
					label: () => t("navCommandCode"),
					inject: injectedFor(COMMANDCODE, "titleCommandCode", "introCommandCode")
				}, ProtocomSection);
				const fusion = fusionAvailable() ? ctx.slots.register({
					name: "settings.section",
					id: FUSION_NS,
					order: 22,
					label: () => t("navFusion"),
					inject: fusionInjected
				}, FusionSection) : () => {};
				return () => {
					protocom();
					go();
					commandcode();
					fusion();
				};
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map