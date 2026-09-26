/**
 * Per-model reasoning-effort vocabulary for the Command Code gateway.
 *
 * The endpoints listing carries routing truth only: its rows are exactly
 * id/object/created/owned_by/name/context_length/supported_endpoints, with no
 * reasoning field of any kind. The vendor capability page says whether a model can
 * reason at all, but publishes no effort list either -- so on its own the menu had a
 * boolean and nothing to render, and no model ever offered an Effort choice.
 *
 * These tiers come from the vendor own CLI catalog, which the CLI uses for its
 * `model:effort` shorthand:
 *   https://unpkg.com/command-code@latest/dist/bundled/command-code-knowledge/reference/models.md
 * Snapshot archived at .agents/commandcode-models-md-2026-09-27.md.
 *
 * VERIFIED 2026-09-27: the catalog lists 82 models and the live endpoints listing
 * returned 82 rows, joining 82/82 on the EXACT id. Tiers are per-model and NOT
 * uniform, so one group-wide vocabulary would send levels a model refuses.
 *
 * An empty list means the model chooses its own depth: the CLI accepts no effort for
 * it, so sending one would be an unsupported field. Such a model is offered no
 * Effort control rather than a fabricated one.
 *
 * @module dsh-protocom-api/commandcode-tiers
 */
import type { RegistryReasoning } from './model-registry.ts';
/**
 * The effort vocabulary this gateway accepts for one upstream id.
 * @param upstreamId - the model id as the endpoints listing reports it.
 * @returns its efforts, or undefined when it takes none or is unknown.
 */
export declare function commandCodeReasoning(upstreamId: string): RegistryReasoning | undefined;
