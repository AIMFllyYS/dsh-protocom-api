/**
 * Web client half of the Protocom API plugin: registers the copy namespace,
 * injects the section stylesheet, and contributes the `protocom-api` section
 * to the settings page (`settings.section` slot). The Host half resolves the
 * API keys the section stores and serves the balance endpoint it reads.
 *
 * @module dsh-protocom-api/client
 */
import { ProtocomSection } from "./ProtocomSection.js";
import { createProtocomOperations } from "./operations.js";
import { en, zh } from "./locale.js";
import { SECTION_CSS } from "./styles.js";
/** The locale namespace this section owns. */
const NS = 'settings.protocom';
export const inject = [
    'slots',
    'locale',
    'remote',
    'remote.credentials',
    'remote.llm',
    'remote.settings',
];
/** Wire the section into the settings page. */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }));
    const operations = createProtocomOperations(ctx);
    const t = ctx.locale.bind(NS);
    const injected = () => ({ operations, t });
    ctx.effect(() => {
        const tag = document.createElement('style');
        tag.dataset['plugin'] = 'dsh-protocom-api';
        tag.textContent = SECTION_CSS;
        document.head.appendChild(tag);
        return () => { tag.remove(); };
    });
    ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'protocom-api',
        order: 20,
        label: () => t('nav'),
        inject: injected,
    }, ProtocomSection));
}
