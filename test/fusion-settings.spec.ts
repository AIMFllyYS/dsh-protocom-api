/**
 * Fusion against the Loader entry's volatile config — the 1.7 seam.
 *
 * DSH 1.7 removed settings-namespace registration: a plugin's own `Config` IS
 * its form, and a section marked `.volatile()` arrives as a reference the Host
 * updates in place. What this file exercises is therefore not "install a
 * section and mutate it" (the Host owns that write path) but this plugin's own
 * contract over it: the section is read LIVE, so a committed change reaches the
 * very next request, and a section that stops making sense leaves the last good
 * routing rule in force instead of taking the turn down with it.
 */
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { agentEvents } from '@deepseek-ai/dsh-agent'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'
import { FusionSection } from '../src/config.ts'
import type { FusionConfig } from '../src/fusion.ts'
import { mountFusion } from '../src/fusion-host.ts'

/**
 * One volatile reference with cosmokit's semantics: `get()` returns a stable
 * snapshot, and a write REPLACES it rather than mutating in place. That
 * identity change is exactly what the Host relies on to make a live read cheap,
 * so a fake that mutated in place would hide a stale-cache bug.
 * @param initial - the resolved section the reference starts at.
 * @returns the reference plus the write a committed settings edit performs.
 */
function volatileRef(initial: FusionConfig): { get(): FusionConfig; write(next: FusionConfig): void } {
  let current = initial
  return { get: () => current, write: (next) => { current = next } }
}

const CODER = { provider: 'coder-route', model: 'coder-model', reasoningEffort: 'low' }

/** Mount Fusion over a fresh volatile reference, returning both. */
function bench(initial: Record<string, unknown> = {}) {
  const ctx = new Context()
  const ref = volatileRef(FusionSection(initial as never))
  const fusion = mountFusion(ctx, () => ref.get())
  return { ctx, fusion, ref }
}

/** A section that enables Fusion with both seats present. */
function enabled(patch: Record<string, unknown> = {}): FusionConfig {
  return FusionSection({
    enabled: true,
    leader: { provider: 'leader-route', model: 'leader-model' },
    coder: CODER,
    ...patch,
  } as never)
}

function agentFor(header: { origin?: 'subagent'; isSeeded?: boolean }): never {
  return { id: 'a', session: { id: 's', header: { version: 3, id: 's', createdAt: 0, ...header } } } as never
}

async function routeFor(ctx: Context, header: { origin?: 'subagent'; isSeeded?: boolean }): Promise<LlmCallConfig> {
  return await agentEvents(ctx, agentFor(header)).waterfall(
    'agent/request',
    { turn: 1, step: 0, signal: new AbortController().signal },
    () => Promise.resolve({ provider: 'leader-route', model: 'leader-model' } as LlmCallConfig),
  )
}

describe('Fusion over the live volatile section (T4)', () => {
  it('starts from the entry\'s resolved section', () => {
    const { fusion } = bench()
    expect(fusion.current()).toMatchObject({ enabled: false, includeForks: true, applyLeader: true })
  })

  it('leaves a subagent on the leader route while disabled', async () => {
    const { ctx } = bench()
    expect((await routeFor(ctx, { origin: 'subagent' })).provider).toBe('leader-route')
  })

  it('routes a subagent onto the coder seat after a committed write', async () => {
    const { ctx, fusion, ref } = bench()
    ref.write(enabled({ leader: { provider: 'leader-route', model: 'leader-model', reasoningEffort: 'high' } }))
    expect(fusion.current().enabled).toBe(true)
    const child = await routeFor(ctx, { origin: 'subagent', isSeeded: false })
    expect(child.provider).toBe(CODER.provider)
    expect(child.model).toBe(CODER.model)
    expect(child.reasoningEffort).toBe('low')
    // The main conversation keeps its own route.
    expect((await routeFor(ctx, { isSeeded: false })).provider).toBe('leader-route')
  })

  it('applies a later coder change to the next request, like a running child', async () => {
    const { ctx, ref } = bench()
    ref.write(enabled())
    expect((await routeFor(ctx, { origin: 'subagent' })).model).toBe('coder-model')
    ref.write(enabled({ coder: { provider: 'other-route', model: 'other-model' } }))
    // Live read: the very next request follows the new seat. No remount, and no
    // signal beyond the reference itself having moved.
    expect((await routeFor(ctx, { origin: 'subagent' })).provider).toBe('other-route')
  })

  it('keeps serving the last good rule when a stored section becomes unusable', async () => {
    const { ctx, fusion, ref } = bench()
    ref.write(enabled())
    // Establish the good section as the baseline FIRST: "last good" is a
    // comparison against what was actually served, so a test that never reads
    // between the two writes would only be observing the disabled default.
    expect(fusion.current().coder).toEqual(CODER)
    // Publish a section that fails the cross-field rule, as an externally
    // edited config file would. 1.7 gives a plugin no write-validation hook for
    // its own Config, so the guard is on the read side: the last good rule
    // stays in force rather than the turn failing.
    ref.write(FusionSection({
      enabled: true,
      leader: { provider: 'leader-route', model: 'leader-model' },
    } as never))
    expect(fusion.current().coder).toEqual(CODER)
    expect((await routeFor(ctx, { origin: 'subagent' })).provider).toBe(CODER.provider)
  })

  it('reports an unusable section on the update signal, so it is not silent', async () => {
    const { ctx, ref } = bench()
    const logged = vi.spyOn(ctx.logger, 'error').mockImplementation(() => {})
    ref.write(FusionSection({ enabled: true } as never))
    ctx.emit('loader/volatile-update')
    // A deployment that reads as "Fusion is on" while routing nothing is the
    // failure this log exists to prevent.
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()
  })

  it('recovers once a usable section is published again', async () => {
    const { ctx, ref } = bench()
    ref.write(FusionSection({ enabled: true } as never))
    expect((await routeFor(ctx, { origin: 'subagent' })).provider).toBe('leader-route')
    ref.write(enabled())
    expect((await routeFor(ctx, { origin: 'subagent' })).provider).toBe(CODER.provider)
  })

  it('keeps a context-variant model id byte for byte', async () => {
    const { ctx, fusion, ref } = bench()
    ref.write(enabled({ coder: { provider: 'p', model: 'glm-5.3-flash::ctx@262144' } }))
    // The variant suffix selects a context window; mangling it would silently
    // serve the model at its default length.
    expect(fusion.current().coder?.model).toBe('glm-5.3-flash::ctx@262144')
    expect((await routeFor(ctx, { origin: 'subagent' })).model).toBe('glm-5.3-flash::ctx@262144')
  })

  it('honours the fork switch end to end', async () => {
    const { ctx, ref } = bench()
    ref.write(enabled({ includeForks: false }))
    expect((await routeFor(ctx, { origin: 'subagent', isSeeded: true })).provider).toBe('leader-route')
    expect((await routeFor(ctx, { origin: 'subagent', isSeeded: false })).provider).toBe(CODER.provider)
  })
})
