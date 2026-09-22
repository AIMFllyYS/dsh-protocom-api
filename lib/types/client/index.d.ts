/**
 * Web client half of the Protocom API plugin: registers the copy namespace,
 * injects the section stylesheet, and contributes the `protocom-api` section
 * to the settings page (`settings.section` slot). The Host half resolves the
 * API keys the section stores and serves the balance endpoint it reads.
 *
 * @module dsh-protocom-api/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { ProtocomKey } from './locale.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'settings.protocom': ProtocomKey;
    }
}
/**
 * Required services. Deliberately NOT including the Fusion-only two
 * (`remote.session`, `settingsScope`): a missing entry here deactivates the
 * whole client plugin, which would take the working provider panels down with
 * a feature they do not depend on. Fusion declares its own dependencies in a
 * scoped `ctx.inject` below instead, so an unusual deployment loses the Fusion
 * section and nothing else — the same trade the Host half makes for
 * `connection`.
 */
export declare const inject: string[];
/** Wire both provider sections into the settings page. */
export declare function apply(ctx: ClientContext): void;
