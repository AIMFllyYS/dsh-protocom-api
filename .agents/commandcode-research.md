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

## SECOND SOURCE: the capability catalog (found after the first pass)

The docs page `https://commandcode.ai/docs/plans/goat` is a Next.js app whose
**RSC streaming payload** carries a full structured model catalog. Extracted
(script: `scripts/extract-cc-docs.mjs`, snapshot:
`commandcode-catalog-2026-09-23.json`, 83 rows):

| Field | Meaning |
| --- | --- |
| `id` | sometimes vendor-prefixed (`stealth/space-bunny-alpha`), sometimes bare |
| `contextWindow` | tokens |
| `reasoning` | bool — **69 of 83 true** |
| `vision` | bool — **62 of 83 true** |
| `caps` | `{text, vision, reasoning}` booleans (same verdicts) |
| `minPlanName` | tier gate: **Go (52), GOAT (9), Max (8), Pro (14)** |
| `inputCost` / `outputCost` / `cacheReadCost` | dollars per Mtok — **79 of 83 publish a nonzero input cost** |
| `blendedCostPerMTok`, `codingIndex`, `intelligenceIndex`, `latencyTier`, `deal`, `tiers`, … | extra marketing/benchmark data, not needed |

**Join quality (script: `scripts/verify-cc-join.mjs`): 81 of 82 listing rows
match a docs row** by exact id or vendor-suffix. The one miss is
`claude-haiku-4-5-20251001` (a dated snapshot; the docs carry the undated id).
Two docs rows have no listing row (`claude-haiku-4-5`, `typesafe/jev`).

### Why this matters for THIS plugin

1. **Vision** — the endpoint's own listing does NOT disclose modality, so our
   permissive default ("unknown means images accepted") would claim vision for
   all 82. The catalog gives the real answer: 62 true, 21 false. A wrong "yes"
   costs an upstream error per call; a wrong "no" hides a real capability.
2. **Reasoning effort** — the listing discloses nothing, so no model would get
   an Effort submenu. The catalog says 69 of 83 can reason.
3. **Pricing** — this is the data the Fusion cost strip has been rendering as
   "no published price" since 0.7.0. A Command Code model would light it up.
4. **Tier gating** — a Go-tier account cannot use a Max-tier model; the listing
   already filters by account, so this is informational rather than load-bearing.

**Risk**: this is a scraped, undocumented surface. Per this repo's rule it must
degrade gracefully: a scrape failure yields models with no capability claims
(and says so), never an empty menu.

## ACCOUNT VERIFICATION with a real key (2026-09-23, plan individual-goat)

All four `/alpha/*` endpoints answered 200 (shapes recorded in
`src/commandcode.ts`). The subscription's `planId` is the load-bearing fact:

- `/alpha/billing/subscriptions` -> `data.planId = "individual-goat"` -> tier `goat`
- `/alpha/billing/credits` -> `credits.monthlyCredits` = remaining dollars,
  `windowLimits.fiveHour {used,cap,resetAt}`, `windowLimits.weekly {…}`
  (observed: $19.84 remaining, 5h $2.61 of $14, weekly $32.09 of $35)
- `/alpha/usage/summary` -> `totalCount`, `totalCost`, `successRate` (a
  PERCENTAGE: 100), `totalTokensIn`, `totalTokensOut`

### THE LISTING IS NOT PLAN-FILTERED

The decisive discovery, and the reason the tier gate exists. One model per tier:

| Model | Tier | Result |
| --- | --- | --- |
| `deepseek/deepseek-v4-flash` | Go | **200** |
| `gpt-5.6-sol` | GOAT | **200** |
| `gpt-6-sol` | Pro | **403 MODEL_NOT_IN_PLAN** |
| `gpt-6-astra` | Max | **403 MODEL_NOT_IN_PLAN** |

So the 82-row listing advertises models this account cannot call. With the gate:
21 of 82 rows are out of plan, leaving a **60-row menu**, and a sampled menu
model answered HTTP 200.

### The Anthropic wire is NOT reachable on this plan

`claude-sonnet-5` on `/chat/completions` answers **400**: *"Model
\"claude-sonnet-5\" must be called via /provider/v1/messages (Anthropic Messages
shape)."* — confirming the `supported_endpoints` routing rule applies to the
letter.

But every one of the 9 `/messages`-only models is gated **Pro (3) or Max (6)**,
and **no model supports both wires** (0 of 82). On a goat-tier account the
Anthropic wire therefore cannot be exercised at all.

**Conclusion: do NOT implement the messages wire now.** It cannot be verified by
request on this plan, and this repo's rule is that unverified wire behavior is
not shipped. The 9 Claude models stay hidden, which the endpoint filter already
does correctly; implementing the wire needs a Pro-or-above key to verify against.
This is recorded as the one deliberately deferred item.

### Decision this drives

Ship the family now with the two existing wires plus **per-model routing driven
by `supported_endpoints`**, so 73 models work immediately. The 9 Claude models
are excluded by the endpoint filter until an Anthropic wire exists — excluding
them is honest; advertising them on chat-completions would produce a guaranteed
400 for every call.
