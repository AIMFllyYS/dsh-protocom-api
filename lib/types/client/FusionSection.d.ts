/**
 * Fusion dual-model settings section: a status card on the settings page whose
 * Configure button opens the seat editor. The editor stages both seats and the
 * two switches locally and commits them as ONE revision-fenced mutation, so a
 * half-configured pair is never stored. Saving also soft-applies the leader
 * (default model, then the current top-level Session) unless the deployment
 * turned that off — the composer can still switch away, which is what makes it
 * soft rather than a lock.
 *
 * Model options come from the Host catalog the composer itself uses, so the
 * list is exactly the enabled providers' selectable models, and each context
 * variant (`::ctx@N`) is its own row because choosing a context is choosing
 * that row.
 */
import type { ReactNode } from 'react';
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots';
import type { RegistryPricing } from '../model-registry.ts';
import type { FusionOperations } from './fusion-operations.ts';
import type { en } from './locale.ts';
/** Injected dependencies of the Fusion section (slot `inject`). */
export interface FusionInjected {
    /** The Host operations the editor invokes. */
    operations: FusionOperations;
    /** Section copy. */
    t: (key: keyof typeof en) => string;
    /** The section's heading copy, resolved through `t` at inject time. */
    copy: {
        title: string;
        intro: string;
    };
}
/** Props delivered by the slot outlet. */
export type FusionSectionProps = Partial<InjectFace<FusionInjected>>;
/** One seat's slot on the cost strip: its published price, when it has one. */
export interface CostRow {
    key: 'seatLeader' | 'seatCoder';
    pricing: RegistryPricing | undefined;
    /** Share of the combined input+output price, as a percentage of the priced total. */
    share: number;
}
/**
 * Compute the cost strip's shares.
 *
 * Pricing comes from this plugin's own registry, and no entry currently carries
 * a `pricing` block — the endpoints publish no price list this plugin can
 * verify, so every row renders its "no published price" state today. The
 * computation is real rather than stubbed so that filling in registry pricing
 * is all it takes for the strip to light up.
 * @param leader - the leader seat's published price, if any.
 * @param coder - the coder seat's published price, if any.
 * @returns one row per seat, in strip order, and the priced total.
 */
export declare function costBreakdown(leader: RegistryPricing | undefined, coder: RegistryPricing | undefined): {
    rows: CostRow[];
    total: number;
};
/**
 * Render the Fusion settings section and, on demand, its seat editor.
 * @param props - locale copy, the injected Host operations, and the heading.
 * @returns the section, or nothing until the shell injects.
 */
export declare function FusionSection(props: FusionSectionProps): ReactNode;
