/**
 * The Command Code subscription family: one provider route
 * (`commandcode`) serving the models the account's plan includes.
 *
 * Everything here was verified against the live service (2026-09-23) rather
 * than taken from documentation, because the endpoint publishes no docs for
 * most of what this family needs:
 *
 * - `GET /provider/v1/models` answers **200 with no credential at all**, so
 *   discovery and this family's catalog work before a key is configured.
 * - Every listing row carries exactly `id`, `object`, `created`, `owned_by`,
 *   `name`, `context_length`, and `supported_endpoints`.
 * - `supported_endpoints` is the ROUTING TRUTH, not a hint. Of 82 models:
 *   65 declare `/chat/completions` + `/responses`, 8 declare only
 *   `/chat/completions`, and 9 (all Claude) declare only `/messages` and
 *   answer 400 on any OpenAI wire. The family therefore reports **73 of 82**
 *   models and hides the 9 that need a wire this plugin does not implement.
 * - `GET /alpha/whoami` answers 401 to a bogus bearer (route exists); an
 *   unknown `/provider/v1` path answers 404.
 *
 * The name deliberately does not embed a plan tier. Command Code sells
 * cumulative plans (GOAT / Pro / Max), and which models an account may use is
 * a server-side decision this family does not need to model: the listing is
 * already filtered by the account, so a route named for a tier would go stale
 * the moment the subscription changed while the route kept working.
 *
 * @module dsh-protocom-api/commandcode
 */
/** Endpoint base. `/v1/models` is appended for discovery; any endpoint-root
 * normalization that strips a trailing `/v1` must leave `/provider/v1` intact. */
export const COMMANDCODE_BASE_URL = 'https://api.commandcode.ai/provider';
/** The origin a stored key may be sent to without explicit confirmation. */
export const COMMANDCODE_BASE_URL_ORIGIN = new URL(COMMANDCODE_BASE_URL).origin;
/** The one provider route this family registers. */
export const COMMANDCODE_PROVIDER = 'commandcode';
/** Credential references this family resolves, mirroring the other families'
 * namespacing bound: the reference is what the environment fallback reads. */
export const COMMANDCODE_CREDENTIAL_REF = /^COMMANDCODE_[A-Z0-9_]+$/;
/**
 * Context lengths this family offers as picker variants.
 *
 * The live listing publishes a wider and less regular set than any other
 * endpoint this plugin serves (200000, 256000, 262000, 262144, 400000,
 * 500000, 1000000, 1048576, 1050000), including several that differ by a few
 * hundred tokens. Offering all nine would be noise in the menu; the ladder
 * below keeps the four steps that actually distinguish a choice, and a model
 * is still only offered the steps at or below its own window.
 */
export const COMMANDCODE_CONTEXT_LADDER = [200_000, 256_000, 400_000, 1_000_000];
/**
 * Ids the endpoint lists but cannot serve. Empty: every row in the live
 * listing was servable on at least one wire this plugin implements, except the
 * nine Anthropic-only Claude models, which are excluded by their declared
 * endpoints rather than by an id blocklist. Kept as an explicit empty list so
 * the family shape matches its siblings and a future refusal has one home.
 */
export const COMMANDCODE_REFUSED_MODEL_IDS = [];
/**
 * Models that lead this family's menu when the deployment chooses none.
 *
 * Empty on purpose. Which models are worth naming first depends on the account's
 * plan, and the listing is already filtered to what that plan includes, so a
 * shipped order would be a guess that ages badly. The menu keeps the endpoint's
 * own order instead.
 */
export const COMMANDCODE_RECOMMENDED = [];
/**
 * The Command Code family. One group (`cc`), one route, no session header:
 * unlike OpenCode Go this endpoint accepts requests without session scoping,
 * which was confirmed by the public listing answering without one.
 */
export const COMMANDCODE = {
    ns: 'commandcode',
    label: 'Command Code',
    baseURL: COMMANDCODE_BASE_URL,
    origin: COMMANDCODE_BASE_URL_ORIGIN,
    credentialRef: COMMANDCODE_CREDENTIAL_REF,
    keys: ['cc'],
    defaults: {
        cc: {
            displayName: 'Command Code',
            // Most models are served on chat-completions (73 of 82 declare it), and
            // the per-model endpoint declaration overrides this wherever the gateway
            // says otherwise, so this is a fallback rather than a guess.
            protocol: 'chat-completions',
            contextLengths: COMMANDCODE_CONTEXT_LADDER,
        },
    },
    providerOf: () => COMMANDCODE_PROVIDER,
    groupOf: provider => (provider === COMMANDCODE_PROVIDER ? 'cc' : undefined),
    keyRef: () => 'COMMANDCODE_API_KEY',
    // No shipped recommendation: which models matter depends on the plan, and a
    // hand-picked order would silently hide the rest behind a scroll.
    recommended: [],
    // No hand-maintained registry: this endpoint DISCLOSES context length and
    // routing on every row, so a hand-written copy could only go stale.
    registry: [],
    refused: COMMANDCODE_REFUSED_MODEL_IDS,
    // No account surface yet. The alpha endpoints exist (/alpha/whoami answers
    // 401 to a bogus bearer, so the route is real), but their RESPONSE shape was
    // never observed here — no key for this service exists in this environment —
    // and this plugin's rule is that every field it renders was confirmed by a
    // request. Filling in credits is a follow-up that needs one live key.
};
