# ClinePass provider research — COMPLETE
Full notes: `.agents/cline/FINDINGS.md` (raw sources in `.agents/cline/`; cline/cline shallow-cloned at `.agents/cline/cline-src`).
Repo pinned at commit 3ab7b564c11b090aed56dedd556b4c4ea0583b23. Live probes run 2026-09-28.

**Headline: ClinePass is NOT a new gateway.** It is the SAME host and path as Cline's other providers, same OpenAI Chat Completions wire format, same bearer auth. The only differences are the `cline-pass/` model-id namespace and a subscription-scoped quota. A 4th ProviderFamily here is mostly a model-catalog + capability-table job, not a new transport.

---
## 1. Base URL — CONFIDENCE HIGH

    POST https://api.cline.bot/api/v1/chat/completions

Same host, same path as Cline's other providers. Not a separate gateway.
- `sdk/packages/llms/src/providers/builtins.ts:682-684` — `createClineLikeSpec` (shared by cline AND cline-pass): getter `baseUrl` returns `${getClineEnvironmentConfig().apiBaseUrl}/api/v1`
- `sdk/packages/llms/src/providers/vendors/cline.ts:238` — `baseURL: config.baseUrl ?? "https://api.cline.bot/api/v1"`
- `sdk/packages/llms/src/providers/providers.generated.ts:532-534` — `defaults.baseUrl: "https://api.cline.bot/api/v1"`
- `sdk/packages/shared/src/runtime/cline-environment.ts:20` — production `apiBaseUrl: "https://api.cline.bot"`
- Docs: https://docs.cline.bot/api/chat-completions
- Env override `CLINE_API_BASE_URL` (cline-environment.ts:90-96)

## 2. Authentication — CONFIDENCE HIGH

Both paths use `Authorization: Bearer <token>`. **No session cookie.**

**(a) Static API key — use this.** Created at app.cline.bot > Settings > API Keys. `apiKeyEnv: ["CLINE_API_KEY"]` (`builtins.ts:680`, `providers.generated.ts:530`). The ClinePass doc itself shows `Authorization: Bearer $CLINE_API_KEY` against `/api/v1/chat/completions`.

**(b) WorkOS OAuth (what the IDE does)** — `cline-pass` reuses the `cline` credential slot: `provider-auth-registry.ts:243-248` -> `createClineAuthHandler({providerId:"cline-pass", storageProviderId:"cline"})`. Device-code flow via `https://api.workos.com/user_management/authorize/device` (client id `client_01K3A541FN8TA3EPPHTD2325AR`, cline-environment.ts:22), exchanged at `POST {base}/api/v1/auth/register` (`auth/cline.ts:421-459`).
**Refresh: `POST {base}/api/v1/auth/refresh` body `{refreshToken, grantType:"refresh_token"}` (`auth/cline.ts:715-739`).** Lifetime is server-controlled via `expiresAt` (no fixed TTL in source); the client refreshes when within **5 minutes** of expiry (`DEFAULT_REFRESH_BUFFER_MS = 5*60*1000`, `auth/cline.ts:43`, used at :786). Access token is stored namespaced with a literal `workos:` prefix — do not rely on that for a plugin.

## 3. Wire protocol — CONFIDENCE HIGH (chat-completions), MEDIUM (reasoning shape)

**OpenAI Chat Completions only.** Family `openai-compatible` (`providers.generated.ts:526`); dispatch `case "cline"` -> `createClineProviderModule` (`ai-sdk.ts:2007-2011`) -> `createOpenAICompatible({baseURL})` (`vendors/cline.ts:191-202`).

Real recorded traffic to api.cline.bot — `sdk/packages/llms/src/tests/provider-vcr/cline-anthropic-sonnet.json`:

    POST /api/v1/chat/completions
    {"cache_control":{"type":"ephemeral"},"max_tokens":38400,"messages":[...],"stream":true,"stream_options":{"include_usage":true}}

