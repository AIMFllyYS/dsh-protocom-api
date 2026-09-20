window.__ModuleLoader__.load({
	id: "dsh-protocom-api",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
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
		/** The conventional credential reference one group's API key is stored under. */
		function defaultKeyRef(key) {
			return `PROTOCOM_${key.toUpperCase()}_API_KEY`;
		}
		/** 1M-token context, the ceiling most current flagships publish. */
		const CONTEXT_1M = 1048576;
		/** 256K-token context. */
		const CONTEXT_256K = 262144;
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
		* The context ladder the picker offers, smallest first: 200K is the floor
		* every model clears, then the two common steps, then the 1M ceiling. A model
		* is only ever offered the steps at or below its own window, so the choice a
		* user makes is always one the model can actually honour.
		*/
		const CONTEXT_LADDER = [
			204800,
			CONTEXT_256K,
			409600,
			CONTEXT_1M
		];
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
				vision: true
			},
			{
				id: "gpt-5.6-luna",
				displayName: "GPT-5.6 Luna",
				family: "gpt",
				contextWindow: CONTEXT_1M,
				reasoning: GPT_REASONING,
				vision: true
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
		/**
		* The models the plugin recommends out of the box: the ones whose reasoning
		* content actually streams from this endpoint, in preference order. A
		* deployment overrides the list through the `recommendedModels` setting; it
		* only ever orders the menu, so a model left off it stays fully selectable.
		*/
		const DEFAULT_RECOMMENDED = REGISTRY.filter((entry) => entry.rank !== void 0).slice().sort((left, right) => left.rank - right.rank).map((entry) => entry.id);
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
		//#region src/client/variants.ts
		/**
		* Pure helpers behind the section's probe table: which context lengths one
		* discovered model may offer as checkboxes, and the toggled group list.
		*
		* @module dsh-protocom-api/client/variants
		*/
		/**
		* The lengths one model may be offered: the ladder steps its own window
		* clears, or the standard ladder for an id the registry does not size.
		*/
		function variantChoicesFor(upstreamId) {
			const entry = matchRegistry(upstreamId);
			return entry === void 0 ? CONTEXT_LADDER : contextChoicesFor(entry.contextWindow);
		}
		//#endregion
		//#region src/client/ProtocomSection.tsx
		/**
		* Protocom API settings section: one card per group (enable switch, API key,
		* read-only protocol tag, model probe with context-variant checkboxes, and
		* the balance strip), plus the advanced baseURL override. Every mutation
		* writes through the wire (settings.mutate / credentials.set); the page
		* reloads its snapshot after each landed write.
		*/
		function sectionOf(view) {
			const value = view?.value;
			return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
		}
		function groupValueOf(section, key) {
			const raw = section.groups?.[key] ?? {};
			return {
				enabled: raw.enabled ?? false,
				protocol: raw.protocol ?? GROUP_DEFAULTS[key].protocol,
				contextLengths: raw.contextLengths ?? [],
				showBalance: raw.showBalance ?? true
			};
		}
		function formatAmount(value, unit) {
			return unit === "USD" ? `$${value.toFixed(2)}` : `${value}${unit === void 0 ? "" : ` ${unit}`}`;
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
		/** One group's card. */
		function GroupCard({ groupKey, group, credential, writable, revision, baseURL, operations, t, onChanged }) {
			const ref = defaultKeyRef(groupKey);
			const [keyDraft, setKeyDraft] = (0, react.useState)("");
			const [keyBusy, setKeyBusy] = (0, react.useState)(false);
			const [keyMessage, setKeyMessage] = (0, react.useState)(void 0);
			const [cardError, setCardError] = (0, react.useState)(void 0);
			const [probe, setProbe] = (0, react.useState)({ phase: "idle" });
			const [balance, setBalance] = (0, react.useState)({
				phase: "idle",
				data: void 0,
				error: void 0
			});
			const write = async (ops) => {
				setCardError(void 0);
				const outcome = await operations.writeSettings(ops, revision);
				if (outcome.kind !== "written") {
					setCardError(outcome.message);
					await onChanged();
					return;
				}
				await onChanged();
			};
			const loadBalance = async () => {
				setBalance((previous) => ({
					...previous,
					phase: "loading",
					error: void 0
				}));
				try {
					const response = await fetch(`/api/protocom-api/balance?group=${groupKey}`);
					if (!response.ok) {
						const body = await response.json().catch(() => void 0);
						throw new Error(body?.error ?? `HTTP ${response.status}`);
					}
					const data = await response.json();
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
				operations.storeApiKey(groupKey, ref, keyDraft).then(async (failure) => {
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
			const runProbe = () => {
				if (probe.phase === "loading") return;
				setProbe({ phase: "loading" });
				operations.discoverModels({
					provider: providerOf(groupKey),
					...baseURL === void 0 ? {} : { baseURL }
				}).then((outcome) => {
					setProbe(outcome.kind === "found" ? {
						phase: "ready",
						models: outcome.models
					} : {
						phase: "error",
						message: outcome.message
					});
				});
			};
			const credentialConfigured = credential?.configured === true;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: group.enabled ? "protocom-card" : "protocom-card is-off",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "protocom-card-head",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "protocom-card-name",
								children: t(`group${groupKey.charAt(0).toUpperCase()}${groupKey.slice(1)}`)
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
												disabled: !writable,
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
					}),
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
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "protocom-field",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "protocom-button protocom-button-primary",
							disabled: probe.phase === "loading",
							onClick: runProbe,
							children: probe.phase === "loading" ? t("probing") : t("probe")
						})
					}),
					probe.phase === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "protocom-error",
						children: `${t("probeFailed")}: ${probe.message}`
					}) : null,
					probe.phase === "ready" && probe.models.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "protocom-notice",
						children: t("probeEmpty")
					}) : null,
					probe.phase === "ready" && probe.models.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", {
						className: "protocom-probe-table",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("colModel") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("colId") })] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: probe.models.map((model) => {
							const entry = catalogEntry({
								id: model.id,
								...model.name === void 0 ? {} : { displayName: model.name }
							}, GROUP_DEFAULTS[groupKey].reasoning);
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: entry.displayName }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "protocom-probe-id",
								children: model.id
							}) })] }, model.id);
						}) })]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "protocom-notice",
						children: t("probeHint")
					})] }) : null,
					balanceVisible ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BalanceView, {
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
			});
		}
		/**
		* The model-visibility card: every model the registry knows, one toggle each.
		* The catalog is the registry's, not the endpoint listing's, so this list is
		* complete even while the listing is short or unreachable; the switch only
		* removes an entry from the model menu.
		*/
		function ModelVisibilityCard({ hidden, recommended, contexts, writable, revision, operations, t, onChanged }) {
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(void 0);
			const hiddenSet = new Set(hidden);
			const identities = modelIdentities();
			const everyId = identities.flatMap((identity) => identity.ids);
			const recommendedSet = new Set(recommended);
			const write = (ops) => {
				if (busy) return;
				setBusy(true);
				setError(void 0);
				operations.writeSettings(ops, revision).then(async (outcome) => {
					if (outcome.kind !== "written") setError(outcome.message);
					await onChanged();
				}).finally(() => {
					setBusy(false);
				});
			};
			/** Hiding is a set; the empty set is the default, so it is unset rather than stored. */
			const writeHidden = (next) => {
				write(next.length === 0 ? [{
					op: "unset",
					path: ["hiddenModels"]
				}] : [{
					op: "set",
					path: ["hiddenModels"],
					value: next
				}]);
			};
			/**
			* The context lengths a model currently offers. Absent means the model is
			* offered once at its full window, which is what the row shows lit.
			*/
			const lengthsOf = (ids, fallback) => {
				for (const id of ids) {
					const stored = contexts[id];
					if (stored !== void 0 && stored.length > 0) return [...stored].sort((left, right) => left - right);
				}
				return [fallback];
			};
			/**
			* Store one model's context choice under its identity key. Choosing exactly
			* the model's own window again is the default, so it is unset instead of
			* written, keeping the stored section free of no-op entries.
			*/
			const writeContexts = (key, next, fallback) => {
				const isDefault = next.length === 1 && next[0] === fallback;
				write(isDefault ? [{
					op: "unset",
					path: ["modelContexts", key]
				}] : [{
					op: "set",
					path: ["modelContexts", key],
					value: next
				}]);
			};
			/**
			* Starring appends, so the order the stars were set is the order the menu
			* leads with; unstarring removes every alias of the model.
			*/
			const writeRecommended = (ids, starred) => {
				const rest = recommended.filter((id) => !ids.includes(id));
				const next = starred ? rest : [...rest, ids[0]];
				write(next.length === 0 ? [{
					op: "unset",
					path: ["recommendedModels"]
				}] : [{
					op: "set",
					path: ["recommendedModels"],
					value: next
				}]);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: "protocom-card",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "protocom-card-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "protocom-card-name",
							children: t("models")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "protocom-head-state",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "protocom-button",
								disabled: !writable || busy || hidden.length === 0,
								onClick: () => {
									writeHidden([]);
								},
								children: t("selectAll")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "protocom-button",
								disabled: !writable || busy || hidden.length >= everyId.length,
								onClick: () => {
									writeHidden([...everyId]);
								},
								children: t("selectNone")
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "protocom-notice",
						children: t("modelsHint")
					}),
					error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "protocom-error",
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "protocom-models",
						children: identities.map(({ displayName, ids, entry }) => {
							const shown = ids.every((id) => !hiddenSet.has(id));
							const starred = recommendedSet.has(ids[0]);
							const selected = lengthsOf(ids, entry.contextWindow);
							const meta = [...entry.vision === true ? [t("tagVision")] : [], ...entry.reasoning === void 0 ? [] : [t("tagReasoning")]].join(" · ");
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: shown ? "protocom-model-row" : "protocom-model-row is-off",
								title: ids.join("\n"),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: "protocom-model-pick",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												type: "checkbox",
												checked: shown,
												disabled: !writable || busy,
												"aria-label": displayName,
												onChange: () => {
													const rest = hidden.filter((id) => !ids.includes(id));
													writeHidden(shown ? [...rest, ...ids] : rest);
												}
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "protocom-model-dot" }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "protocom-model-name",
												children: displayName
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
										children: variantChoicesFor(entry.id).map((length) => {
											const on = selected.includes(length);
											const last = on && selected.length === 1;
											return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: on ? "is-on" : void 0,
												"aria-pressed": on,
												disabled: !writable || busy || last,
												title: last ? t("contextLastTitle") : t("contextTitle"),
												onClick: () => {
													const next = on ? selected.filter((value) => value !== length) : [...selected, length].sort((left, right) => left - right);
													writeContexts(ids[0], next, entry.contextWindow);
												},
												children: contextLabel(length)
											}, length);
										})
									}) : null,
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: starred ? "protocom-model-star is-on" : "protocom-model-star",
										disabled: !writable || busy,
										"aria-pressed": starred,
										title: starred ? t("unstarTitle") : t("starTitle"),
										onClick: () => {
											writeRecommended(ids, starred);
										},
										children: "★"
									})
								]
							}, displayName);
						})
					})
				]
			});
		}
		/**
		* Render the Protocom API section content column.
		* @param props - slot-delivered injected dependencies.
		* @returns the section, or null while the shell has not injected yet.
		*/
		function ProtocomSection(props) {
			const { operations, t } = props;
			if (operations === void 0 || t === void 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Loaded, {
				operations,
				t
			});
		}
		function Loaded({ operations, t }) {
			const [state, setState] = (0, react.useState)({
				phase: "loading",
				credentials: {}
			});
			const [baseDraft, setBaseDraft] = (0, react.useState)(void 0);
			const [baseBusy, setBaseBusy] = (0, react.useState)(false);
			const [baseNotice, setBaseNotice] = (0, react.useState)(void 0);
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
				const credentials = await operations.describeCredentials(GROUP_KEYS.map(defaultKeyRef));
				setState({
					phase: "ready",
					view,
					credentials
				});
			};
			(0, react.useEffect)(() => {
				if (state.phase === "loading") load();
			}, []);
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
			const view = state.view;
			const section = sectionOf(view);
			const revision = view?.revision;
			const writable = revision !== void 0;
			const baseURL = section.baseURL;
			const applyBaseURL = () => {
				if (baseDraft === void 0 || baseBusy) return;
				setBaseBusy(true);
				setBaseNotice(void 0);
				operations.writeSettings([{
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
						children: t("title")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "protocom-intro",
						children: t("intro")
					}),
					writable ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "protocom-notice",
						children: t("readOnly")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("ul", {
						className: "protocom-groups",
						children: [GROUP_KEYS.map((key) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GroupCard, {
							groupKey: key,
							group: groupValueOf(section, key),
							credential: state.credentials[defaultKeyRef(key)],
							writable,
							revision,
							baseURL,
							operations,
							t,
							onChanged: load
						}, key)), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelVisibilityCard, {
							hidden: section.hiddenModels ?? [],
							recommended: section.recommendedModels ?? DEFAULT_RECOMMENDED,
							contexts: section.modelContexts ?? {},
							writable,
							revision,
							operations,
							t,
							onChanged: load
						})]
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
		/** The settings namespace the Host half owns. */
		const SETTINGS_NS = "protocom-api";
		/**
		* Bind the section's Host operations to the plugin's own Remote namespaces.
		* @param ctx - the plugin's context, which declares `remote.credentials`,
		* `remote.llm`, and `remote.settings` in its own `inject`.
		*/
		function createProtocomOperations(ctx) {
			return {
				describeSettings: async () => {
					const response = await ctx.remote.settings.describe();
					if (!response.ok) return void 0;
					return response.value.namespaces.find((ns) => ns.ns === SETTINGS_NS);
				},
				describeCredentials: async (refs) => {
					const response = await ctx.remote.credentials.describe([...refs]);
					return response.ok ? response.value : {};
				},
				storeApiKey: async (group, ref, value) => {
					const stored = await ctx.remote.credentials.set(ref, value);
					if (!stored.ok) return stored.error.message;
					const pointed = await ctx.remote.settings.mutate(SETTINGS_NS, [{
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
					}], void 0);
					return pointed.ok ? void 0 : pointed.error.message;
				},
				writeSettings: async (ops, expectedRevision) => {
					const response = await ctx.remote.settings.mutate(SETTINGS_NS, ops, expectedRevision);
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
					const response = await ctx.remote.llm.discoverModels(SETTINGS_NS, request);
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
			title: "Protocom API",
			intro: "Connect to the Protocom official API. Each group below is an independent provider route with its own API key.",
			readOnly: "The settings document is read-only in this deployment.",
			advanced: "Advanced",
			baseUrl: "Base URL",
			apply: "Apply",
			applying: "Applying…",
			saved: "Saved.",
			groupAggregate: "Aggregate",
			groupCodex: "Codex",
			groupStepfun: "StepFun",
			groupGrok: "Grok",
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
			probing: "Asking the endpoint…",
			probeFailed: "Model discovery failed",
			probeEmpty: "The endpoint listed no models.",
			probeHint: "Fetched models are projected through the built-in registry; unknown ids show as-is.",
			colModel: "Model",
			colId: "Upstream ID",
			colVariants: "Context variants",
			models: "Models in the menu",
			modelsHint: "Every known model is offered by default. Tick a model to list it in the model menu, choose the context lengths it should offer, and star the ones that should lead the menu. Each context length is its own menu entry, so the list length is the context list.",
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
			none: "—"
		};
		/** Chinese strings. */
		const zh = {
			nav: "Protocom API",
			title: "Protocom API",
			intro: "接入 Protocom 官方 API。下方每个分组都是一条独立的 provider route，各自配置 API key。",
			readOnly: "当前部署的设置文档为只读。",
			advanced: "高级",
			baseUrl: "Base URL",
			apply: "应用",
			applying: "应用中…",
			saved: "已保存。",
			groupAggregate: "开源聚合",
			groupCodex: "Codex",
			groupStepfun: "StepFun",
			groupGrok: "Grok",
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
			probing: "正在询问端点…",
			probeFailed: "模型探测失败",
			probeEmpty: "端点未列出任何模型。",
			probeHint: "探测结果经内置名录投影；未收录的 id 原样展示。",
			colModel: "模型",
			colId: "上游 ID",
			colVariants: "上下文变体",
			models: "菜单中显示的模型",
			modelsHint: "默认展示全部已知模型。勾选决定是否出现在模型菜单，右侧选择它要提供哪些上下文版本，星标决定谁排在菜单最前。每个上下文版本在菜单里是独立的一条，勾几个就有几条。",
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

.protocom-models { display: flex; flex-direction: column; gap: 1px; max-height: 340px; overflow-y: auto; }
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
		/** Wire the section into the settings page. */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}));
			const operations = createProtocomOperations(ctx);
			const t = ctx.locale.bind(NS);
			const injected = () => ({
				operations,
				t
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
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "protocom-api",
				order: 20,
				label: () => t("nav"),
				inject: injected
			}, ProtocomSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map