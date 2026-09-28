# ClinePass provider research — findings

Researched 2026-09-28/29. Repo: cline/cline @ `3ab7b564c11b090aed56dedd556b4c4ea0583b23` (shallow clone at `.agents/cline/cline-src`).
Live probes run against api.cline.bot on 2026-09-28.

## Q1 — Base URL  (CONFIDENCE: HIGH)

```
POST https://api.cline.bot/api/v1/chat/completions
```

Same host AND same path as Cline's other providers. Not a separate gateway.

- `sdk/packages/llms/src/providers/builtins.ts:682-684` — `createClineLikeSpec` (shared by cline + cline-pass):
  `get baseUrl() { return \`${getClineEnvironmentConfig().apiBaseUrl}/api/v1\`; }`
- `sdk/packages/llms/src/providers/vendors/cline.ts:238` — `baseURL: config.baseUrl ?? "https://api.cline.bot/api/v1"`
- `sdk/packages/llms/src/providers/providers.generated.ts:532-534` — `defaults.baseUrl: "https://api.cline.bot/api/v1"`
- `sdk/packages/shared/src/runtime/cline-environment.ts:20` — production `apiBaseUrl: "https://api.cline.bot"`
- Docs: https://docs.cline.bot/api/chat-completions ("POST https://api.cline.bot/api/v1/chat/completions")
- Env override: `CLINE_API_BASE_URL` (cline-environment.ts:90-96)

## Q2 — Authentication  (CONFIDENCE: HIGH for API key; HIGH for OAuth shape)

Both methods use the SAME header: `Authorization: Bearer <token>`.

**A. Static API key (the path a plugin should use)** — key created at app.cline.bot > Settings > API Keys.
- Docs: https://docs.cline.bot/api/authentication
- `builtins.ts:680` — `apiKeyEnv: ["CLINE_API_KEY"]`; `providers.generated.ts:530` same.
- Docs ClinePass page explicitly shows: `curl .../chat/completions -H "Authorization: Bearer $CLINE_API_KEY"`.

**B. WorkOS OAuth account token (what the IDE/CLI do)**
- `cline-pass` reuses the `cline` credential slot: `sdk/packages/core/src/auth/provider-auth-registry.ts:243-248`
  `createClineAuthHandler({ providerId: "cline-pass", storageProviderId: "cline" })`
- Login = WorkOS **device-code** flow → `https://api.workos.com/user_management/authorize/device`,
  poll `/user_management/authenticate` (`auth/cline.ts:32-37`), WorkOS client id
  `client_01K3A541FN8TA3EPPHTD2325AR` (`cline-environment.ts:22`).
- Exchange: `POST {apiBase}/api/v1/auth/register` with `{accessToken, refreshToken}` → `auth/cline.ts:421-459`
- Cline auth endpoints (`auth/cline.ts:25-30`): authorize/token/register/refresh under `/api/v1/auth/`.
- **Refresh**: `POST {apiBase}/api/v1/auth/refresh`, body `{refreshToken, grantType:"refresh_token"}` (`auth/cline.ts:715-739`).
  Response `{success, data:{accessToken, refreshToken, tokenType, expiresAt, userInfo}}`.
- **Lifetime**: server-controlled via `expiresAt`; client refreshes when within **5 minutes** of expiry
  (`DEFAULT_REFRESH_BUFFER_MS = 5 * 60 * 1000`, `auth/cline.ts:43`, used at :786).
  No fixed TTL is documented in source.
- Access token is stored namespaced with a literal `workos:` prefix (`provider-auth-registry.ts:17,55-60`);
  account-service tests send `Authorization: Bearer workos:token-123`. Do not rely on this for a plugin.
- Session cookie: NO. No cookie auth found.

## Q3 — Wire protocol  (CONFIDENCE: HIGH for chat-completions; MEDIUM for reasoning shape)

**OpenAI Chat Completions only.** Provider family is `openai-compatible` (`providers.generated.ts:526`);
vendor dispatch `case "cline"` → `createClineProviderModule` (`ai-sdk.ts:2007-2011`) which builds
`createOpenAICompatible({baseURL})` (`vendors/cline.ts:191-202`).

Recorded real traffic to api.cline.bot:
`sdk/packages/llms/src/tests/provider-vcr/cline-anthropic-sonnet.json`
```
POST /api/v1/chat/completions
{"cache_control":{"type":"ephemeral"},"max_tokens":38400,"messages":[...],
 "model":"anthropic/claude-sonnet-4.6","stream":true,"stream_options":{"include_usage":true}}
```
Response = SSE `data:` chunks in `chat.completion.chunk` shape with `delta.content`.