SSE `data:` chunks, `chat.completion.chunk`, `delta.content`. Docs also give `delta.reasoning` (streaming reasoning text) and `delta.reasoning_details` (encrypted blocks, round-trippable).

**REASONING REQUEST SHAPE — SOURCES CONFLICT; make it configurable.**
- opencodex, live-observed 2026-08-02: sends `reasoning: {enabled:true, effort:"<effort>"}` (disable = `{enabled:false}`) and explicitly NOT `reasoning_effort` (`opencodex.patch:477-493`).
- prism: says the wire field IS `reasoning_effort` with a per-model thinkingLevelMap (`docs/providers/clinepass.md:37-51`).
- Cline's own SDK declares **no** `routing.reasoning` format for cline/cline-pass (`builtins.ts:688` uses `ANTHROPIC_AND_QWEN_CACHE_ROUTING_METADATA` = prompt-cache routes only, `anthropic-compatible.ts:85-88`); it passes the AI SDK portable `reasoning:<effort>` setting (`ai-sdk.ts:334-341`).
- Effort normalization (`routing/portable-reasoning.ts:38-53`): `max`->`xhigh`; `enabled:true` alone->`medium`; `enabled:false`->`none`; `budgetTokens` dropped.
-> Recommendation: try `reasoning:{enabled,effort}` first (most recent live evidence), fall back to `reasoning_effort`.

**max_tokens:** Cline renames to `max_completion_tokens` ONLY for o1/o3/o4/gpt-5 id patterns (`vendors/openai-compatible.ts:150-167`, `model-facts.ts:271-287`). `cline-pass/*` does not match -> **Cline sends `max_tokens`**. prism claims `max_completion_tokens`. Go with `max_tokens`.

**Response envelope:** metadata `responseEnvelope:"success-data"` (`builtins.ts:690`), but Cline's own unwrap only fires for `/images` (`openai-compatible.ts:180-216`). opencodex saw non-stream chat completions wrapped in `{success,error,data}` live on 2026-08-02 (`opencodex.patch:398-407`); docs show a plain object. -> **Stream. If non-streaming, unwrap `data` when `choices` is absent.**

**Error shape:** live 401 = `{"error":"Unauthorized: ..."}`. Substring signals in `providers/errors.ts`: not-subscribed, org-account-rejected, and `"you have reached your ... clinepass limit ... please try again later."` (quota).

**`/v1/responses` and `/v1/messages`: NOT documented, NOT used by Cline. Probing returns 401, but auth runs before routing so this is inconclusive. DO NOT assume they exist.**

## 4. Model listing — CONFIDENCE HIGH

- `GET https://api.cline.bot/api/v1/models` — public, keyless, BUT returns only `{id, object, created, owned_by}`, 458 rows, and contains **ZERO `cline-pass/*` entries**. Unusable for ClinePass.
- **`GET https://api.cline.bot/api/v1/ai/cline/recommended-models` — the real list.** Public, keyless. Source `sdk/packages/llms/src/catalog/catalog-cline-recommended.ts:162`. Returns `{recommended, clinePass, free, clineCloud}`, each entry `{id,name,description,tags}`. **14 clinePass entries on 2026-09-28.** No ctx/caps/pricing.
- Capability metadata lives in the bundled `sdk/packages/llms/src/catalog/catalog.generated.ts` (cline-pass block, lines **25779-26264**); live entries are back-filled from the OpenRouter catalog by bare slug (`catalog-cline-recommended.ts:45-56, 84-95`; fallback ctx 128000 / maxTokens 8192).

## 5. Per-model facts — CONFIDENCE HIGH (verbatim from catalog.generated.ts:25779-26264)

All catalog `pricing` values are 0 (subscription). Reference USD/1M only in the docs table.

