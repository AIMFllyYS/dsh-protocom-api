/**
 * The Command Code account surface handler: reads the two `/alpha/*` endpoints
 * and answers the normalized shape the settings strip renders.
 *
 * Mirrors `balance.ts`/`go-usage.ts`: a cached service plus a fenced Fetch
 * route, so the account panel rides the Host's own trust fence (the Web
 * carrier's Host/Origin check plus browser cookie, or the desktop IPC boundary)
 * rather than an unauthenticated exact route.
 *
 * Every endpoint degrades independently: a failure on one half is reported for
 * that half and never blanks the other, which is what keeps a partial outage
 * from looking like an empty account.
 *
 * @module dsh-protocom-api/commandcode-account
 */
import type { CommandCodeAccount } from './commandcode-view.ts';
import type { ResolvedGroup, ResolvedProtocomOptions } from './config.ts';
/** One half's outcome, so a failure is reported per endpoint. */
export interface CommandCodeHalf {
    reachable: boolean;
    /** Failure text when this half could not be read; absent on success. */
    error?: string;
}
/** One account read's answer. */
export interface CommandCodeAccountView {
    account?: CommandCodeAccount;
    credits: CommandCodeHalf;
    usage: CommandCodeHalf;
    /** Whether the credential itself was refused, which is the actionable case. */
    credentialRejected?: true;
}
/** The hooks the account service closes over. */
export interface CommandCodeAccountHooks {
    options: () => ResolvedProtocomOptions;
    resolveApiKey: (group: ResolvedGroup) => Promise<string>;
    log: (message: string) => void;
}
/** Cached reader for one family's account surface. */
export declare class CommandCodeAccountService {
    private readonly hooks;
    private readonly cache;
    private readonly failedAt;
    constructor(hooks: CommandCodeAccountHooks);
    /** Forget cached reads; called when the family's settings change. */
    invalidate(): void;
    /**
     * Read the account surface for one group.
     * @param group - the group whose credential authorizes the read.
     * @param signal - caller cancellation.
     * @returns the normalized account state with a per-half outcome.
     */
    read(group: ResolvedGroup, signal?: AbortSignal): Promise<CommandCodeAccountView>;
    /**
     * Read with the standard cache and failure backoff.
     * @param group - the group whose credential authorizes the read.
     * @param signal - caller cancellation.
     * @returns the cached or freshly read account state.
     */
    readCached(group: ResolvedGroup, signal?: AbortSignal): Promise<CommandCodeAccountView>;
}
/**
 * Build the fenced Fetch handler for the Command Code account route.
 * @param service - the cached account reader.
 * @param hooks - the family's options and credential resolution.
 * @returns a handler answering the normalized account view.
 */
export declare function commandCodeAccountFetchHandler(service: CommandCodeAccountService, hooks: CommandCodeAccountHooks): (request: Request) => Promise<Response>;
