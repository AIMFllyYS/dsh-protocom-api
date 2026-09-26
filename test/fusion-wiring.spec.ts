/**
 * End-to-end wiring of the Fusion request rule: the rule is exercised through
 * the real Cordis waterfall and the real `agentEvents` dispatcher, so the
 * scope flags (`global`, `prepend`) and the payload shape are proven rather
 * than assumed.
 */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { agentEvents } from '@deepseek-ai/dsh-agent'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'
import { FusionSection } from '../src/config.ts'
import { mountFusion } from '../src/fusion-host.ts'

const LEADER = { provider: 'leader-route', model: 'leader-model' }
const CODER = { provider: 'coder-route', model: 'coder-model::ctx@262144', reasoningEffort: 'low' }

/** A stand-in Agent: the rule reads only `session.header`. */
function agentFor(header: { origin?: 'subagent'; isSeeded?: boolean }): never {
  return { id: 'agent-1', session: { id: 'session-1', header: { version: 3, id: 'session-1', createdAt: 0, ...header } } } as never
}

/**
 * Mount Fusion over a real context and run one `agent/request` dispatch, with
 * an optional competing listener registered first.
 * @returns the configuration the loop would prepare.
 */
async function dispatch(
  header: { origin?: 'subagent'; isSeeded?: boolean },
  options: { seed?: LlmCallConfig; competing?: boolean } = {},
): Promise<LlmCallConfig> {
  const ctx = new Context()
  if (options.competing === true) {
    // A plausible third-party rewrite: it prepends too, but registers BEFORE
    // the plugin mounts, so Fusion's own prepend lands outside it.
    ctx.on('agent/request', async (_payload, next) => {
      const resolved = await next()
      return { ...resolved, provider: 'competitor', model: 'competitor-model' }
    }, { global: true, prepend: true })
  }
  // 1.7 hands the rule a READ of the Loader entry's volatile section rather
  // than a composition entry, so the resolved section is what it starts from.
  mountFusion(ctx as never, () => FusionSection({ enabled: true, leader: LEADER, coder: CODER } as never))
  const seed: LlmCallConfig = options.seed ?? { ...LEADER }
  return await agentEvents(ctx, agentFor(header)).waterfall(
    'agent/request',
    { turn: 1, step: 0, signal: new AbortController().signal },
    () => Promise.resolve(seed),
  )
}

describe('Fusion agent/request wiring (T2)', () => {
  it('reaches a child agent through the global listener', async () => {
    const config = await dispatch({ origin: 'subagent', isSeeded: false })
    expect(config.provider).toBe(CODER.provider)
    expect(config.model).toBe(CODER.model)
    expect(config.reasoningEffort).toBe('low')
  })

  it('leaves a root agent on its own route', async () => {
    const config = await dispatch({ isSeeded: false })
    expect(config).toEqual(LEADER)
  })

  it('takes the final word over a listener registered earlier', async () => {
    const config = await dispatch({ origin: 'subagent', isSeeded: false }, { competing: true })
    expect(config.provider).toBe(CODER.provider)
    expect(config.model).toBe(CODER.model)
  })

  it('still pins a child when a competing listener overwrote the leader route', async () => {
    const config = await dispatch(
      { origin: 'subagent', isSeeded: false },
      { competing: true, seed: { provider: 'competitor', model: 'competitor-model' } },
    )
    expect(config.provider).toBe(CODER.provider)
  })

  it('honours includeForks through the real dispatch', async () => {
    const ctx = new Context()
    mountFusion(ctx as never, () => FusionSection({ enabled: true, leader: LEADER, coder: CODER, includeForks: false } as never))
    const forked = await agentEvents(ctx, agentFor({ origin: 'subagent', isSeeded: true })).waterfall(
      'agent/request',
      { turn: 1, step: 0, signal: new AbortController().signal },
      () => Promise.resolve({ ...LEADER } as LlmCallConfig),
    )
    expect(forked).toEqual(LEADER)
    const spawned = await agentEvents(ctx, agentFor({ origin: 'subagent', isSeeded: false })).waterfall(
      'agent/request',
      { turn: 1, step: 0, signal: new AbortController().signal },
      () => Promise.resolve({ ...LEADER } as LlmCallConfig),
    )
    expect(spawned.provider).toBe(CODER.provider)
  })

  it('stays a pass-through while disabled', async () => {
    const ctx = new Context()
    mountFusion(ctx as never, () => FusionSection({ enabled: false, leader: LEADER, coder: CODER } as never))
    const config = await agentEvents(ctx, agentFor({ origin: 'subagent', isSeeded: false })).waterfall(
      'agent/request',
      { turn: 1, step: 0, signal: new AbortController().signal },
      () => Promise.resolve({ ...LEADER } as LlmCallConfig),
    )
    expect(config).toEqual(LEADER)
  })

  it('exposes the live source the editor reads', () => {
    const ctx = new Context()
    let section = FusionSection({ enabled: true, leader: LEADER, coder: CODER } as never)
    const source = mountFusion(ctx as never, () => section)
    expect(source.current()).toMatchObject({ enabled: true, coder: CODER })
    expect(source.raw()).toMatchObject({ enabled: true })
    // Reading through the reference is what makes a settings write visible
    // without a remount, so the same source must follow a replaced section.
    section = FusionSection({ enabled: true, leader: LEADER, coder: { provider: 'next', model: 'next-model' } } as never)
    expect(source.raw()).toMatchObject({ coder: { provider: 'next', model: 'next-model' } })
    expect(source.current().coder?.provider).toBe('next')
  })
})
