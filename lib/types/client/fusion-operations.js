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
/** The settings namespace the Fusion section owns; mirrors `FUSION_NS`. */
export const FUSION_SETTINGS_NS = 'model-fusion';
/** The harness-owned namespace carrying the default model for new Sessions. */
export const AGENT_DEFAULT_MODEL_NS = 'agent-default-model';
/** Read the shell's current Session id, or undefined in the no-session view. */
function currentSessionId(ctx) {
    return ctx.sessions?.list.getSnapshot().current;
}
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
export function leaderTargetSession(rows, current) {
    if (current === undefined)
        return undefined;
    const row = rows.find(candidate => candidate.sessionId === current);
    if (row === undefined)
        return undefined;
    return row.origin === 'subagent' ? undefined : current;
}
/** The path operations that write one draft as a complete section. */
export function fusionOps(draft) {
    return [
        { op: 'set', path: ['enabled'], value: draft.enabled },
        { op: 'set', path: ['leader'], value: seatValue(draft.leader) },
        { op: 'set', path: ['coder'], value: seatValue(draft.coder) },
        { op: 'set', path: ['includeForks'], value: draft.includeForks },
        { op: 'set', path: ['applyLeader'], value: draft.applyLeader },
    ];
}
/** One seat as a plain JSON object; an unset seat writes as `{}`. */
function seatValue(seat) {
    if (seat === undefined)
        return {};
    return {
        provider: seat.provider,
        model: seat.model,
        ...seat.reasoningEffort === undefined ? {} : { reasoningEffort: seat.reasoningEffort },
    };
}
/**
 * Bind the Fusion section's Host operations.
 * @param ctx - the plugin's context, which declares `remote.session` and
 * `settingsScope` in its own `inject`.
 */
export function createFusionOperations(ctx) {
    const scope = ctx.settingsScope.bind({ namespace: FUSION_SETTINGS_NS });
    const defaults = ctx.settingsScope.bind({ namespace: AGENT_DEFAULT_MODEL_NS });
    const session = ctx.remote.session;
    return {
        loadCatalog: async () => {
            const response = await session.modelCatalog();
            return response.ok
                ? { kind: 'found', catalog: response.value }
                : { kind: 'refused', message: response.error.message };
        },
        section: () => {
            const snapshot = scope.getSnapshot();
            return {
                status: snapshot.status,
                value: snapshot.value,
                revision: snapshot.revision,
                writable: snapshot.writable,
            };
        },
        subscribe: listener => scope.subscribe(listener),
        saveFusion: async (draft, expectedRevision) => {
            try {
                await scope.mutate(fusionOps(draft), expectedRevision);
                return { kind: 'written' };
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                // The scope rejects a stale fence without a wire call; every other
                // refusal (validation, persistence) is the Host's own diagnosis.
                return /conflict/i.test(message) ? { kind: 'conflict', message } : { kind: 'refused', message };
            }
        },
        applyLeader: async (seat) => {
            const failures = [];
            const snapshot = defaults.getSnapshot();
            if (!snapshot.writable)
                return failures;
            try {
                await defaults.mutate([
                    { op: 'set', path: ['provider'], value: seat.provider },
                    { op: 'set', path: ['model'], value: seat.model },
                    // The effort is written explicitly, including clearing it: a leftover
                    // effort from a previous leader belongs to that model's vocabulary.
                    seat.reasoningEffort === undefined
                        ? { op: 'unset', path: ['reasoningEffort'] }
                        : { op: 'set', path: ['reasoningEffort'], value: seat.reasoningEffort },
                ], snapshot.revision);
            }
            catch (error) {
                failures.push(error instanceof Error ? error.message : String(error));
            }
            const current = currentSessionId(ctx);
            if (current === undefined)
                return failures;
            const listed = await session.list({});
            if (!listed.ok) {
                failures.push(listed.error.message);
                return failures;
            }
            const target = leaderTargetSession(listed.value.items, current);
            if (target === undefined)
                return failures;
            const selected = await session.selectModel({
                sessionId: target,
                provider: seat.provider,
                model: seat.model,
                ...seat.reasoningEffort === undefined ? {} : { reasoningEffort: seat.reasoningEffort },
            });
            if (!selected.ok)
                failures.push(selected.error.message);
            return failures;
        },
    };
}
