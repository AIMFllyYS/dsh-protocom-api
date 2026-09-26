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
import type { GroupReasoning, Protocol } from './groups.ts';
import type { RegistryEntry } from './model-registry.ts';
/** Per-group shipped defaults of one family. */
export interface FamilyGroupDefaults {
    displayName: string;
    protocol: Protocol;
    reasoning?: GroupReasoning;
    contextLengths?: readonly number[];
}
/**
 * One upstream API surface. Everything the adapter, discovery, balance/usage,
 * and settings section need to know about the family travels through here, so
 * the generic machinery never hard-codes a provider name.
 */
export interface ProviderFamily {
    /**
     * Settings namespace this family's section lives under; also the log and
     * error-message prefix, matching the plugin's existing `protocom-api:` style.
     */
    ns: string;
    /** Human-readable family name for transport error messages. */
    label: string;
    /** Endpoint root this family ships with. */
    baseURL: string;
    /** The only origin a stored key is sent to without explicit confirmation. */
    origin: string;
    /** Credential references this family resolves; the namespace bound that keeps the env fallback from reading arbitrary variables. */
    credentialRef: RegExp;
    /** Group keys in fixed order. */
    keys: readonly string[];
    defaults: Readonly<Record<string, FamilyGroupDefaults>>;
    /** Provider route one group registers under. */
    providerOf(key: string): string;
    /** Group behind one provider route, or undefined for a foreign route. */
    groupOf(provider: string): string | undefined;
    /** Conventional credential reference one group's API key is stored under. */
    keyRef(key: string): string;
    /** Model ids that lead the menu when the deployment has not chosen its own. */
    recommended: readonly string[];
    /** This family's hand-maintained model registry. */
    registry: readonly RegistryEntry[];
    /** Ids this family's endpoint lists but cannot serve a chat turn for. */
    refused: readonly string[];
    /**
     * Session-scoping request header this family's endpoint requires
     * (`x-opencode-session` on OpenCode Go). When set, every request carries it
     * with the harness session id — or a per-adapter stable id for requests that
     * arrive without one. The harness-native `x-deepseek-harness-session-id`
     * rides alongside, because the gateway recognizes it on model paths where
     * the vendor header is not yet threaded.
     */
    sessionHeader?: string;
    /**
     * How a chat-completions request spells thinking control. `toggle` (default)
     * sends `thinking: {type: enabled|disabled}` plus `reasoning_effort`;
     * `effort-only` sends `reasoning_effort` alone — the spelling the Go gateway
     * parses — and relies on the model's own vocabulary for the disabling word
     * (`none`/`off`), since the same surface rejects a `thinking` block on some
     * model routes.
     */
    chatThinking?: 'toggle' | 'effort-only';
    /**
     * The fenced Fetch route this family's account surface registers, or
     * undefined when the family ships no account surface.
     *
     * Absent is the honest state for a family whose credential-less endpoints
     * cannot be exercised: mounting a route would mean guessing a response shape
     * no request confirmed, and a wrong guess renders as a broken panel rather
     * than as "not supported here".
     */
    telemetryPath?: string;
    /** What that route answers: currency balance (Protocom) or quota windows (Go). */
    telemetryKind?: 'balance' | 'quota';
}
/** The Protocom official API family: the four original group routes. */
export declare const PROTOCOM: ProviderFamily;
/** OpenCode Go endpoint base; `/v1` is appended per request. */
export declare const GO_DEFAULT_BASE_URL = "https://opencode.ai/zen/go";
/** Origin of {@link GO_DEFAULT_BASE_URL}: the pin for stored Go keys. */
export declare const GO_DEFAULT_BASE_URL_ORIGIN: string;
/** Credential references the Go family resolves. */
export declare const GO_CREDENTIAL_REF: RegExp;
/**
 * The provider route the Go group registers under. `opencode-go` itself is
 * taken in DSH 1.5: the shipped `dsh-llm-pi-ai` plugin declares every pi-ai
 * catalog route unconditionally, and `opencode-go` is one of them, so a
 * second registration under that name is a DUPLICATE_DIRECTORY boot failure.
 * `-sub` distinguishes this plugin's subscription route from the built-in.
 */
export declare const GO_PROVIDER = "opencode-go-sub";
/**
 * The OpenCode Go subscription family: one group, one provider route
 * (`opencode-go-sub`). The endpoint serves roughly thirty models over
 * chat-completions except a per-model set that only answers on the Responses
 * surface — those carry `protocol: 'responses'` in the registry. Session
 * scoping is contractual: every request sends `x-opencode-session`.
 */
export declare const OPENCODE_GO: ProviderFamily;
/** Every family this plugin mounts. */
export declare const FAMILIES: readonly ProviderFamily[];
