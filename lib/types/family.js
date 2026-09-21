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
import { DEFAULT_BASE_URL, DEFAULT_BASE_URL_ORIGIN, defaultKeyRef, GROUP_DEFAULTS, GROUP_KEYS, groupOf, providerOf } from "./groups.js";
import { GO_DEFAULT_RECOMMENDED, GO_REFUSED_MODEL_IDS, GO_REGISTRY, DEFAULT_RECOMMENDED, REFUSED_CHAT_MODEL_IDS, REGISTRY } from "./model-registry.js";
/** The Protocom official API family: the four original group routes. */
export const PROTOCOM = {
    ns: 'protocom-api',
    label: 'Protocom',
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
    telemetryPath: '/api/protocom-api/balance',
    telemetryKind: 'balance',
};
/** OpenCode Go endpoint base; `/v1` is appended per request. */
export const GO_DEFAULT_BASE_URL = 'https://opencode.ai/zen/go';
/** Origin of {@link GO_DEFAULT_BASE_URL}: the pin for stored Go keys. */
export const GO_DEFAULT_BASE_URL_ORIGIN = new URL(GO_DEFAULT_BASE_URL).origin;
/** Credential references the Go family resolves. */
export const GO_CREDENTIAL_REF = /^OPENCODE_[A-Z0-9_]+$/;
/**
 * The provider route the Go group registers under. `opencode-go` itself is
 * taken in DSH 1.5: the shipped `dsh-llm-pi-ai` plugin declares every pi-ai
 * catalog route unconditionally, and `opencode-go` is one of them, so a
 * second registration under that name is a DUPLICATE_DIRECTORY boot failure.
 * `-sub` distinguishes this plugin's subscription route from the built-in.
 */
export const GO_PROVIDER = 'opencode-go-sub';
/**
 * The OpenCode Go subscription family: one group, one provider route
 * (`opencode-go-sub`). The endpoint serves roughly thirty models over
 * chat-completions except a per-model set that only answers on the Responses
 * surface — those carry `protocol: 'responses'` in the registry. Session
 * scoping is contractual: every request sends `x-opencode-session`.
 */
export const OPENCODE_GO = {
    ns: 'opencode-go',
    label: 'OpenCode Go',
    baseURL: GO_DEFAULT_BASE_URL,
    origin: GO_DEFAULT_BASE_URL_ORIGIN,
    credentialRef: GO_CREDENTIAL_REF,
    keys: ['go'],
    defaults: {
        go: {
            displayName: 'OpenCode Go',
            protocol: 'chat-completions',
            // One ladder for every listed model: the endpoint discloses no context
            // metadata, so unregistered ids still offer the steps their fallback
            // window clears.
            contextLengths: [204_800, 262_144, 409_600, 1_048_576],
        },
    },
    providerOf: () => GO_PROVIDER,
    groupOf: provider => (provider === GO_PROVIDER ? 'go' : undefined),
    keyRef: () => 'OPENCODE_GO_API_KEY',
    recommended: GO_DEFAULT_RECOMMENDED,
    registry: GO_REGISTRY,
    refused: GO_REFUSED_MODEL_IDS,
    sessionHeader: 'x-opencode-session',
    chatThinking: 'effort-only',
    telemetryPath: '/api/opencode-go/usage',
    telemetryKind: 'quota',
};
/** Every family this plugin mounts. */
export const FAMILIES = [PROTOCOM, OPENCODE_GO];
