/**
 * The Command Code capability catalog: what the models in the endpoints listing
 * can actually do.
 *
 * The endpoints listing (`/provider/v1/models`) is the ROUTING truth — it alone
 * declares which wire serves each model — but it discloses no capability at all.
 * The marketing page `/docs/plans/goat` is the CAPABILITY truth: it embeds a
 * structured catalog in its Next.js streaming payload carrying `reasoning`,
 * `vision`, `contextWindow`, pricing, and a plan gate per model.
 *
 * This module owns the join and the parsing. It is deliberately tolerant: the
 * page is a SCRAPED, undocumented surface, so every failure degrades to "no
 * capability claims" rather than to an empty menu. A model with no catalog row
 * keeps the permissive vision default and simply offers no Effort submenu —
 * exactly the behavior this plugin had before the catalog existed.
 *
 * Verified live 2026-09-23 (83 rows; snapshots under `.agents/`).
 *
 * @module dsh-protocom-api/commandcode-catalog
 */
/**
 * Longest model id kept from the page. Mirrors the discovery parser's bound so
 * a hostile page cannot push a large string into the catalog.
 */
const MAX_ID_LENGTH = 256;
/** Upper bound on rows accepted; the live page carries 83. */
const MAX_CATALOG_ROWS = 1_000;
/**
 * Reassemble the Next.js RSC payload a page streams through
 * `self.__next_f.push([1, "..."]) ` fragments.
 *
 * Each fragment argument is a JSON string whose concatenation forms the payload,
 * so reassembly is exactly "parse each fragment as a JSON string, then join".
 * A malformed fragment is skipped rather than failing the whole page.
 * @param html - the page body.
 * @returns the concatenated payload.
 */
export function reassembleFlightPayload(html) {
    const fragments = [];
    const pattern = /self\.__next_f\.push\(\[1,\s*("(?:[^"\\]|\\.)*")\]\)/g;
    for (const match of html.matchAll(pattern)) {
        try {
            fragments.push(JSON.parse(match[1]));
        }
        catch {
            // A fragment that is not a valid JSON string carries nothing usable.
        }
    }
    return fragments.join('');
}
/**
 * Pull every balanced top-level JSON array that follows a `"models":` key.
 * Brace/bracket counting is done on the raw text rather than by a regex because
 * the array is large and nested; scanning for balance is exact and linear.
 * @param payload - the reassembled payload.
 * @returns the candidate arrays as raw JSON text, largest first.
 */
export function modelsArrays(payload) {
    const marker = '"models":[';
    const found = [];
    let at = payload.indexOf(marker);
    while (at !== -1) {
        const start = at + marker.length - 1;
        let depth = 0;
        let end = -1;
        let inString = false;
        let escaped = false;
        for (let index = start; index < payload.length; index += 1) {
            const char = payload[index];
            if (inString) {
                if (escaped)
                    escaped = false;
                else if (char === '\\')
                    escaped = true;
                else if (char === '"')
                    inString = false;
                continue;
            }
            if (char === '"')
                inString = true;
            else if (char === '[')
                depth += 1;
            else if (char === ']') {
                depth -= 1;
                if (depth === 0) {
                    end = index;
                    break;
                }
            }
        }
        if (end !== -1)
            found.push(payload.slice(start, end + 1));
        at = payload.indexOf(marker, at + 1);
    }
    return found.sort((left, right) => right.length - left.length);
}
/** A finite, non-negative number, or undefined. */
function nonNegative(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}
/**
 * Parse one catalog array into capabilities by model id.
 *
 * `reasoning` and `vision` are read from the flat fields first and fall back to
 * `caps`; a row stating neither is skipped rather than guessed at, because a
 * guessed capability is exactly the defect this catalog exists to remove.
 * @param rows - the parsed JSON array.
 * @returns capabilities by id, plus the ids that were discarded.
 */
export function parseCatalogRows(rows) {
    const byId = new Map();
    if (!Array.isArray(rows))
        return { byId, skipped: 0 };
    let skipped = 0;
    for (const raw of rows.slice(0, MAX_CATALOG_ROWS)) {
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
            skipped += 1;
            continue;
        }
        const row = raw;
        const id = typeof row.id === 'string' && row.id.length > 0 && row.id.length <= MAX_ID_LENGTH ? row.id : undefined;
        const reasoning = typeof row.reasoning === 'boolean' ? row.reasoning : row.caps?.reasoning;
        const vision = typeof row.vision === 'boolean' ? row.vision : row.caps?.vision;
        if (id === undefined || typeof reasoning !== 'boolean' || typeof vision !== 'boolean') {
            skipped += 1;
            continue;
        }
        const contextWindow = nonNegative(row.contextWindow);
        const inputCost = nonNegative(row.inputCost);
        const outputCost = nonNegative(row.outputCost);
        const cacheReadCost = nonNegative(row.cacheReadCost);
        const minPlan = typeof row.minPlanName === 'string' && row.minPlanName.length > 0 ? row.minPlanName : undefined;
        byId.set(id, {
            reasoning,
            vision,
            ...contextWindow === undefined || contextWindow === 0 ? {} : { contextWindow },
            ...inputCost === undefined ? {} : { inputCost },
            ...outputCost === undefined ? {} : { outputCost },
            ...cacheReadCost === undefined ? {} : { cacheReadCost },
            ...minPlan === undefined ? {} : { minPlan },
        });
    }
    return { byId, skipped };
}
/**
 * Resolve one listing id against the catalog, tolerating the page's habit of
 * vendor-prefixing an otherwise identical id (`stealth/space-bunny-alpha` for a
 * listing's `space-bunny-alpha`).
 *
 * The fallback is a suffix match on the last path segment, which is what the
 * live data needs: 81 of 82 listing rows join this way, and the single miss is a
 * dated snapshot id the page does not carry.
 * @param byId - the parsed catalog.
 * @param id - the listing id to resolve.
 * @returns that model's capabilities, or undefined when the page omitted it.
 */
