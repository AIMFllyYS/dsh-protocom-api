/**
 * Web client half of the Protocom API plugin: registers the copy namespace,
 * injects the section stylesheet, and contributes the `protocom-api` section
 * to the settings page (`settings.section` slot). The Host half resolves the
 * API keys the section stores and serves the balance endpoint it reads.
 *
 * @module dsh-protocom-api/client
 */
import { OPENCODE_GO, PROTOCOM } from "../family.js";
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
/** Wire both provider sections into the settings page. */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }));
    const t = ctx.locale.bind(NS);
    const injectedFor = (family, titleKey, introKey) => () => ({
        operations: createProtocomOperations(ctx, family.ns),
        t,
        family,
        copy: { title: t(titleKey), intro: t(introKey) },
    });
    ctx.effect(() => {
        const tag = document.createElement('style');
        tag.dataset['plugin'] = 'dsh-protocom-api';
        tag.textContent = SECTION_CSS;
        document.head.appendChild(tag);
        return () => { tag.remove(); };
    });
    ctx.slots.inject('settings.section', () => {
        const protocom = ctx.slots.register({
            name: 'settings.section',
            id: PROTOCOM.ns,
            order: 20,
            label: () => t('nav'),
            inject: injectedFor(PROTOCOM, 'title', 'intro'),
        }, ProtocomSection);
        const go = ctx.slots.register({
            name: 'settings.section',
            id: OPENCODE_GO.ns,
            order: 21,
            label: () => t('navGo'),
            inject: injectedFor(OPENCODE_GO, 'titleGo', 'introGo'),
        }, ProtocomSection);
        return () => { protocom(); go(); };
    });
}