| model id (`cline-pass/` + ...) | ctx | max output | image in | reasoningOptions |
|---|---|---|---|---|
| mimo-v2.6-flash | 1,048,576 | 131,072 | yes (+video/audio) | toggle |
| mimo-v2.6-pro | 1,048,576 | 131,072 | yes (+video/audio) | toggle |
| glm-5.3 | 1,310,720 | 131,072 | no | effort low/high/max |
| glm-5.3-flash | 1,310,720 | 943,718 | yes (+video) | effort low/high/max |
| kimi-k3 | 1,048,576 | 943,718 | yes (+video) | toggle + effort low/high/max |
| deepseek-v4-pro | 1,048,576 | 384,000 | no | toggle + effort high/xhigh |
| deepseek-v4.1-flash | 1,048,576 | 131,072 | yes | toggle + effort low/high/max |
| mimo-v2.5 | 1,050,000 | 131,072 | yes (+video/audio) | toggle |
| mimo-v2.5-pro | 1,050,000 | 131,072 | no | toggle |
| minimax-m3 | 1,048,576 | 512,000 | yes (+video) | toggle |
| muse-spark-1.3-contributor | 1,048,576 | 943,718 | yes (+video/pdf/audio) | effort minimal/low/medium/high/xhigh/max |
| qwen3.8-max | 128,000 | 8,192 | no | (none declared) |
| qwen3.7-max | 1,000,000 | 131,072 | no | toggle |
| qwen3.7-plus | 1,000,000 | 131,072 | yes | toggle |

Notes: docs list 12, live+catalog have 14 (adds mimo-v2.6-flash/pro). `qwen3.8-max` has no reasoningOptions and its `name` is the raw id everywhere. Deprecated: GLM-5.2, Kimi K2.6, Kimi K2.7 Code, DeepSeek V4 Flash. SDK default = `cline-pass/mimo-v2.6-flash` (providers.generated.ts:529). Extra headers Cline sends for cline/cline-pass (`providers/request-headers.ts:35-91`): `HTTP-Referer`, `X-Title`, `X-IS-MULTIROOT`, `X-CLIENT-TYPE`, `X-CLIENT-VERSION`, `X-PLATFORM`, `X-PLATFORM-VERSION`, `X-CORE-VERSION`, `X-Task-ID`, `User-Agent: Cline/<ver>` — docs mark only the first two optional.

## 6. Multiple keys / accounts — CONFIDENCE HIGH (mostly), UNDETERMINED (cap)

- **One subscription per personal account.** "ClinePass always uses the user's personal Cline account balance" (`apps/vscode/src/core/controller/models/handleClinePassProviderSelection.ts:5-31`, calls `switchAccount(undefined)`).
- **Org accounts are rejected**: `errors.ts:7-8` and `:60-62` — `"organization accounts cannot use individual model inference subscriptions"`.
- **Multiple API keys: YES.** `GET/POST/DELETE /api/v1/api-keys` — "List your API keys", "Create a new API key" (https://docs.cline.bot/enterprise-solutions/api-reference). Docs advise separate dev/prod keys plus rotation.
- **No documented limit on concurrent keys** — not in the docs, not in the repo. Explicitly undetermined; do not invent one.
- **Quota is account-scoped**, shared across all keys over rolling 5-hour / weekly / monthly windows (https://docs.cline.bot/getting-started/clinepass). One ClinePass credential per install (shares the `cline` storage slot).

---
### Implementation guidance
Treat ClinePass as a 4th ProviderFamily with base `https://api.cline.bot/api/v1`, bearer key, OpenAI chat-completions, streaming. Do NOT reuse Protocom's `/v1/responses` path. Populate the model table from Q5 statically; optionally refresh the id list from `/api/v1/ai/cline/recommended-models` (keyless). Add a knob for the reasoning request shape, since the two third-party implementations disagree.

### Genuinely unresolved
1. Exact reasoning request field (`reasoning:{enabled,effort}` vs `reasoning_effort`) — sources conflict; both may work.
2. Whether non-streaming Chat Completions really returns a `{success,data}` envelope (opencodex says yes live; docs and Cline's own unwrap path say no).
3. Any numeric cap on concurrent API keys.
4. Existence of `/v1/responses` or `/v1/messages` on this host — unprovable without a valid key.