export function catalogFor(byId, id) {
    const exact = byId.get(id);
    if (exact !== undefined)
        return exact;
    // The listing uses BARE ids ("space-bunny-alpha") while the page often
    // vendor-prefixes the same model ("stealth/space-bunny-alpha"), so the tail
    // is compared in BOTH directions: the page's key may be prefixed, or the
    // listing's id may be. Matching only one direction silently loses every
    // prefixed model — which is most of this catalog.
    const tail = (value) => {
        const slash = value.lastIndexOf('/');
        return slash === -1 ? value : value.slice(slash + 1);
    };
    const wanted = tail(id);
    for (const [key, value] of byId) {
        if (tail(key) === wanted)
            return value;
    }
    return undefined;
}
/**
 * Read the capability catalog out of a fetched page.
 * @param html - the page body, or undefined when the fetch failed.
 * @param failure - why the page could not be read, when it could not.
 * @returns capabilities by id, with a problem note when the scrape degraded.
 */
export function scrapeCatalog(html, failure) {
    if (html === undefined)
        return { byId: new Map(), problem: failure ?? 'the capability page could not be read' };
    const payload = reassembleFlightPayload(html);
    if (payload.length === 0)
        return { byId: new Map(), problem: 'the capability page carried no readable payload' };
    const candidates = modelsArrays(payload);
    if (candidates.length === 0)
        return { byId: new Map(), problem: 'the capability page carried no model catalog' };
    for (const candidate of candidates) {
        let parsed;
        try {
            parsed = JSON.parse(candidate);
        }
        catch {
            continue;
        }
        const { byId } = parseCatalogRows(parsed);
        if (byId.size > 0)
            return { byId };
    }
    return { byId: new Map(), problem: 'the capability catalog did not parse' };
}
/** The page carrying the catalog. */
export const COMMANDCODE_CATALOG_URL = 'https://commandcode.ai/docs/plans/goat';
/** How long one scraped catalog is reused. The page changes at most daily. */
export const CATALOG_TTL_MS = 6 * 60 * 60 * 1_000;
/** Largest page body accepted, in bytes. The live page is ~765 KB. */
export const MAX_CATALOG_BYTES = 8 * 1024 * 1024;
