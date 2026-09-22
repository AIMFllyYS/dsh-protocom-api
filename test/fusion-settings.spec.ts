/**
 * Fusion against the REAL harness settings service: the section is installed
 * through `SettingsProvider.installSection`, written through `mutate`, and the
 * resulting value is what the `agent/request` rule routes on. This is the
 * integration seam the unit tests cannot reach — that a committed settings
 * document actually changes which model a subagent request resolves to.
 */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SettingsProvider from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { agentEvents } from '@deepseek-ai/dsh-agent'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'
import { mountFusion } from '../src/fusion-host.ts'

/** An in-memory settings provider: the same commit path, no file. */
class MemorySettings extends SettingsProvider {
  readonly writable = true
  private doc: Record<string, unknown> = {}

  protected override async load(): Promise<Record<string, unknown>> {
    return structuredClone(this.doc)
  }

  protected override async persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.doc = { ...this.doc, [ns]: structuredClone(section) }
  }
}

const CODER = { provider: 'coder-route', model: 'coder-model', reasoningEffort: 'low' }

/** Mount the real settings service plus Fusion, returning both. */
async function bench() {
  const ctx = new Context()
  await ctx.plugin(MemorySettings)
  const fusion = mountFusion(ctx, { enabled: false })
  return { ctx, fusion }
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

describe('Fusion over the real settings service (T4)', () => {
  it('installs the section and starts from the disabled composition entry', async () => {
    const { ctx, fusion } = await bench()
    expect(fusion.current()).toMatchObject({ enabled: false, includeForks: true, applyLeader: true })
    expect((await routeFor(ctx, { origin: 'subagent' })).provider).toBe('leader-route')
  })

  it('routes a subagent onto the coder seat after a committed write', async () => {
    const { ctx, fusion } = await bench()
    await ctx.settings.mutate('model-fusion', [
      { op: 'set', path: ['enabled'], value: true },
      { op: 'set', path: ['leader'], value: { provider: 'leader-route', model: 'leader-model', reasoningEffort: 'high' } },
      { op: 'set', path: ['coder'], value: CODER },
    ])
    expect(fusion.current().enabled).toBe(true)
    const child = await routeFor(ctx, { origin: 'subagent', isSeeded: false })
    expect(child.provider).toBe(CODER.provider)
    expect(child.model).toBe(CODER.model)
    expect(child.reasoningEffort).toBe('low')
    // The main conversation keeps its own route.
    expect((await routeFor(ctx, { isSeeded: false })).provider).toBe('leader-route')
  })

  it('refuses to store an enabled section with a missing seat', async () => {
    const { ctx, fusion } = await bench()
    await expect(ctx.settings.mutate('model-fusion', [
      { op: 'set', path: ['enabled'], value: true },
      { op: 'set', path: ['coder'], value: CODER },
    ])).rejects.toThrow(/leader seat/)
    // The refusal leaves the last good value in force.
    expect(fusion.current().enabled).toBe(false)
  })

  it('applies a later coder change to the next request, like a running child', async () => {
    const { ctx } = await bench()
    await ctx.settings.mutate('model-fusion', [
      { op: 'set', path: ['enabled'], value: true },
      { op: 'set', path: ['leader'], value: { provider: 'leader-route', model: 'leader-model' } },
      { op: 'set', path: ['coder'], value: CODER },
    ])
    expect((await routeFor(ctx, { origin: 'subagent' })).model).toBe('coder-model')
    await ctx.settings.mutate('model-fusion', [
      { op: 'set', path: ['coder'], value: { provider: 'other-route', model: 'other-model' } },
    ])
    // Live read: the very next request follows the new seat.
    expect((await routeFor(ctx, { origin: 'subagent' })).provider).toBe('other-route')
  })

  it('keeps serving the last good rule when a stored section becomes unusable', async () => {
    const { ctx, fusion } = await bench()
    await ctx.settings.mutate('model-fusion', [
      { op: 'set', path: ['enabled'], value: true },
      { op: 'set', path: ['leader'], value: { provider: 'leader-route', model: 'leader-model' } },
      { op: 'set', path: ['coder'], value: CODER },
    ])
    // Publish a document whose section fails the cross-field rule, as an
    // externally edited file would. The provider keeps the last good value.
    ;(ctx.settings as unknown as { publish(doc: Record<string, unknown>): void }).publish({
      'model-fusion': { enabled: true, leader: { provider: 'leader-route', model: 'leader-model' } },
    })
    expect(fusion.current().coder).toEqual(CODER)
    expect((await routeFor(ctx, { origin: 'subagent' })).provider).toBe(CODER.provider)
  })

  it('round-trips a full section through describe', async () => {
    const { ctx } = await bench()
    await ctx.settings.mutate('model-fusion', [
      { op: 'set', path: ['enabled'], value: true },
      { op: 'set', path: ['leader'], value: { provider: 'leader-route', model: 'leader-model', reasoningEffort: 'high' } },
      { op: 'set', path: ['coder'], value: CODER },
      { op: 'set', path: ['includeForks'], value: false },
      { op: 'set', path: ['applyLeader'], value: false },
    ])
    const descriptor = ctx.settings.describe().find(entry => entry.ns === 'model-fusion')
    expect(descriptor?.value).toMatchObject({
      enabled: true,
      leader: { provider: 'leader-route', model: 'leader-model', reasoningEffort: 'high' },
      coder: CODER,
      includeForks: false,
      applyLeader: false,
    })
    // The variant id survives storage byte for byte.
    await ctx.settings.mutate('model-fusion', [
      { op: 'set', path: ['coder'], value: { provider: 'p', model: 'glm-5.3-flash::ctx@262144' } },
    ])
    expect(ctx.settings.get('model-fusion')).toMatchObject({
      coder: { provider: 'p', model: 'glm-5.3-flash::ctx@262144' },
    })
  })

  it('honours the fork switch end to end', async () => {
    const { ctx } = await bench()
    await ctx.settings.mutate('model-fusion', [
      { op: 'set', path: ['enabled'], value: true },
      { op: 'set', path: ['leader'], value: { provider: 'leader-route', model: 'leader-model' } },
      { op: 'set', path: ['coder'], value: CODER },
      { op: 'set', path: ['includeForks'], value: false },
    ])
    expect((await routeFor(ctx, { origin: 'subagent', isSeeded: true })).provider).toBe('leader-route')
    expect((await routeFor(ctx, { origin: 'subagent', isSeeded: false })).provider).toBe(CODER.provider)
  })
})
