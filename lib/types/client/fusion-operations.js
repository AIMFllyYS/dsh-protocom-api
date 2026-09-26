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
/**
 * The Loader entry id this plugin's settings form is keyed by; mirrors
 * `PROTOCOM_NS` on the Host.
 *
 * 1.7 keys a form by profile row rather than by a namespace the plugin
 * registers, and one entry has exactly one Config. All four sections therefore
 * share this id and are addressed by their path prefix within it — see
 * {@link FUSION_SECTION_PATH}.
 */
export const PROTOCOM_ENTRY_ID = 'protocom-api';
/** Where the Fusion section sits inside that one Config. */
export const FUSION_SECTION_PATH = 'fusion';
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
/**
 * The path operations that write one draft as a complete section.
 *
 * Every path is rooted at the section name because 1.7 addresses fields from
 * the Config root: the form belongs to the entry, and `fusion` is the section
 * inside it rather than a namespace of its own.
 */
export function fusionOps(draft) {
    const path = (...rest) => [FUSION_SECTION_PATH, ...rest];
    return [
        { op: 'set', path: path('enabled'), value: draft.enabled },
        { op: 'set', path: path('leader'), value: seatValue(draft.leader) },
        { op: 'set', path: path('coder'), value: seatValue(draft.coder) },
        { op: 'set', path: path('includeForks'), value: draft.includeForks },
        { op: 'set', path: path('applyLeader'), value: draft.applyLeader },
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
 * `configForms` in its own `inject`.
 * @param t - the section's translator. The `applyLeader` outcomes that are not
 * failures but still need saying -- "there is no session to apply this to" --
 * are prose, so the wording stays with the locale rather than here.
 */
export function createFusionOperations(ctx, t) {
    // 1.7 names a form after its Loader entry, and this plugin has one entry
    // holding all four sections. The Fusion fields are therefore a PATH into that
    // form rather than a namespace of their own, which is why every op below is
    // rooted at FUSION_SECTION_PATH.
    const scope = ctx.configForms.get(PROTOCOM_ENTRY_ID);
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
            // No separate write to the deployment default: since 1.7
            // `session.selectModel` persists the deployment default itself, in the
            // background, through the harness's own service. Writing a settings
            // namespace for it is not merely redundant -- that namespace no longer
            // exists, because the default model became a service rather than a
            // section an extension could address.
            const current = currentSessionId(ctx);
            if (current === undefined) {
                // Reporting beats a silent pass. The reasoning above explains why no
                // separate default write happens -- it would be redundant when
                // selectModel runs -- but that argument only holds if selectModel runs,
                // and from a page with no session open it never does. Returning success
                // here told the operator the leader seat was applied when nothing had
                // been touched, in the one screen where they are most likely to set it.
                failures.push(t('applyLeaderNoSession'));
                return failures;
            }
            const listed = await session.list({});
            if (!listed.ok) {
                failures.push(listed.error.message);
                return failures;
            }
            const target = leaderTargetSession(listed.value.items, current);
            if (target === undefined) {
                // The current session is a subagent, which this deliberately skips so
                // persisted history is not activated outside the parent-continuation
                // path. Saying so beats reporting a success that did not happen.
                failures.push(t('applyLeaderSubagent'));
                return failures;
            }
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
