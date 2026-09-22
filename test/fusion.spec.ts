import { describe, expect, it } from 'vitest'
import {
  FUSION_NS,
  resolveFusion,
  resolveFusionSeat,
  sameFusionSeat,
} from '../src/fusion.ts'
import { fuseCallConfig, subagentFacts } from '../src/fusion-host.ts'
import { FusionSection } from '../src/config.ts'

const LEADER = { provider: 'opencode-go-sub', model: 'deepseek-v4.1-flash::ctx@1048576', reasoningEffort: 'high' }
const CODER = { provider: 'protocom-aggregate', model: 'z-ai/glm-5.3-flash::ctx@262144', reasoningEffort: 'low' }

/** A root session header, as a top-level Session exposes it. */
const ROOT = subagentFacts({ header: { isSeeded: false } })
/** A spawned child: delegated, not seeded. */
const CHILD = subagentFacts({ header: { origin: 'subagent', isSeeded: false } })
/** A forked child: delegated and carrying an inherited parent prefix. */
const FORK = subagentFacts({ header: { origin: 'subagent', isSeeded: true } })

const ENABLED = resolveFusion({ enabled: true, leader: LEADER, coder: CODER })

describe('Fusion section schema (T1)', () => {
  it('normalizes an absent section to disabled with both seats unset', () => {
    expect(FusionSection({})).toEqual({
      enabled: false,
      leader: {},
      coder: {},
      includeForks: true,
      applyLeader: true,
    })
    expect(resolveFusion(FusionSection({}))).toEqual({
      enabled: false,
      includeForks: true,
      applyLeader: true,
    })
  })

  it('keeps a context-variant model id intact through the schema', () => {
    // The `::ctx@N` suffix is an opaque model id to the harness and selects a
    // context ladder entry, so normalization must not touch it.
    const section = FusionSection({ enabled: true, leader: LEADER, coder: CODER })
    expect(section.leader.model).toBe('deepseek-v4.1-flash::ctx@1048576')
    expect(resolveFusion(section).coder?.model).toBe('z-ai/glm-5.3-flash::ctx@262144')
  })

  it('refuses enabling without both seats', () => {
    expect(() => resolveFusion({ enabled: true, coder: CODER })).toThrow(/leader seat/)
    expect(() => resolveFusion({ enabled: true, leader: LEADER })).toThrow(/coder seat/)
  })

  it('allows a disabled section with no seats at all', () => {
    expect(resolveFusion({ enabled: false }).enabled).toBe(false)
  })

  it('refuses a half-named seat and an unusable effort id', () => {
    expect(() => resolveFusionSeat('coder', { provider: 'p', model: '' })).toThrow(/both a provider and a model/)
    expect(() => resolveFusionSeat('coder', { provider: '', model: 'm' })).toThrow(/both a provider and a model/)
    expect(() => resolveFusionSeat('coder', { provider: 'p', model: 'm', reasoningEffort: '' })).toThrow(/effort id/)
    expect(() => resolveFusionSeat('coder', { provider: 'p', model: 'm', reasoningEffort: ' high' })).toThrow(/effort id/)
  })

  it('reports seat equality for the editor dirty check', () => {
    expect(sameFusionSeat(LEADER, { ...LEADER })).toBe(true)
    expect(sameFusionSeat(LEADER, { ...LEADER, reasoningEffort: undefined })).toBe(false)
    expect(sameFusionSeat(undefined, undefined)).toBe(true)
    expect(sameFusionSeat(LEADER, undefined)).toBe(false)
  })

  it('owns the documented namespace', () => {
    expect(FUSION_NS).toBe('model-fusion')
  })
})

describe('Fusion request rule (T2)', () => {
  it('pins a spawned child to the coder route and clears the inherited effort', () => {
    const resolved = { provider: 'opencode-go-sub', model: 'leader-model', reasoningEffort: 'high' as never }
    const fused = fuseCallConfig(resolved, ENABLED, CHILD)
    expect(fused.provider).toBe(CODER.provider)
    expect(fused.model).toBe(CODER.model)
    expect(fused.reasoningEffort).toBe('low')
    expect(fused).not.toBe(resolved)
  })

  it('clears the effort when the coder seat names none', () => {
    const fusion = resolveFusion({ enabled: true, leader: LEADER, coder: { provider: 'p', model: 'm' } })
    const fused = fuseCallConfig({ provider: 'x', model: 'y', reasoningEffort: 'high' as never }, fusion, CHILD)
    expect(fused.reasoningEffort).toBeUndefined()
    expect('reasoningEffort' in fused).toBe(false)
  })

  it('preserves maxTokens, temperature, and stop across the route change', () => {
    const resolved = {
      provider: 'opencode-go-sub',
      model: 'leader-model',
      temperature: 0.3,
      maxTokens: 4096,
      stop: ['END'],
      reasoningEffort: 'high' as never,
    }
    const fused = fuseCallConfig(resolved, ENABLED, CHILD)
    expect(fused.temperature).toBe(0.3)
    expect(fused.maxTokens).toBe(4096)
    expect(fused.stop).toEqual(['END'])
  })

  it('leaves the main conversation alone', () => {
    const resolved = { provider: 'opencode-go-sub', model: 'leader-model' }
    expect(fuseCallConfig(resolved, ENABLED, ROOT)).toBe(resolved)
  })

  it('pins a fork by default and honours the switch when it is off', () => {
    const resolved = { provider: 'opencode-go-sub', model: 'leader-model' }
    expect(fuseCallConfig(resolved, ENABLED, FORK).provider).toBe(CODER.provider)
    const noForks = resolveFusion({ enabled: true, leader: LEADER, coder: CODER, includeForks: false })
    expect(fuseCallConfig(resolved, noForks, FORK)).toBe(resolved)
    // The switch covers forks only: a spawned child is still pinned.
    expect(fuseCallConfig(resolved, noForks, CHILD).provider).toBe(CODER.provider)
  })

  it('is a no-op while disabled', () => {
    const resolved = { provider: 'opencode-go-sub', model: 'leader-model' }
    expect(fuseCallConfig(resolved, resolveFusion({ enabled: false }), CHILD)).toBe(resolved)
  })

  it('returns the same object when the child already sits on the coder route', () => {
    const resolved = { provider: CODER.provider, model: CODER.model, reasoningEffort: 'low' as never }
    expect(fuseCallConfig(resolved, ENABLED, CHILD)).toBe(resolved)
  })

  it('re-pins a child that somehow resolved onto the leader route', () => {
    // Defence in depth: even if a later agent-scoped listener reverted the
    // route, the replacement is what the loop prepares and logs.
    const fused = fuseCallConfig({ provider: LEADER.provider, model: LEADER.model }, ENABLED, CHILD)
    expect(fused.provider).toBe(CODER.provider)
  })

  it('treats an unknown session shape as a root session', () => {
    expect(subagentFacts(undefined)).toEqual({ origin: undefined, isSeeded: false })
    expect(subagentFacts({})).toEqual({ origin: undefined, isSeeded: false })
    expect(subagentFacts({ header: { origin: 'subagent' } })).toEqual({ origin: 'subagent', isSeeded: false })
  })

  it('covers grandchildren and restored children through the same durable facts', () => {
    // origin is a durable header field, so a restored or depth-2 child reads
    // exactly like a fresh one and needs no separate rule.
    const grandchild = subagentFacts({ header: { origin: 'subagent', isSeeded: false } })
    const resolved = { provider: 'opencode-go-sub', model: 'leader-model' }
    expect(fuseCallConfig(resolved, ENABLED, grandchild).provider).toBe(CODER.provider)
  })
})
