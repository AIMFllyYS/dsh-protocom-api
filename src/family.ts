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

import { DEFAULT_BASE_URL, DEFAULT_BASE_URL_ORIGIN, defaultKeyRef, GROUP_DEFAULTS, GROUP_KEYS, groupOf, providerOf } from './groups.ts'
import { GO_DEFAULT_RECOMMENDED, GO_REFUSED_MODEL_IDS, GO_REGISTRY, DEFAULT_RECOMMENDED, REFUSED_CHAT_MODEL_IDS, REGISTRY } from './model-registry.ts'
import type { GroupReasoning, Protocol } from './groups.ts'
import { COMMANDCODE } from './commandcode.ts'
import type { RegistryEntry } from './model-registry.ts'

/** Per-group shipped defaults of one family. */
export interface FamilyGroupDefaults {
  displayName: string
  protocol: Protocol
  reasoning?: GroupReasoning
  contextLengths?: readonly number[]
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
  ns: string
  /** Human-readable family name for transport error messages. */
  label: string
  /** Endpoint root this family ships with. */
  baseURL: string
  /** The only origin a stored key is sent to without explicit confirmation. */
  origin: string
  /** Credential references this family resolves; the namespace bound that keeps the env fallback from reading arbitrary variables. */
  credentialRef: RegExp
  /** Group keys in fixed order. */
  keys: readonly string[]
  defaults: Readonly<Record<string, FamilyGroupDefaults>>
  /** Provider route one group registers under. */
  providerOf(key: string): string
  /** Group behind one provider route, or undefined for a foreign route. */
  groupOf(provider: string): string | undefined
  /** Conventional credential reference one group's API key is stored under. */
  keyRef(key: string): string
  /** Model ids that lead the menu when the deployment has not chosen its own. */
  recommended: readonly string[]
  /** This family's hand-maintained model registry. */
  registry: readonly RegistryEntry[]
  /** Ids this family's endpoint lists but cannot serve a chat turn for. */
  refused: readonly string[]
  /**
   * Session-scoping request header this family's endpoint requires
   * (`x-opencode-session` on OpenCode Go). When set, every request carries it
   * with the harness session id — or a per-adapter stable id for requests that
   * arrive without one. The harness-native `x-deepseek-harness-session-id`
   * rides alongside, because the gateway recognizes it on model paths where
   * the vendor header is not yet threaded.
   */
  sessionHeader?: string
  /**
   * How a chat-completions request spells thinking control. `toggle` (default)
   * sends `thinking: {type: enabled|disabled}` plus `reasoning_effort`;
   * `effort-only` sends `reasoning_effort` alone — the spelling the Go gateway
   * parses — and relies on the model's own vocabulary for the disabling word
   * (`none`/`off`), since the same surface rejects a `thinking` block on some
   * model routes.
   */
  chatThinking?: 'toggle' | 'effort-only'
  /**
   * The fenced Fetch route this family's account surface registers, or
   * undefined when the family ships no account surface.
   *
   * Absent is the honest state for a family whose credential-less endpoints
   * cannot be exercised: mounting a route would mean guessing a response shape
   * no request confirmed, and a wrong guess renders as a broken panel rather
   * than as "not supported here".
   */
  telemetryPath?: string
  /** What that route answers: currency balance (Protocom) or quota windows (Go). */
  telemetryKind?: 'balance' | 'quota'
  /**
   * Page carrying this family's capability catalog, when the endpoints listing
   * discloses no capabilities of its own.
   *
   * Command Code's listing says which WIRE serves a model but nothing about
   * what the model can do; the vendor's pricing page embeds a structured
   * catalog with `reasoning`, `vision`, and per-model prices. Naming the page
   * here is what lets the adapter enrich the menu without hard-coding a scrape
   * inside the generic family machinery. A scrape failure degrades to "no
   * capability claims", never to an empty menu.
   */
  capabilityCatalogUrl?: string
  /**
   * Endpoint answering this account's subscription, whose planId decides which
   * models the account may actually call.
   *
   * Verified necessary: an account on individual-goat got HTTP 200 for Go- and
   * GOAT-tier models and HTTP 403 MODEL_NOT_IN_PLAN for Pro- and Max-tier ones,
   * so the endpoints listing -- which is NOT plan-filtered -- advertises models
   * the account cannot use.
   */
  planIdPath?: string
  /** Endpoint answering the account's credit balances and rolling windows. */
  creditsPath?: string
  /** Endpoint answering the account's usage totals for the period. */
  usagePath?: string
}

/** The Protocom official API family: the four original group routes. */
export const PROTOCOM: ProviderFamily = {
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
}

/** OpenCode Go endpoint base; `/v1` is appended per request. */
export const GO_DEFAULT_BASE_URL = 'https://opencode.ai/zen/go'

/** Origin of {@link GO_DEFAULT_BASE_URL}: the pin for stored Go keys. */
export const GO_DEFAULT_BASE_URL_ORIGIN = new URL(GO_DEFAULT_BASE_URL).origin

/** Credential references the Go family resolves. */
export const GO_CREDENTIAL_REF = /^OPENCODE_[A-Z0-9_]+$/

/**
 * The provider route the Go group registers under. `opencode-go` itself is
 * taken in DSH 1.5: the shipped `dsh-llm-pi-ai` plugin declares every pi-ai
 * catalog route unconditionally, and `opencode-go` is one of them, so a
 * second registration under that name is a DUPLICATE_DIRECTORY boot failure.
 * `-sub` distinguishes this plugin's subscription route from the built-in.
 */
export const GO_PROVIDER = 'opencode-go-sub'

/**
 * The OpenCode Go subscription family: one group, one provider route
 * (`opencode-go-sub`). The endpoint serves roughly thirty models over
 * chat-completions except a per-model set that only answers on the Responses
 * surface — those carry `protocol: 'responses'` in the registry. Session
 * scoping is contractual: every request sends `x-opencode-session`.
 */
export const OPENCODE_GO: ProviderFamily = {
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
}

/** Every family this plugin mounts. */
export const FAMILIES: readonly ProviderFamily[] = [PROTOCOM, OPENCODE_GO, COMMANDCODE]
