# ClinePass provider package

## What it does

`@arnilo/prism-provider-clinepass` provides explicit, side-effect-free setup for
the ClinePass OpenAI-compatible Chat Completions API at
`https://api.cline.bot/api/v1`. Requests always stream. Model ids are official
`cline-pass/…` slugs from a static featured catalog.

## When to use it

Use it when a host has a ClinePass subscription key (`CLINE_API_KEY`) and wants
those open coding models through Prism `AgentSession`.

Do not use it for Cline WorkOS OAuth, Claude/Gemini subscription routing,
non-stream `{ data, success }` responses ([cline#12647](https://github.com/cline/cline/issues/12647)),
or caller-gated `GET /models` (no documented OpenAI models endpoint).

## Inputs / request

```ts
import { createClinePassProviderPackage } from "@arnilo/prism-provider-clinepass";

createClinePassProviderPackage(options: ClinePassProviderPackageOptions): ProviderPackage
```

| Field | Type | Purpose |
| --- | --- | --- |
| `apiKey` | `CredentialValueSource` | Host-supplied ClinePass key. No env scan. |
| `fetch` | `typeof fetch` | Optional fetch for tests/hosts. |
| `baseUrl` | `string` | Default `https://api.cline.bot/api/v1`. |
| `id` | `string` | Provider id (default `clinepass`). |
| `models` | `readonly ModelConfig[]` | Overrides static `clinePassModels`. |

There is no `listClinePassModels`.

### Thinking / reasoning compat

Per-model `compat.thinkingLevelMap` maps portable levels to wire
`reasoning_effort`. Request `options.compat.reasoning_effort` (or
`applyThinkingLevel(..., "reasoning_effort")`) wins.

| Family | slugs | map |
| --- | --- | --- |
| GLM | `cline-pass/glm-5.2` | `off→none`, `low/medium/high`, `xhigh` passthrough. Do not send `max` (upstream 500). |
| Kimi K3 | `cline-pass/kimi-k3` | `high→max` only. Off/low/medium omitted. |
| Kimi | `kimi-k2.7-code`, `kimi-k2.6` | `low/medium/high`. Off omitted. |
| DeepSeek | `deepseek-v4-pro`, `deepseek-v4-flash` | `off→none`, `high`/`xhigh→high`. |
| Standard | MiMo, MiniMax, Qwen | `off→none`, `low/medium/high`. |

Completion budget is `max_completion_tokens` (not `max_tokens`).

## Outputs / response / events

| Surface | Behavior |
| --- | --- |
| Provider stream | Prism text, thinking (`delta.reasoning` / `delta.reasoning_content`), tool-call, `usage`, `done`, redacted `error`. |
| Cache | Implicit upstream. `cached_tokens` / `prompt_cache_hit_tokens` → `cacheReadTokens` when present. No `cache_control`. |
| Auth | `api_key` only. |
| Non-stream | Unsupported. `{ success, data }` wrappers are not parsed. |

## Request/response example

```json
{
  "model": "cline-pass/deepseek-v4-flash",
  "messages": [{ "role": "user", "content": "Hello" }],
  "stream": true,
  "reasoning_effort": "high"
}
```

## Implementation example

```ts
import { createExtensionKernel } from "@arnilo/prism";
import { createClinePassProviderPackage } from "@arnilo/prism-provider-clinepass";

const kernel = createExtensionKernel();
await kernel.load([createClinePassProviderPackage({ apiKey: "fake-cline-key" })]);
```

Per-turn effort:

```ts
await session.prompt("Plan the refactor", {
  providerOptions: { compat: { reasoning_effort: "low" } },
});
```

## Extension and configuration notes

- Featured slugs: `glm-5.2`, `kimi-k3`, `kimi-k2.7-code`, `kimi-k2.6`,
  `deepseek-v4-pro`, `deepseek-v4-flash`, `mimo-v2.5`, `mimo-v2.5-pro`,
  `minimax-m3`, `qwen3.8-max`, `qwen3.7-max`, `qwen3.7-plus` (all prefixed
  `cline-pass/`).
- Catalog is static. Hosts may pass `models` to override.
- Multi-backend gateway: key compat off `api.cline.bot`, not the upstream vendor.
- Reference USD-per-million costs are catalog metadata; ClinePass itself is a subscription.

## Security and performance notes

- No network on import, setup, build, or default tests.
- No WorkOS, no Cline OAuth store share, no env/file lookup.
- API keys resolved per request and redacted from errors.
- Provider-owned headers win. One POST per generate. Bounded error bodies.
- Live tests: `PRISM_LIVE_PROVIDER_TESTS=1` plus `CLINE_API_KEY`.

## Related APIs

- [Provider packages](../provider-packages.md)
- [Thinking and reasoning](../thinking-and-reasoning.md)
- [Provider caching](../provider-caching.md)
- [Credentials and redaction](../credentials-and-redaction.md)
- [Provider conformance](../provider-conformance.md)

## Official evidence

- [ClinePass](https://docs.cline.bot/getting-started/clinepass)
- [Non-stream wrap](https://github.com/cline/cline/issues/12647)

