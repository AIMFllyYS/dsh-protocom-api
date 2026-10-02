/**
 * Web client half of the Protocom API plugin: registers the copy namespace,
 * injects the section stylesheet, and contributes the `protocom-api` section
 * to the settings page (`settings.section` slot). The Host half resolves the
 * API keys the section stores and serves the balance endpoint it reads.
 *
 * @module dsh-protocom-api/client
 */
import { COMMANDCODE } from "../commandcode.js";
import { CLINEPASS } from "../clinepass.js";
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
 * a feature they do not depend on. Fusion declares its own dependencies in the
 * scoped `ctx.inject` in {@link apply} instead, so an unusual deployment loses
 * the Fusion section and nothing else: the same trade the Host half makes for
 * `connection`. That scoped declaration is also the ONLY legal way to read
 * those two services. cordis throws `cannot get property "…" without inject`
 * for an undeclared read even when the service is fully active, and optional
 * chaining does not prevent that throw - `ctx.sessions?.x` throws too, because
 * the throw happens on the property get, before `?.` is reached.
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
        operations: createProtocomOperations(ctx, family),
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
    // Memoized per applied Fusion fiber. `fusionInjected` runs on every render of
    // the slot, and obtaining a config form subscribes on the fiber that asked, so
    // building a fresh face per render would accumulate subscriptions for as long
    // as that fiber lives. It is re-assigned whenever the scoped dependency fiber
    // re-applies, so a replaced scope is never read through a stale face.
    let fusionOperations;
    const fusionInjected = () => ({
        operations: fusionOperations,
        t,
        copy: { title: t('titleFusion'), intro: t('introFusion') },
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
        const commandcode = ctx.slots.register({
            name: 'settings.section',
            id: COMMANDCODE.ns,
            order: 23,
            label: () => t('navCommandCode'),
            inject: injectedFor(COMMANDCODE, 'titleCommandCode', 'introCommandCode'),
        }, ProtocomSection);
        const clinepass = ctx.slots.register({
            name: 'settings.section',
            id: CLINEPASS.ns,
            order: 24,
            label: () => t('navClinePass'),
            inject: injectedFor(CLINEPASS, 'titleClinePass', 'introClinePass'),
        }, ProtocomSection);
        // Fusion additionally needs the Host catalog and the settings scope. They
        // are declared on a SCOPED fiber rather than in the plugin's own `inject`,
        // so their absence removes only this one section instead of deactivating
        // the client plugin and taking the provider panels with it. Unlike a
        // one-shot availability probe, a scoped declaration is also the only legal
        // way to READ them: an undeclared read throws `cannot get property "…"
        // without inject` even once the service is active, and `remote.session` is
        // a Remote namespace mounted late by an async Host handshake. Declaring the
        // dependency defers this registration until both are genuinely live, and
        // re-applies it if either is ever replaced, so the section appears whenever
        // the deployment can actually serve it.
        //
        // This must stay nested inside `apply`'s fiber: a scope inherits only the
        // inject names its ancestors already declared, so the `ctx.remote.session`
        // read below resolves solely because `apply` declares `remote` for itself.
        // Hoisting this call out of `apply` would make that read throw for want of
        // `remote`, even with both dependencies mounted.
        const fusion = ctx.inject(['remote.session', 'configForms'], (fusionCtx) => {
            // Rebuilt per apply rather than memoized: the form subscribes on the
            // fiber that obtained it, so a face kept across fibers would hold a stale
            // subscription to a disposed scope.
            fusionOperations = createFusionOperations(fusionCtx, t);
            return fusionCtx.slots.register({
                name: 'settings.section',
                id: FUSION_NS,
                order: 22,
                label: () => t('navFusion'),
                inject: fusionInjected,
            }, FusionSection);
        });
        return () => {
            protocom();
            go();
            commandcode();
            clinepass();
            void fusion.dispose();
        };
    });
}
