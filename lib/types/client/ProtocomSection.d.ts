/**
 * Provider settings section — shared by the Protocom and OpenCode Go
 * families: one collapsible card per group. A card carries the group's own
 * enable switch, API key, and — the step that follows saving a key — the
 * exact models that group contributes to the model menu, one control row
 * each for visibility, context lengths, image input, and menu priority. The
 * endpoint's raw listing (model ↔ upstream id) stays behind a collapsed row:
 * it is a diagnostic, not a setting. Every mutation writes through the wire
 * (settings.mutate / credentials.set) scoped to the family's own namespace;
 * the page reloads its snapshot after each landed write.
 */
import type { ReactNode } from 'react';
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots';
import type { ProviderFamily } from '../family.ts';
import type { GroupBalance } from '../balance-view.ts';
import type { GoUsageView } from '../usage-view.ts';
import type { CommandCodeAccountView } from '../commandcode-view.ts';
import type { ProtocomOperations } from './operations.ts';
import type { en } from './locale.ts';
/** Injected dependencies of {`link ProviderSection} (slot `inject`). */
export interface ProtocomInjected {
    /** The Host operations the section invokes, scoped to the family. */
    operations: ProtocomOperations;
    /** Section copy. */
    t: (key: keyof typeof en) => string;
    /** Which provider family this section instance serves. */
    family: ProviderFamily;
    /** The family's heading copy, resolved through `t` at inject time. */
    copy: {
        title: string;
        intro: string;
    };
}
/**
 * Props delivered by the slot outlet: the inject face spread flat (absent
 * pieces mean the shell has not injected yet, and the section renders null).
 */
export type ProtocomSectionProps = Partial<InjectFace<ProtocomInjected>>;
type Translator = (key: keyof typeof en) => string;
/** The quota strip of a Go group card: the subscription's three rate windows. */
export declare function QuotaView({ usage, phase, error, onRefresh, t }: {
    usage: GoUsageView | undefined;
    phase: 'idle' | 'loading' | 'ready' | 'error';
    error: string | undefined;
    onRefresh: () => void;
    t: Translator;
}): ReactNode;
/**
 * The Command Code account strip: remaining credits, the two rolling dollar
 * windows, and the period's usage totals.
 *
 * Every figure is a dollar amount or a count the endpoint actually stated. The
 * monthly number is a BALANCE whose pool size is never published, so it renders
 * as an amount rather than being forced into a percentage.
 */
export declare function AccountView({ view, phase, error, onRefresh, t }: {
    view: CommandCodeAccountView | undefined;
    phase: 'idle' | 'loading' | 'ready' | 'error';
    error: string | undefined;
    onRefresh: () => void;
    t: Translator;
}): ReactNode;
/** The balance strip of one group card. */
export declare function BalanceView({ group, balance, phase, error, onRefresh, t }: {
    group: string;
    balance: GroupBalance | undefined;
    phase: 'idle' | 'loading' | 'ready' | 'error';
    error: string | undefined;
    onRefresh: () => void;
    t: Translator;
}): ReactNode;
/**
 * Render the Protocom API section content column.
 * `param props - slot-delivered injected dependencies.
 * `returns the section, or null while the shell has not injected yet.
 */
export declare function ProtocomSection(props: ProtocomSectionProps): ReactNode;
export {};
