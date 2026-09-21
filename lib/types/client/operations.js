/**
 * The Host reads and writes the Protocom section performs, as callbacks built
 * in the plugin body. The section receives these instead of a context: the
 * outcomes name what a card renders, so failure codes and Remote namespaces
 * stay in the apply world.
 */
/** The settings namespace the Protocom family owns (`'opencode-go'` is the Go family's). */
export const SETTINGS_NS = 'protocom-api';
/**
 * Bind one section's Host operations to the plugin's own Remote namespaces.
 * @param ctx - the plugin's context, which declares `remote.credentials`,
 * `remote.llm`, and `remote.settings` in its own `inject`.
 * @param settingsNs - the family's settings namespace: every read, write, and
 * discovery request is scoped to it, so the two families' sections never
 * share state.
 */
export function createProtocomOperations(ctx, settingsNs = SETTINGS_NS) {
    return {
        describeSettings: async () => {
            const response = await ctx.remote.settings.describe();
            if (!response.ok)
                return undefined;
            return response.value.namespaces.find((ns) => ns.ns === settingsNs);
        },
        describeCredentials: async (refs) => {
            const response = await ctx.remote.credentials.describe([...refs]);
            return response.ok ? response.value : {};
        },
        storeApiKey: async (group, ref, value, expectedRevision) => {
            const stored = await ctx.remote.credentials.set(ref, value);
            if (!stored.ok)
                return stored.error.message;
            // The settings write is revision-guarded like every other write: without
            // it, a concurrent settings change could be silently overwritten while a
            // security-relevant field (the credential reference) is being set.
            const pointed = await ctx.remote.settings.mutate(settingsNs, [
                { op: 'set', path: ['groups', group, 'apiKey'], value: ref },
                { op: 'set', path: ['groups', group, 'enabled'], value: true },
            ], expectedRevision);
            return pointed.ok ? undefined : pointed.error.message;
        },
        writeSettings: async (ops, expectedRevision) => {
            const response = await ctx.remote.settings.mutate(settingsNs, ops, expectedRevision);
            if (response.ok)
                return { kind: 'written', view: response.value };
            const { code, message } = response.error;
            return code === 'settings/conflict' ? { kind: 'conflict', message } : { kind: 'refused', message };
        },
        discoverModels: async (request) => {
            const response = await ctx.remote.llm.discoverModels(settingsNs, request);
            return response.ok
                ? { kind: 'found', models: response.value }
                : { kind: 'refused', message: response.error.message };
        },
    };
}
