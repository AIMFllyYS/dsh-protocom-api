# Command Code Goat — verified research (Round 2)

Sources: two independent DSH plugins that already integrate Command Code, studied at
their source level (cloned, not summarized from prose):

- `github.com/Plocr/dsh-commandcode-goat` @ 811af31 (writes profiles into the
  first-party `llm-pi-ai` settings namespace rather than implementing an adapter)
- `github.com/CJYLZS/dsh-commandcode-provider` @ 7bca4fb (lighter, lib/index.js)

Their READMEs state the endpoints were verified against the real service (no key
returns 401, not 404). Treat the shapes below as second-hand but precise until a
live key confirms them.

## Endpoints

| Purpose | URL |
| --- | --- |
| Live model list | `GET https://api.commandcode.ai/provider/v1/models` |
| Chat (OpenAI wire) | `https://api.commandcode.ai/provider/v1` + `/chat/completions`, `/responses`, `/messages` |
| Capability catalog (scrape) | `https://commandcode.ai/docs/plans/goat` (Next.js RSC payload — NOT an API) |
| Account identity | `GET /alpha/whoami` |
| Usage summary | `GET /alpha/usage/summary` |
| Credits + rolling windows | `GET /alpha/billing/credits` |
| Subscription plan | `GET /alpha/billing/subscriptions` (accepts `?orgId=`) |

Alpha endpoints are undocumented but are "the set the official CLI calls".

## Model listing shape

Each row carries `id`, `name`, `context_length` (number, also seen as
`contextWindow`), and, since the 2026-09 gateway update,
`supported_endpoints`: an array of endpoint paths.

**`supported_endpoints` is the routing truth**, not a hint:

- contains `/chat/completions` → OpenAI-compatible wire
- contains `/responses` → Responses wire
- contains `/messages` → **Anthropic Messages wire**

A Claude model sent to `/chat/completions` is rejected with **400**. Routing by
id prefix would be a guess; routing by this field is the gateway's own claim.
Precedence in the reference: chat-completions, then responses, then messages.

## Capability catalog (scraped, degrades gracefully)

Per-model `vision` (bool), `reasoning` (bool), `caps`, and `minPlanName`.
If the scrape fails: still generate models, but claim no capabilities and apply
no tier filter, and say so.

## Plan tiers

`minPlanName` gates a model; tiers are CUMULATIVE (Pro includes all of GOAT).
Known values include goat / pro / max. A model whose `minPlanName` is unknown is
excluded by the reference as `unknown-tier`.

## Usage / credits shape (normalized by the reference)

- `credits.monthlyCredits` / `purchasedCredits` / `freeCredits` are REMAINING
  dollar balances (monthly is the pool; NOT a total).
- `windowLimits.weekly` and a 5-hour window: each `{ used, cap, exceeded, resetAt }`
  where `resetAt` is epoch **milliseconds**, and `used`/`cap` are **dollars**,
  not request counts (5h cap ~14, weekly ~35, monthly ~70 — money).
- `usage/summary`: `totalTokensIn`, `totalTokensOut`, requests, successRate
  (a PERCENTAGE 0-100; a 0-1 fraction also appears).

## Impact on THIS plugin

1. We support only `chat-completions` and `responses` (`src/groups.ts` `Protocol`).
   Command Code's Claude models need a **third protocol: `anthropic-messages`**.
   Per-model protocol override already exists (`RegistryEntry.protocol`), so the
   architecture accommodates it; the work is the wire implementation.
2. Non-Claude models work on chat-completions, so a chat-only Command Code family
   is useful immediately; anthropic is what makes the Claude models reachable.
3. Our discovery reads `id`/`display_name`; it must additionally read
   `context_length` and `supported_endpoints` for this family.

## LIVE VERIFICATION (2026-09-23, this machine, no valid key)

Probed directly with `curl`:

| URL | Result |
| --- | --- |
| `GET /provider/v1/models` | **200** — public, no key required |
| `GET /alpha/whoami` | **401** with a bogus bearer — route exists, key required |
| `GET /provider/v1/nonexistent` | **404** |

The live listing was downloaded (snapshot: `commandcode-models-2026-09-23.json`,
82 rows, 16 KB). CONFIRMED facts, replacing the second-hand notes above:

- Top level is `{ object, data: [...] }` — the same `data` array our discovery
  already reads.
- Row fields are exactly: `id`, `object`, `created`, `owned_by`, `name`,
  `context_length`, `supported_endpoints`. Note `name` (not `display_name`)
  and `context_length` — **both already handled** by our discovery parser.
- `supported_endpoints` is present on EVERY row and takes exactly three shapes:

  | Shape | Count | Meaning |
  | --- | --- | --- |
  | `["/chat/completions", "/responses"]` | 65 | either OpenAI wire works |
  | `["/chat/completions"]` | 8 | chat-completions only |
  | `["/messages"]` | 9 | **Anthropic wire only** (all 9 are Claude) |

- Coverage with our current two wires: **73 of 82 models**, no protocol work
  needed. The 9 unreachable ones are exactly `claude-*`:
  sonnet-5, sonnet-4-6, fable-5-1, fable-5, opus-5-5, opus-5, opus-4-8,
  opus-4-7, haiku-4-5-20251001.
- `context_length` values seen: 200000, 256000, 262000, 262144, 400000,
  500000, 1000000, 1048576, 1050000.

### Decision this drives

Ship the family now with the two existing wires plus **per-model routing driven
by `supported_endpoints`**, so 73 models work immediately. The 9 Claude models
are excluded by the endpoint filter until an Anthropic wire exists — excluding
them is honest; advertising them on chat-completions would produce a guaranteed
400 for every call.
