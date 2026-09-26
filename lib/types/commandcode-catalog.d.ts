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
 * Subscription tiers, weakest first.
 *
 * The page states a model's gate as a NAME (`Go`, `GOAT`, `Pro`, `Max`). The
 * tiers are CUMULATIVE — which was confirmed by request: an account on
 * `individual-goat` got HTTP 200 for a Go-tier model and a GOAT-tier model, and
 * HTTP 403 `MODEL_NOT_IN_PLAN` for Pro- and Max-tier models. So a model is
 * usable when its gate is at or below the account's own tier.
 *
 * The names are matched case-insensitively because the page spells the cheapest
 * tier `Go` while the plan id uses `goat`; both appear in live data.
 */
export declare const COMMANDCODE_TIERS: readonly string[];
/**
 * Rank one plan name, or undefined when it is not a tier this plugin knows.
 * @param name - the plan name from the page or a plan id.
 * @returns the zero-based rank, weakest first.
 */
export declare function tierRank(name: string | undefined): number | undefined;
/**
 * Extract the tier from a subscription plan id such as `individual-goat`.
 * @param planId - the plan id, if any.
 * @returns the tier name in canonical lower case, or undefined.
 */
export declare function tierFromPlanId(planId: string | undefined): string | undefined;
/**
 * Whether a model's own gate is included in the account's tier.
 *
 * An unknown gate on EITHER side means the question cannot be answered, and the
 * model is kept: hiding a model the account can use is worse than showing one
 * that fails with a clear provider message, and an unrecognized tier name is a
 * catalog change rather than evidence of exclusion.
 * @param modelGate - the model's `minPlanName`.
 * @param accountTier - the account's own tier, lower case.
 * @returns whether to offer the model.
 */
export declare function withinTier(modelGate: string | undefined, accountTier: string | undefined): boolean;
/** One model's capabilities, as the pricing page states them. */
export interface CatalogCapabilities {
    /** Whether the model may be sent a thinking parameter at all. */
    reasoning: boolean;
    /** Whether the model accepts image input. */
    vision: boolean;
    /** Advertised context window in tokens, when the page states one. */
    contextWindow?: number;
    /** Dollars per million input tokens, when published. */
    inputCost?: number;
    /** Dollars per million output tokens, when published. */
    outputCost?: number;
    /** Dollars per million cached input tokens, when published. */
    cacheReadCost?: number;
    /** Lowest subscription tier that includes this model. */
    minPlan?: string;
}
/** How many rows one page payload yielded, and whether the scrape succeeded. */
export interface CatalogScrape {
    /** Capability by model id, empty when the page could not be read. */
    byId: ReadonlyMap<string, CatalogCapabilities>;
    /** Present when the scrape or parse failed; the caller reports it. */
    problem?: string;
}
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
export declare function reassembleFlightPayload(html: string): string;
/**
 * Pull every balanced top-level JSON array that follows a `"models":` key.
 * Brace/bracket counting is done on the raw text rather than by a regex because
 * the array is large and nested; scanning for balance is exact and linear.
 * @param payload - the reassembled payload.
 * @returns the candidate arrays as raw JSON text, largest first.
 */
export declare function modelsArrays(payload: string): string[];
/**
 * Parse one catalog array into capabilities by model id.
 *
 * `reasoning` and `vision` are read from the flat fields first and fall back to
 * `caps`; a row stating neither is skipped rather than guessed at, because a
 * guessed capability is exactly the defect this catalog exists to remove.
 * @param rows - the parsed JSON array.
 * @returns capabilities by id, plus the ids that were discarded.
 */
export declare function parseCatalogRows(rows: unknown): {
    byId: Map<string, CatalogCapabilities>;
    skipped: number;
};
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
export declare function catalogFor(byId: ReadonlyMap<string, CatalogCapabilities>, id: string): CatalogCapabilities | undefined;
/**
 * Read the capability catalog out of a fetched page.
 * @param html - the page body, or undefined when the fetch failed.
 * @param failure - why the page could not be read, when it could not.
 * @returns capabilities by id, with a problem note when the scrape degraded.
 */
export declare function scrapeCatalog(html: string | undefined, failure?: string): CatalogScrape;
/** The page carrying the catalog. */
export declare const COMMANDCODE_CATALOG_URL = "https://commandcode.ai/docs/plans/goat";
/** How long one scraped catalog is reused. The page changes at most daily. */
export declare const CATALOG_TTL_MS: number;
/** Largest page body accepted, in bytes. The live page is ~765 KB. */
export declare const MAX_CATALOG_BYTES: number;
