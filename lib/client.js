window.__ModuleLoader__.load({
	id: "dsh-protocom-api",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
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
		/** Short capacity label: 128K, 256K, 512K, 1M. */
		function contextLabel(tokens) {
			if (tokens >= 1e6 && tokens % 1e6 === 0) return `${tokens / 1e6}M`;
			return tokens >= 1048576 && tokens % 1048576 === 0 ? `${tokens / 1048576}M` : `${Math.round(tokens / 1024)}K`;
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
		//#endregion
		//#region src/context-variants.ts
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
				contextLengths: raw.contextLengths ?? [...defaults?.contextLengths ?? []],
				showBalance: raw.showBalance ?? true
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
			const key = identityKey(model.upstreamId, family.registry);
			const hiddenSet = new Set(hidden);
			const shown = model.ids.every((id) => !hiddenSet.has(id));
			const starred = recommended.includes(key);
			const fallback = variantLengths(model.contextOptions, group.contextLengths) ?? [model.contextWindow];
			const selected = (contexts[key] ?? fallback).filter((length) => length <= model.contextWindow);
			const chosen = selected.length > 0 ? selected : fallback;
			const ladder = model.contextOptions ?? CONTEXT_LADDER;
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
				onWrite(next.length === fallback.length && next.every((length, index) => length === fallback[index]) ? [{
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
					meta.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "protocom-model-meta",
						children: meta
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "protocom-model-spacer" }),
					shown ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "protocom-ctx",
						role: "group",
						"aria-label": t("contextTitle"),
						children: ladder.map((length) => {
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
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: images ? "protocom-vision is-on" : "protocom-vision",
						disabled: !writable || busy,
						"aria-pressed": images,
						title: t("visionTitle"),
						onClick: toggleVision,
						children: images ? t("tagVision") : t("visionOff")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: starred ? "protocom-model-star is-on" : "protocom-model-star",
						disabled: !writable || busy,
						"aria-pressed": starred,
						title: starred ? t("unstarTitle") : t("starTitle"),
						onClick: toggleStar,
						children: "★"
					})
				]
			});
		}
		/** One group's card: credentials, its own menu models, and its balance. */
		function GroupCard({ groupKey, group, family, credential, writable, revision, probe, hidden, recommended, contexts, vision, operations, t, onChanged, onProbe }) {
			const ref = family.keyRef(groupKey);
			const [keyDraft, setKeyDraft] = (0, react.useState)("");
			const [keyBusy, setKeyBusy] = (0, react.useState)(false);
			const [keyMessage, setKeyMessage] = (0, react.useState)(void 0);
			const [cardError, setCardError] = (0, react.useState)(void 0);
			const [busy, setBusy] = (0, react.useState)(false);
			const [open, setOpen] = (0, react.useState)(true);
			const [filter, setFilter] = (0, react.useState)("");
			const [balance, setBalance] = (0, react.useState)({
				phase: "idle",
				data: void 0,
				error: void 0
			});
			const write = (ops) => {
				setCardError(void 0);
				setBusy(true);
				operations.writeSettings(ops, revision).then(async (outcome) => {
					if (outcome.kind !== "written") setCardError(outcome.message);
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
					const unavailable = family.telemetryKind === "quota" ? t("quotaUnavailable") : t("balanceUnavailable");
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
					const data = family.telemetryKind === "quota" ? parseGoUsage(raw) : parseBalanceView(raw);
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
			const [probes, setProbes] = (0, react.useState)({});
			const load = async () => {
				const view = await operations.describeSettings();
				if (view === void 0) {
					setState({
						phase: "error",
						credentials: {},
						error: "settings namespace unavailable"
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
			const applyBaseURL = () => {
				if (baseDraft === void 0 || baseBusy) return;
				let origin;
				try {
					origin = new URL(baseDraft).origin;
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
				setBaseBusy(true);
				setBaseNotice(void 0);
				operations.writeSettings(needsCustom ? [{
					op: "set",
					path: ["allowCustomBaseURL"],
					value: true
				}, {
					op: "set",
					path: ["baseURL"],
					value: baseDraft
				}] : [{
					op: "unset",
					path: ["allowCustomBaseURL"]
				}, {
					op: "set",
					path: ["baseURL"],
					value: baseDraft
				}], revision).then(async (outcome) => {
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
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region src/client/operations.ts
		/** The settings namespace the Protocom family owns (`'opencode-go'` is the Go family's). */
		const SETTINGS_NS = "protocom-api";
		/**
		* Bind one section's Host operations to the plugin's own Remote namespaces.
		* @param ctx - the plugin's context, which declares `remote.credentials`,
		* `remote.llm`, and `remote.settings` in its own `inject`.
		* @param settingsNs - the family's settings namespace: every read, write, and
		* discovery request is scoped to it, so the two families' sections never
		* share state.
		*/
		function createProtocomOperations(ctx, settingsNs = SETTINGS_NS) {
			return {
				describeSettings: async () => {
					const response = await ctx.remote.settings.describe();
					if (!response.ok) return void 0;
					return response.value.namespaces.find((ns) => ns.ns === settingsNs);
				},
				describeCredentials: async (refs) => {
					const response = await ctx.remote.credentials.describe([...refs]);
					return response.ok ? response.value : {};
				},
				storeApiKey: async (group, ref, value, expectedRevision) => {
					const stored = await ctx.remote.credentials.set(ref, value);
					if (!stored.ok) return stored.error.message;
					const pointed = await ctx.remote.settings.mutate(settingsNs, [{
						op: "set",
						path: [
							"groups",
							group,
							"apiKey"
						],
						value: ref
					}, {
						op: "set",
						path: [
							"groups",
							group,
							"enabled"
						],
						value: true
					}], expectedRevision);
					return pointed.ok ? void 0 : pointed.error.message;
				},
				writeSettings: async (ops, expectedRevision) => {
					const response = await ctx.remote.settings.mutate(settingsNs, ops, expectedRevision);
					if (response.ok) return {
						kind: "written",
						view: response.value
					};
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
					const response = await ctx.remote.llm.discoverModels(settingsNs, request);
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
			apply: "Apply",
			applying: "Applying…",
			saved: "Saved.",
			groupAggregate: "Aggregate",
			groupCodex: "Codex",
			groupStepfun: "StepFun",
			groupGrok: "Grok",
			groupGo: "Go",
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
			none: "—"
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
			apply: "应用",
			applying: "应用中…",
			saved: "已保存。",
			groupAggregate: "开源聚合",
			groupCodex: "Codex",
			groupStepfun: "StepFun",
			groupGrok: "Grok",
			groupGo: "Go",
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
			none: "—"
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
  font-size: 11px; padding: 2px 9px; border-radius: 999px; cursor: pointer;
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
  font-size: 11px; padding: 3px 10px; font-variant-numeric: tabular-nums;
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
`;
		//#endregion
		//#region src/client/index.ts
		/** The locale namespace this section owns. */
		const NS = "settings.protocom";
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
				operations: createProtocomOperations(ctx, family.ns),
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
				return () => {
					protocom();
					go();
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