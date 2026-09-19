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
export declare const inject: string[];
/** Wire the section into the settings page. */
export declare function apply(ctx: ClientContext): void;