### Reasoning
Response side (docs https://docs.cline.bot/api/chat-completions, "Reasoning Models"):
- `choices[0].delta.reasoning` — reasoning text during streaming
- `delta.reasoning_details` — encrypted reasoning blocks, can be passed back
- usage: `prompt_tokens_details.cached_tokens`, `cached_tokens`

Request side — **CONFLICTING EVIDENCE, both from live observation**:
1. **opencodex** (live-observed 2026-08-02) sends a gateway object:
   `reasoning: {enabled: true, effort: "<effort>"}`, and `reasoning: {enabled: false}` to disable.
   Explicitly NOT `reasoning_effort`. `opencodex.patch:477-493`, preset `reasoningWireFormat:"gateway-object"`.
2. **prism** says the wire field is `reasoning_effort` with a per-model `thinkingLevelMap`
   (`docs/providers/clinepass.md:37-51`).
3. **Cline's own SDK** declares no `routing.reasoning` format for cline/cline-pass
   (`builtins.ts:688` uses `ANTHROPIC_AND_QWEN_CACHE_ROUTING_METADATA`, which has prompt-cache routes only —
   `anthropic-compatible.ts:85-88`). It passes the AI SDK portable `reasoning: <effort>` call setting
   (`ai-sdk.ts:334-341`), which `@ai-sdk/openai-compatible` serializes.

Portable effort normalization (`sdk/packages/llms/src/providers/routing/portable-reasoning.ts:38-53`):
`max`→`xhigh`, `enabled:true` alone→`medium`, `enabled:false`→`none`, `budgetTokens`→dropped.

Per-model `reasoningOptions` from the catalog are the source for what vocabulary each model advertises (see Q5).
=> Recommend: make the request-side reasoning shape configurable; try `reasoning:{enabled,effort}` first
(opencodex has the most recent live evidence), fall back to `reasoning_effort`.

### max_tokens vs max_completion_tokens
Cline's own transform renames `max_tokens`→`max_completion_tokens` ONLY for o1/o3/o4/gpt-5 id patterns
(`vendors/openai-compatible.ts:150-167`, `model-facts.ts:271-287`). `cline-pass/*` ids do NOT match,
so Cline sends **`max_tokens`**. prism claims `max_completion_tokens`. Prefer `max_tokens` (repo evidence + VCR fixture).

### Response envelope
- cline family metadata has `responseEnvelope: "success-data"` (`builtins.ts:690`).
- Cline's own unwrap fires only for `/images` requests (`openai-compatible.ts:180-216`).
- opencodex observed non-stream chat completions wrapped in `{success, error, data}` live on 2026-08-02
  (`opencodex.patch:398-407`); public docs show a plain OpenAI object for `stream:false`.
- **Recommendation: stream. If non-streaming, defensively unwrap `data` when `choices` is absent.**

### Error shape
Live 401 (bogus key, 2026-09-28): `{"error":"Unauthorized: Please make sure you're using the latest version of Cline and re-authenticate your Cline account."}`
Message-substring signals (`sdk/packages/llms/src/providers/errors.ts`):
- `"the user is not subscribed to required model plan"` / `"no access to clinepass subscription models yet"` → not subscribed
- `"organization accounts cannot use individual model inference subscriptions"` → org account
- `"you have reached your ... clinepass limit ... please try again later."` → quota exhausted

### /v1/responses and /v1/messages
NOT documented, NOT used by Cline. Probing returns 401 but auth runs before routing so this is inconclusive.
**Do not assume they exist.**

## Q4 — Model listing  (CONFIDENCE: HIGH)

**(a) `GET https://api.cline.bot/api/v1/models` — public, no auth. NOT usable for ClinePass.**
Returns `{object:"list", data:[{id, object:"model", created, owned_by}]}` — 458 rows on 2026-09-28.
Only 4 fields per row, NO `cline-pass/*` entries at all, no context window / capabilities / pricing.

**(b) `GET https://api.cline.bot/api/v1/ai/cline/recommended-models` — the real ClinePass list.**
Public, keyless. Source: `sdk/packages/llms/src/catalog/catalog-cline-recommended.ts:162`.
Returns `{recommended, clinePass, free, clineCloud}`; each entry is `{id, name, description, tags}`.
The `clinePass` array is authoritative for *which* models exist. 14 entries on 2026-09-28.
It does NOT carry context window / maxTokens / capabilities / pricing.

**(c) Capability metadata** comes from the bundled catalog
`sdk/packages/llms/src/catalog/catalog.generated.ts` (`cline-pass` block at lines 25779-26264),
and for live entries is back-filled by looking up the OpenRouter catalog by bare slug
(`catalog-cline-recommended.ts:45-56, 84-95`; default fallback `contextWindow:128000, maxTokens:8192`).

## Q5 — Per-model facts  (CONFIDENCE: HIGH — quoted from catalog.generated.ts:25779-26264)

All catalog `pricing` values are ZERO (subscription). Reference USD/1M prices are only in the docs table.

| API model id | ctx window | max output | image in | reasoningOptions |
|---|---|---|---|---|
| cline-pass/mimo-v2.6-flash | 1,048,576 | 131,072 | yes (+video/audio) | toggle |
| cline-pass/mimo-v2.6-pro | 1,048,576 | 131,072 | yes (+video/audio) | toggle |
| cline-pass/glm-5.3 | 1,310,720 | 131,072 | no | effort: low/high/max |
| cline-pass/glm-5.3-flash | 1,310,720 | 943,718 | yes (+video) | effort: low/high/max |
| cline-pass/kimi-k3 | 1,048,576 | 943,718 | yes (+video) | toggle + effort low/high/max |
| cline-pass/deepseek-v4-pro | 1,048,576 | 384,000 | no | toggle + effort high/xhigh |
| cline-pass/deepseek-v4.1-flash | 1,048,576 | 131,072 | yes | toggle + effort low/high/max |
| cline-pass/mimo-v2.5 | 1,050,000 | 131,072 | yes (+video/audio) | toggle |
| cline-pass/mimo-v2.5-pro | 1,050,000 | 131,072 | no | toggle |
| cline-pass/minimax-m3 | 1,048,576 | 512,000 | yes (+video) | toggle |
| cline-pass/muse-spark-1.3-contributor | 1,048,576 | 943,718 | yes (+video/pdf/audio) | effort: minimal/low/medium/high/xhigh/max |
| cline-pass/qwen3.8-max | 128,000 | 8,192 | no | (none declared) |
| cline-pass/qwen3.7-max | 1,000,000 | 131,072 | no | toggle |
| cline-pass/qwen3.7-plus | 1,000,000 | 131,072 | yes | toggle |

Notes:
- Docs list 12 models; live endpoint + catalog have 14 (adds `mimo-v2.6-flash`, `mimo-v2.6-pro`).
- `qwen3.8-max` has no `reasoningOptions` and its `name` is the raw id in BOTH catalog and live endpoint.
- Reference pricing (docs): GLM-5.3 1.40/4.40, GLM-5.3 Flash 0.15/0.50, Kimi K3 3.00/15.00,
  DeepSeek V4 Pro peak 1.32/3.96 off-peak 0.66/1.98, DeepSeek V4.1 Flash 0.30/1.20,
  MiMo-V2.5 0.14/0.28, MiMo-V2.5-Pro 1.74/3.48, MiniMax M3 0.30/1.20,
  Muse Spark 1.3 Contributor 0.10/0.20, Qwen3.8 Max 2.00/6.00, Qwen3.7 Max 2.50/7.50,
  Qwen3.7 Plus <=256K 0.40/1.60, >256K 1.20/4.80.
- Deprecated: GLM-5.2, Kimi K2.6, Kimi K2.7 Code, DeepSeek V4 Flash (docs note).
- SDK default model id is `cline-pass/mimo-v2.6-flash` (`providers.generated.ts:529`).
- Extra request headers Cline sends for cline/cline-pass (`providers/request-headers.ts:35-91`):
  `HTTP-Referer: https://cline.bot`, `X-Title: Cline`, `X-IS-MULTIROOT`, `X-CLIENT-TYPE`,
  `X-CLIENT-VERSION`, `X-PLATFORM`, `X-PLATFORM-VERSION`, `X-CORE-VERSION`, `X-Task-ID`,
  `User-Agent: Cline/<version>`. Docs mark only HTTP-Referer/X-Title as optional.

## Q6 — Multiple keys / accounts  (CONFIDENCE: HIGH for one-subscription-per-account; HIGH for multiple keys; UNDETERMINED for a concurrency cap)

- **One subscription per (personal) account.** ClinePass always uses the personal account balance:
  `apps/vscode/src/core/controller/models/handleClinePassProviderSelection.ts:5-31`
  ("ClinePass always uses the user's personal Cline account balance", calls `switchAccount(undefined)`).
- **Organization accounts cannot use ClinePass**: `errors.ts:7-8` and `:60-62`
  `"organization accounts cannot use individual model inference subscriptions"`.
- **Multiple API keys per account: YES.**
  `GET /api/v1/api-keys` ("List **your API keys**"), `POST /api/v1/api-keys` ("Create a new API key"),
  `DELETE /api/v1/api-keys/{key_id}` — https://docs.cline.bot/enterprise-solutions/api-reference
  and https://docs.cline.bot/api/authentication. Docs advise "Use different keys for development and
  production" and "Rotate keys periodically".
- **NO documented limit on concurrent keys was found** — not in the docs, not in the repo. Treat as undetermined.
- **Quota is account-scoped**, shared across all keys: rolling 5-hour / weekly / monthly windows
  (https://docs.cline.bot/getting-started/clinepass "Usage"). opencodex notes "ClinePass quota is shared by
  the account".
- One ClinePass credential per install: cline-pass shares the `cline` storage slot
  (`provider-auth-registry.ts:245-248`).
