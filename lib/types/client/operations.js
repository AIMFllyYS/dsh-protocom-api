/**
 * The Host reads and writes the Protocom section performs, as callbacks built
 * in the plugin body. The section receives these instead of a context: the
 * outcomes name what a card renders, so failure codes and Remote namespaces
 * stay in the apply world.
 */
/** The settings namespace the Host half owns. */
export const SETTINGS_NS = 'protocom-api';
/**
 * Bind the section's Host operations to the plugin's own Remote namespaces.
 * @param ctx - the plugin's context, which declares `remote.credentials`,
 * `remote.llm`, and `remote.settings` in its own `inject`.
 */
export function createProtocomOperations(ctx) {
    return {
        describeSettings: async () => {
            const response = await ctx.remote.settings.describe();
            if (!response.ok)
                return undefined;
            return response.value.namespaces.find((ns) => ns.ns === SETTINGS_NS);
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
            const pointed = await ctx.remote.settings.mutate(SETTINGS_NS, [
                { op: 'set', path: ['groups', group, 'apiKey'], value: ref },
                { op: 'set', path: ['groups', group, 'enabled'], value: true },
            ], expectedRevision);
            return pointed.ok ? undefined : pointed.error.message;
        },
        writeSettings: async (ops, expectedRevision) => {
            const response = await ctx.remote.settings.mutate(SETTINGS_NS, ops, expectedRevision);
            if (response.ok)
                return { kind: 'written', view: response.value };
            const { code, message } = response.error;
            return code === 'settings/conflict' ? { kind: 'conflict', message } : { kind: 'refused', message };
        },
        discoverModels: async (request) => {
            const response = await ctx.remote.llm.discoverModels(SETTINGS_NS, request);
            return response.ok
                ? { kind: 'found', models: response.value }
                : { kind: 'refused', message: response.error.message };
        },
    };
}
