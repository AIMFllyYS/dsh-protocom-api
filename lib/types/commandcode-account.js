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
import { attributionHeaders, LlmError } from '@deepseek-ai/dsh-llm';
import { parseCommandCodeAccount } from "./commandcode-view.js";
import { COMMANDCODE } from "./commandcode.js";
/** How long one successful account read is reused. */
const CACHE_TTL_MS = 60_000;
/** How long a failed read is left alone before retrying. */
const FAILURE_BACKOFF_MS = 5_000;
/** Largest reply accepted from either endpoint. */
const MAX_RESPONSE_BYTES = 1024 * 1024;
/** Read one endpoint's JSON body, or a failure description. */
async function readJson(baseURL, path, apiKey, signal) {
    const url = baseURL.replace(/\/+$/, '') + path;
    let response;
    try {
        response = await fetch(url, {
            method: 'GET',
            headers: { accept: 'application/json', authorization: `Bearer ${apiKey}`, ...attributionHeaders() },
            ...signal === undefined ? {} : { signal },
        });
    }
    catch (error) {
        return { error: `could not reach ${path}: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (!response.ok)
        return { status: response.status, error: `${path} answered ${response.status}` };
    try {
        const text = await response.text();
        if (text.length > MAX_RESPONSE_BYTES)
            return { error: `${path} answered more than the accepted bound` };
        return { body: JSON.parse(text) };
    }
    catch (error) {
        return { error: `${path} did not answer JSON: ${error instanceof Error ? error.message : String(error)}` };
    }
}
/** Cached reader for one family's account surface. */
export class CommandCodeAccountService {
    hooks;
    cache = new Map();
    failedAt = new Map();
    constructor(hooks) {
        this.hooks = hooks;
    }
    /** Forget cached reads; called when the family's settings change. */
    invalidate() {
        this.cache.clear();
        this.failedAt.delete(COMMANDCODE.ns);
    }
    /**
     * Read the account surface for one group.
     * @param group - the group whose credential authorizes the read.
     * @param signal - caller cancellation.
     * @returns the normalized account state with a per-half outcome.
     */
    async read(group, signal) {
        const { baseURL } = this.hooks.options();
        const apiKey = await this.hooks.resolveApiKey(group);
        // The alpha endpoints live at the ORIGIN root, not under /provider/v1, so
        // the paths are resolved against the origin rather than the provider base.
        const root = new URL(baseURL).origin;
        let credits;
        let usage;
        try {
            ;
            [credits, usage] = await Promise.all([
                COMMANDCODE.creditsPath === undefined
                    ? Promise.resolve({ error: 'no credits endpoint configured' })
                    : readJson(root, COMMANDCODE.creditsPath, apiKey, signal),
                COMMANDCODE.usagePath === undefined
                    ? Promise.resolve({ error: 'no usage endpoint configured' })
                    : readJson(root, COMMANDCODE.usagePath, apiKey, signal),
            ]);
        }
        catch (error) {
            if (signal?.aborted)
                throw new LlmError('Command Code account read aborted by caller', 'ABORTED', { cause: error });
            throw error;
        }
        const view = buildView(credits, usage);
        // A refused credential is the one failure worth surfacing loudly, because
        // it is the one the operator can act on.
        if (credits.status === 401 || credits.status === 403 || usage.status === 401 || usage.status === 403) {
            view.credentialRejected = true;
        }
        for (const half of [credits, usage]) {
            if (half.error !== undefined)
                this.hooks.log(`${COMMANDCODE.ns}: ${half.error}`);
        }
        return view;
    }
    /**
     * Read with the standard cache and failure backoff.
     * @param group - the group whose credential authorizes the read.
     * @param signal - caller cancellation.
     * @returns the cached or freshly read account state.
     */
    async readCached(group, signal) {
        const key = group.key;
        const hit = this.cache.get(key);
        if (hit !== undefined && Date.now() - hit.at < CACHE_TTL_MS)
            return hit.value;
        const failed = this.failedAt.get(key);
        if (failed !== undefined && Date.now() - failed < FAILURE_BACKOFF_MS) {
            // Inside the backoff, answer the last view rather than hammering a failing
            // endpoint; an empty view when there never was one.
            return hit?.value ?? { credits: { reachable: false }, usage: { reachable: false } };
        }
        try {
            const value = await this.read(group, signal);
            this.failedAt.delete(key);
            this.cache.set(key, { at: Date.now(), value });
            return value;
        }
        catch (error) {
            // A failed fetch must not be cached: the next caller retries instead of
            // replaying one outage until the TTL expires.
            this.failedAt.set(key, Date.now());
            this.cache.delete(key);
            throw error;
        }
    }
}
/** Assemble the view from the two halves' outcomes. */
function buildView(credits, usage) {
    const normalized = parseCommandCodeAccount(credits.body, usage.body);
    return {
        ...normalized === undefined ? {} : { account: normalized },
        credits: {
            reachable: credits.error === undefined,
            ...credits.error === undefined ? {} : { error: credits.error },
        },
        usage: {
            reachable: usage.error === undefined,
            ...usage.error === undefined ? {} : { error: usage.error },
        },
    };
}
/** Headers every account answer carries: live and sensitive, never cacheable. */
const JSON_HEADERS = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
};
/**
 * Build the fenced Fetch handler for the Command Code account route.
 * @param service - the cached account reader.
 * @param hooks - the family's options and credential resolution.
 * @returns a handler answering the normalized account view.
 */
export function commandCodeAccountFetchHandler(service, hooks) {
    return async (request) => {
        const url = new URL(request.url);
        const only = url.searchParams.get('group');
        const groups = [...hooks.options().groups.values()].filter(group => group.enabled);
        const selected = only === null ? groups : groups.filter(group => group.key === only);
        if (selected.length === 0) {
            return new Response(JSON.stringify({ account: null, credits: { reachable: false }, usage: { reachable: false } }), {
                status: 200,
                headers: JSON_HEADERS,
            });
        }
        try {
            const view = await service.readCached(selected[0], request.signal);
            return new Response(JSON.stringify(view), { status: 200, headers: JSON_HEADERS });
        }
        catch (error) {
            // The detail goes to the local log; the reply stays a fixed shape so an
            // upstream message cannot reach the browser.
            hooks.log(`${COMMANDCODE.ns}: account read failed: ${error instanceof Error ? error.message : String(error)}`);
            return new Response(JSON.stringify({
                account: null,
                credits: { reachable: false, error: 'account read failed' },
                usage: { reachable: false, error: 'account read failed' },
            }), { status: 502, headers: JSON_HEADERS });
        }
    };
}
