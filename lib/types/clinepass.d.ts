/**
 * ClinePass: Cline's $9.99/month subscription over a curated set of open
 * coding models, on Cline's OpenAI-compatible chat-completions surface.
 *
 * NOT a separate gateway. It is the same host, path and bearer auth as Cline's
 * other providers; only the `cline-pass/` model-id namespace and a
 * subscription-scoped quota differ. Verified against Cline's own SDK source
 * and live probes, 2026-09-28:
 *
 * - `POST /api/v1/chat/completions` answers 401 without a credential, so the
 *   path is real and the authorization is a bearer token.
 * - `GET /api/v1/models` is a DECOY: public, 458 rows, and not one
 *   `cline-pass/*` entry. It is Cline's pay-as-you-go catalog.
 * - `GET /api/v1/ai/cline/recommended-models` is the real list: public,
 *   keyless, and it carries a `clinePass` array of 14 ids. That is what the
 *   coverage guard archives; the capability metadata it lacks comes from
 *   Cline's own bundled model catalog.
 */
import type { ProviderFamily } from './family.ts';
import type { RegistryEntry } from './model-registry.ts';
/** Endpoint root. `/chat/completions` is appended for a turn. */
export declare const CLINEPASS_BASE_URL = "https://api.cline.bot/api/v1";
/** The origin a stored key may be sent to without explicit confirmation. */
export declare const CLINEPASS_BASE_URL_ORIGIN: string;
/** The one provider route this family registers. */
export declare const CLINEPASS_PROVIDER = "clinepass";
/**
 * Credential references this family resolves.
 *
 * Cline issues plain API keys from Settings > API Keys, so the pool is a
 * first-class fit: every distinct reference is an independent subscription,
 * and `CLINE_API_KEY_2` pools a second one exactly as it does for the other
 * families. The namespace bound keeps the environment fallback from reading
 * an arbitrary variable.
 */
export declare const CLINEPASS_CREDENTIAL_REF: RegExp;
/** The conventional credential reference a stored key lives under. */
export declare const CLINEPASS_KEY_REF = "CLINE_API_KEY";
/**
 * Context lengths offered as picker variants.
 *
 * The same four steps the other subscription families offer, so a budget means
 * the same thing whichever subscription serves it. The ladder is a CEILING,
 * never an override: a model is only offered steps within its own window, and
 * its own window is always the last step it can reach.
 */
export declare const CLINEPASS_CONTEXT_LADDER: readonly number[];
/**
 * Ids Cline documents as retired from ClinePass.
 *
 * "Due to capacity constraints and model upgrades, GLM-5.2, Kimi K2.6, Kimi
 * K2.7 Code, and DeepSeek V4 Flash are no longer available on ClinePass."
 * Named rather than merely omitted, so a deployment that had one selected
 * reads "the endpoint does not serve this" instead of an unexplained 400, and
 * restoring one is a single line.
 */
export declare const CLINEPASS_REFUSED_MODEL_IDS: readonly string[];
/**
 * The fourteen models ClinePass includes.
 *
 * Ids are Cline's own, cross-checked against the live `recommended-models`
 * endpoint. Every entry is tagged for the group, because the endpoint's
 * `/models` listing is NOT a membership source for this family -- see
 * ProviderFamily.listingIsMembership -- so this registry IS the menu.
 *
 * Context windows, image support and reasoning vocabularies are taken verbatim
 * from Cline's own bundled model catalog, which is the only source that states
 * them. They are NOT from models.dev: that consensus disagrees with Cline on
 * several of these models, and most sharply on qwen3.8-max, where it reports
 * 1,000,000 tokens and image support for a model Cline serves at 128,000 with
 * neither. Where a vendor publishes its own numbers, those win.
 */
export declare const CLINEPASS_REGISTRY: readonly RegistryEntry[];
/**
 * Models that lead this family's menu when the deployment chooses none.
 *
 * Empty on purpose, like Command Code's: the fourteen are all curated by Cline
 * for agent work, and any order this plugin invented would be a preference the
 * vendor never expressed.
 */
export declare const CLINEPASS_RECOMMENDED: readonly string[];
/**
 * The ClinePass family. One group, one route, no session header.
 *
 * `listingIsMembership: false` is the load-bearing difference from its
 * siblings: Cline's `/api/v1/models` is a different catalog entirely, so this
 * registry is the menu rather than a supplement to a listing.
 *
 * `chatThinking: 'reasoning-object'` sends `reasoning: {enabled, effort}` with
 * no `thinking` block and no bare `reasoning_effort`. The two third-party
 * implementations disagree and neither Cline's docs nor its SDK names the
 * field for these ids, so this follows the only one that OBSERVED it on the
 * wire, which also recorded that `reasoning_effort` was NOT what it sent. That
 * is the weakest evidence in this file and it is recorded, not hidden: if live
 * testing shows otherwise, this one word is the change.
 */
export declare const CLINEPASS: ProviderFamily;
