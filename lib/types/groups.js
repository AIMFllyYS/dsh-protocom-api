/**
 * The four Protocom official API groups and their shipped defaults. Pure
 * metadata with zero imports: the Host config schema and the browser client
 * both read from here.
 *
 * @module dsh-protocom-api/groups
 */
/** The four groups this plugin serves; the config dict key IS the group. */
export const GROUP_KEYS = ['aggregate', 'codex', 'stepfun', 'grok'];
/** Per-group shipped defaults. */
export const GROUP_DEFAULTS = {
    aggregate: { displayName: 'Protocom Aggregate', protocol: 'chat-completions' },
    codex: {
        displayName: 'Protocom Codex',
        protocol: 'responses',
        reasoning: { efforts: ['minimal', 'low', 'medium', 'high', 'xhigh'], defaultEffort: 'medium' },
    },
    stepfun: { displayName: 'Protocom StepFun', protocol: 'chat-completions' },
    grok: {
        displayName: 'Protocom Grok',
        protocol: 'chat-completions',
        reasoning: { efforts: ['low', 'high'], defaultEffort: 'high' },
    },
};
/** The provider route one group registers under. */
export function providerOf(key) {
    return `protocom-${key}`;
}
/** The group behind one provider route, or `undefined` for a foreign route. */
export function groupOf(provider) {
    if (!provider.startsWith('protocom-'))
        return undefined;
    const key = provider.slice('protocom-'.length);
    return GROUP_KEYS.includes(key) ? key : undefined;
}
/** The conventional credential reference one group's API key is stored under. */
export function defaultKeyRef(key) {
    return `PROTOCOM_${key.toUpperCase()}_API_KEY`;
}
