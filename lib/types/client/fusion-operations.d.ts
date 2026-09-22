/**
 * The Host reads and writes the Fusion section performs, plus the catalog and
 * session facts its editor renders from. The section receives these callbacks
 * instead of a context, so failure codes and Remote namespaces stay in the
 * apply world — the same split `operations.ts` uses for the provider panels.
 *
 * Both namespaces are reached through the shared settings scope rather than
 * `remote.settings` directly: the scope carries the revision fence, folds its
 * answer back into the describe mirror every other surface reads, and queues
 * writes in order, which is exactly the concurrency behavior a two-namespace
 * save needs.
 *
 * The model catalog's shape is declared here rather than imported. The
 * session-controller client package publishes it as an ambient augmentation of
 * `ctx.remote`, and depending on that package pulls a second copy of the
 * harness type graph into this standalone plugin (it re-declares `ClientRemote`
 * and broke the settings/credentials namespaces when tried). These are
 * structural declarations of what the wire schema fixes, not a reimplementation.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client';
/** One adapter-owned reasoning effort a model route offers. */
export interface FusionEffort {
    readonly id: string;
    readonly name: string;
}
/** One model inside its provider group, as the Host catalog reports it. */
export interface FusionCatalogModel {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
    readonly reasoning?: {
        readonly efforts: readonly FusionEffort[];
        readonly defaultEffort?: string;
    };
}
/** One provider and its routable models. */
export interface FusionProviderGroup {
    readonly id: string;
    readonly name: string;
    readonly models: readonly FusionCatalogModel[];
}
/** One provider whose catalog lookup failed; its other groups stay usable. */
export interface FusionCatalogFailure {
    readonly id: string;
    readonly name: string;
    readonly message: string;
}
/** The Host-generation model catalog an editor picks from. */
export interface FusionCatalog {
    readonly groups: readonly FusionProviderGroup[];
    readonly failures: readonly FusionCatalogFailure[];
    readonly routableProviders: readonly string[];
}
/** What one catalog load answered. */
export type FusionCatalogOutcome = {
    readonly kind: 'found';
    readonly catalog: FusionCatalog;
} | {
    readonly kind: 'refused';
    readonly message: string;
};
/** What one settings write answered. */
export type FusionWriteOutcome = {
    readonly kind: 'written';
} | {
    readonly kind: 'conflict';
    readonly message: string;
} | {
    readonly kind: 'refused';
    readonly message: string;
};
/** One seat's route, in the shape every surface here passes around. */
export interface FusionSeat {
    provider: string;
    model: string;
    reasoningEffort?: string;
}
/** A seat as the stored (and possibly redacted) section carries it. */
export interface FusionStoredSeat {
    provider?: string;
    model?: string;
    reasoningEffort?: string;
}
/** The stored section value; every field is optional before the first save. */
export interface FusionStoredValue {
    enabled?: boolean;
    leader?: FusionStoredSeat;
    coder?: FusionStoredSeat;
    includeForks?: boolean;
    applyLeader?: boolean;
}
/**
 * The editor's staged state: the stored section with defaults resolved. A seat
 * is `| undefined` rather than merely optional because clearing a seat is a
 * real edit — picking "Not set" must be expressible, not silently ignored.
 */
export interface FusionDraft {
    enabled: boolean;
    leader: FusionSeat | undefined;
    coder: FusionSeat | undefined;
    includeForks: boolean;
    applyLeader: boolean;
}
/** The live view of the section the editor renders and fences against. */
export interface FusionSectionState {
    /** `loading` until the first accepted section arrives. */
    status: 'loading' | 'ready' | 'unavailable';
    value: FusionStoredValue | undefined;
    revision: number | undefined;
    /** Whether the Host document accepts writes; a memory-mode page does not. */
    writable: boolean;
}
/** One Session row, as much of it as the leader soft-apply reads. */
export interface FusionSessionRow {
    readonly sessionId: string;
    readonly origin?: 'subagent';
}
/** The Host operations the Fusion section invokes. */
export interface FusionOperations {
    /**
     * Read the live model catalog: every registered provider and the models it
     * can currently serve. This is the same directory the composer's own model
     * picker uses, so a route nobody enabled never appears here.
     */
    loadCatalog(): Promise<FusionCatalogOutcome>;
    /** The live `model-fusion` view, revision fence included. */
    section(): FusionSectionState;
    /** Observe section changes (local drafts, committed writes, reconnects). */
    subscribe(listener: () => void): () => void;
    /** Commit one complete draft as a single revision-fenced mutation. */
    saveFusion(draft: FusionDraft, expectedRevision: number | undefined): Promise<FusionWriteOutcome>;
    /**
     * Soft-apply the leader seat: write it as the deployment default for new
     * Sessions, then select it on the current top-level Session. Each half is
     * attempted independently and reported separately, so one failing does not
     * hide the other and neither rolls back the routing that was already saved.
     * @returns the failures that occurred, if any.
     */
    applyLeader(seat: FusionSeat): Promise<string[]>;
}
/** The settings namespace the Fusion section owns; mirrors `FUSION_NS`. */
export declare const FUSION_SETTINGS_NS = "model-fusion";
/** The harness-owned namespace carrying the default model for new Sessions. */
export declare const AGENT_DEFAULT_MODEL_NS = "agent-default-model";
/**
 * Pick the Session a leader change should apply to: the current one, and only
 * when it is a top-level conversation. A subagent Session is deliberately
 * excluded — addressing one through this Host API activates persisted history
 * outside the parent-continuation path, which the harness refuses, and a
 * subagent belongs on the coder seat anyway.
 * @param rows - the client Session list.
 * @param current - the id the shell currently shows, when any.
 * @returns the id to select a model on, or undefined when none qualifies.
 */
export declare function leaderTargetSession(rows: readonly FusionSessionRow[], current: string | undefined): string | undefined;
/** The path operations that write one draft as a complete section. */
export declare function fusionOps(draft: FusionDraft): SettingsPathOpView[];
/**
 * Bind the Fusion section's Host operations.
 * @param ctx - the plugin's context, which declares `remote.session` and
 * `settingsScope` in its own `inject`.
 */
export declare function createFusionOperations(ctx: ClientContext): FusionOperations;
