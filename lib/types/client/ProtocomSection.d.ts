/**
 * Protocom API settings section: one card per group (enable switch, API key,
 * read-only protocol tag, model probe with context-variant checkboxes, and
 * the balance strip), plus the advanced baseURL override. Every mutation
 * writes through the wire (settings.mutate / credentials.set); the page
 * reloads its snapshot after each landed write.
 */
import type { ReactNode } from 'react';
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots';
import type { GroupKey } from '../groups.ts';
import type { GroupBalance } from '../balance-view.ts';
import type { ProtocomOperations } from './operations.ts';
import type { en } from './locale.ts';
/** Injected dependencies of {@link ProtocomSection} (slot `inject`). */
export interface ProtocomInjected {
    /** The Host operations the section invokes. */
    operations: ProtocomOperations;
    /** Section copy. */
    t: (key: keyof typeof en) => string;
}
/**
 * Props delivered by the slot outlet: the inject face spread flat (absent
 * pieces mean the shell has not injected yet, and the section renders null).
 */
export type ProtocomSectionProps = Partial<InjectFace<ProtocomInjected>>;
type Translator = (key: keyof typeof en) => string;
/** The balance strip of one group card. */
export declare function BalanceView({ group, balance, phase, error, onRefresh, t }: {
    group: GroupKey;
    balance: GroupBalance | undefined;
    phase: 'idle' | 'loading' | 'ready' | 'error';
    error: string | undefined;
    onRefresh: () => void;
    t: Translator;
}): ReactNode;
/**
 * Render the Protocom API section content column.
 * @param props - slot-delivered injected dependencies.
 * @returns the section, or null while the shell has not injected yet.
 */
export declare function ProtocomSection(props: ProtocomSectionProps): ReactNode;
export {};
