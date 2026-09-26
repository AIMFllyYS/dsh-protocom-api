/**
 * Web client half of the Protocom API plugin: registers the copy namespace,
 * injects the section stylesheet, and contributes the `protocom-api` section
 * to the settings page (`settings.section` slot). The Host half resolves the
 * API keys the section stores and serves the balance endpoint it reads.
 *
 * @module dsh-protocom-api/client
 */
import { COMMANDCODE } from "../commandcode.js";
import { OPENCODE_GO, PROTOCOM } from "../family.js";
import { FUSION_NS } from "../fusion.js";
import { ProtocomSection } from "./ProtocomSection.js";
import { FusionSection } from "./FusionSection.js";
import { createProtocomOperations } from "./operations.js";
import { createFusionOperations } from "./fusion-operations.js";
import { en, zh } from "./locale.js";
import { SECTION_CSS } from "./styles.js";
/** The locale namespace this section owns. */
const NS = 'settings.protocom';
/**
 * Required services. Deliberately NOT including the Fusion-only two
 * (`remote.session`, `configForms`): a missing entry here deactivates the
 * whole client plugin, which would take the working provider panels down with
 * a feature they do not depend on. Fusion declares its own dependencies in a
 * scoped `ctx.inject` below instead, so an unusual deployment loses the Fusion
 * section and nothing else — the same trade the Host half makes for
 * `connection`.
 */
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
    // Built once, not per injection: obtaining a config form subscribes on this
    // plugin's fiber, so a fresh one on every inject call would accumulate
    // subscriptions for as long as the plugin lives. The face is lazy so
    // constructing it here never touches a service the deployment may lack.
    /** Whether this deployment exposes the two services the Fusion section reads. */
    const fusionAvailable = () => ctx.get('remote') !== undefined
        && ctx.remote.session !== undefined
        && ctx.get('configForms') !== undefined;
    let fusionOperations;
    const fusionInjected = () => {
        fusionOperations ??= createFusionOperations(ctx);
        return {
            operations: fusionOperations,
            t,
            copy: { title: t('titleFusion'), intro: t('introFusion') },
        };
    };
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
        const commandcode = ctx.slots.register({
            name: 'settings.section',
            id: COMMANDCODE.ns,
            order: 23,
            label: () => t('navCommandCode'),
            inject: injectedFor(COMMANDCODE, 'titleCommandCode', 'introCommandCode'),
        }, ProtocomSection);
        // Fusion additionally needs the Host catalog and the settings scope. They
        // are probed rather than declared in the plugin's own `inject`, so their
        // absence removes only this one section instead of deactivating the client
        // plugin and taking the provider panels with it.
        const fusion = fusionAvailable()
            ? ctx.slots.register({
                name: 'settings.section',
                id: FUSION_NS,
                order: 22,
                label: () => t('navFusion'),
                inject: fusionInjected,
            }, FusionSection)
            : () => { };
        return () => { protocom(); go(); commandcode(); fusion(); };
    });
}
