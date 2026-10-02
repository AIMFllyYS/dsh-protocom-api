// @vitest-environment jsdom
/**
 * Client assembly, exercised against the REAL cordis the plugin runs on.
 *
 * The previous version of this file stubbed `ctx.get` to return `{}` for every
 * name and handed the plugin a `remote` that already carried `session`, so it
 * asserted a registration the real boot never reaches. The bug it missed was
 * not a logic error inside the plugin but an interaction with cordis: a service
 * read that was never declared in `inject` THROWS, and `remote.session` is a
 * Remote namespace mounted late by an async Host handshake. A stub that answers
 * every probe on demand cannot reproduce either half of that.
 *
 * These cases therefore build a real `Context`, provide real `Service`s, and
 * mount the late namespaces on their own schedule.
 */
import { describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { apply, inject } from '../src/client/index.ts'
import { createFusionOperations } from '../src/client/fusion-operations.ts'
import type { FusionDraft, FusionOperations } from '../src/client/fusion-operations.ts'

interface Registered {
  name: string
  id: string
  order: number
}

/** `remote`, the gateway service every Remote namespace hangs off. */
class Remote extends Service<never> {
  constructor(ctx: never) { super(ctx, 'remote' as never) }
}

/** One Remote namespace, e.g. `remote.session` / `remote.settings`. */
class Namespace extends Service<never> {
  constructor(ctx: never, ns: string) { super(ctx, `remote.${ns}` as never) }
}

/** The settings form service (`configForms`). */
class ConfigForms extends Service<never> {
  /** What the next `mutate` resolves; the real one RESOLVES false on refusal. */
  accepts = true
  /** The revision the form reports after a write attempt (for the fence). */
  revision = 1
  /** Set to make `mutate` reject instead of resolving, as a transport failure does. */
  throws: Error | undefined
  readonly writes: unknown[][] = []
  constructor(ctx: never) { super(ctx, 'configForms' as never) }
  get = (): {
    getSnapshot(): { status: 'loading' | 'ready' | 'unavailable'; value?: unknown; revision?: number; writable: boolean }
    subscribe(listener: () => void): () => void
    mutate(ops: unknown[], revision: number | undefined): Promise<boolean>
  } => ({
    getSnapshot: () => ({ status: 'ready', value: undefined, revision: this.revision, writable: true }),
    subscribe: () => () => {},
    mutate: async (ops) => {
      this.writes.push(ops)
      if (this.throws !== undefined) throw this.throws
      return this.accepts
    },
  })
}

/** The client Session service; rows carry the shell's `retainedBy` marks. */
class Sessions extends Service<never> {
  byId: Record<string, unknown> = {}
  constructor(ctx: never) { super(ctx, 'sessions' as never) }
  list = { getSnapshot: () => ({ ids: Object.keys(this.byId), byId: this.byId, phase: 'ready' }) }
}

/**
 * The `slots` service, reduced to the two calls the client half makes. `inject`
 * runs its callback once — like the real registry does as soon as the slot is
 * declared — while the deferral under test lives in the real `ctx.inject` the
 * plugin calls from inside that callback.
 */
class Slots extends Service<never> {
  sections: Registered[] = []
  disposers: (() => void)[] = []
  /** The declaration callback, retained so a re-declaration can be simulated. */
  callback: (() => (() => void) | void) | undefined
  constructor(ctx: never) { super(ctx, 'slots' as never) }
  inject = (_key: string, callback: () => (() => void) | void): (() => void) => {
    this.callback = callback
    this.run()
    return () => { this.disposers.forEach(dispose => { dispose() }); this.disposers = [] }
  }
  /**
   * Mirror the real registry's `reconcile`: dispose ONLY what the callback
   * returned, then re-run the callback. A registration the callback failed to
   * hand back therefore stays live, and re-running adds a second one — which
   * the duplicate check below turns into a failure rather than a silent
   * double-registration.
   */
  redeclare = (): void => {
    this.disposers.forEach(dispose => { dispose() })
    this.disposers = []
    this.run()
  }
  private readonly run = (): void => {
    const disposer = this.callback?.()
    if (typeof disposer === 'function') this.disposers.push(disposer)
  }
  register = (options: Registered): (() => void) => {
    if (this.sections.some(section => section.id === options.id)) {
      throw new Error(`duplicate registration of ${options.id}`)
    }
    this.sections.push({ name: options.name, id: options.id, order: options.order })
    return () => {
      this.sections = this.sections.filter(section => section.id !== options.id)
    }
  }
}

class Locale extends Service<never> {
  namespaces: string[] = []
  constructor(ctx: never) { super(ctx, 'locale' as never) }
  register = (ns: string): (() => void) => { this.namespaces.push(ns); return () => {} }
  bind = () => (key: string) => key
}

/** A real Context with the provider families' services, and none of Fusion's. */
async function baseContext(): Promise<{ root: Context; slots: Slots }> {
  const root = new Context()
  await root.plugin({ name: 'slots', apply: (ctx) => { new Slots(ctx as never) } })
  await root.plugin({ name: 'locale', apply: (ctx) => { new Locale(ctx as never) } })
  await root.plugin({ name: 'remote', apply: (ctx) => { new Remote(ctx as never) } })
  for (const ns of ['credentials', 'llm', 'settings']) {
    await root.plugin({ name: `remote.${ns}`, apply: (ctx) => { new Namespace(ctx as never, ns) } })
  }
  return { root, slots: (root as never as { slots: Slots }).slots }
}

/** Mount the plugin under test the way the loader does, declaring its inject. */
async function mountPlugin(root: Context): Promise<void> {
  await root.plugin({ name: 'dsh-protocom-api', inject: inject as never, apply: apply as never })
  await Promise.resolve()
}

const ids = (slots: Slots): string[] => slots.sections.map(section => section.id)

/** A complete, enabled draft; the writes these cases assert on are opaque here. */
const draft = (): FusionDraft => ({
  enabled: true,
  leader: { provider: 'p', model: 'm' },
  coder: { provider: 'p', model: 'm' },
  includeForks: true,
  applyLeader: false,
})

describe('client assembly against real cordis', () => {
  it('registers the four provider panels while the late namespaces are absent', async () => {
    const { root, slots } = await baseContext()
    await mountPlugin(root)
    // `apply` must not throw simply because a Remote namespace has not mounted
    // yet: reaching for `ctx.remote.session` here is what used to kill the
    // whole settings.section callback.
    expect(ids(slots)).toEqual(['protocom-api', 'opencode-go', 'commandcode', 'clinepass'])
  })

  it('adds the Fusion section once the late namespaces mount', async () => {
    const { root, slots } = await baseContext()
    await mountPlugin(root)
    expect(ids(slots)).not.toContain('model-fusion')

    // The namespace and the settings form arrive after the plugin applied.
    await root.plugin({ name: 'remote.session', apply: (ctx) => { new Namespace(ctx as never, 'session') } })
    await root.plugin({ name: 'configForms', apply: (ctx) => { new ConfigForms(ctx as never) } })
    await Promise.resolve()
    await Promise.resolve()

    expect(ids(slots)).toContain('model-fusion')
    // Order is unchanged by arriving late, so Fusion still sorts last.
    expect(slots.sections.map(section => section.order)).toEqual([20, 21, 23, 24, 22])
  })

  it('waits for BOTH late namespaces, not merely the first', async () => {
    const { root, slots } = await baseContext()
    await mountPlugin(root)

    await root.plugin({ name: 'remote.session', apply: (ctx) => { new Namespace(ctx as never, 'session') } })
    await Promise.resolve()
    await Promise.resolve()
    expect(ids(slots)).not.toContain('model-fusion')

    await root.plugin({ name: 'configForms', apply: (ctx) => { new ConfigForms(ctx as never) } })
    await Promise.resolve()
    await Promise.resolve()
    expect(ids(slots)).toContain('model-fusion')
  })

  it('registers each section exactly once', async () => {
    const { root, slots } = await baseContext()
    await mountPlugin(root)
    await root.plugin({ name: 'remote.session', apply: (ctx) => { new Namespace(ctx as never, 'session') } })
    await root.plugin({ name: 'configForms', apply: (ctx) => { new ConfigForms(ctx as never) } })
    for (let tick = 0; tick < 3; tick += 1) await Promise.resolve()
    expect(ids(slots).filter(id => id === 'model-fusion')).toHaveLength(1)
  })

  it('survives a slot re-declaration without double-registering Fusion', async () => {
    // The real registry re-runs this callback whenever the slot's declaration
    // epoch changes, disposing the previous contribution first. Because the
    // Fusion registration lives on the scoped fiber whose disposer is returned
    // from that callback, a re-run must tear the old one down rather than leave
    // two `model-fusion` entries at the same order.
    const { root, slots } = await baseContext()
    await mountPlugin(root)
    await root.plugin({ name: 'remote.session', apply: (ctx) => { new Namespace(ctx as never, 'session') } })
    await root.plugin({ name: 'configForms', apply: (ctx) => { new ConfigForms(ctx as never) } })
    for (let tick = 0; tick < 3; tick += 1) await Promise.resolve()
    expect(ids(slots)).toContain('model-fusion')

    slots.redeclare()
    for (let tick = 0; tick < 3; tick += 1) await Promise.resolve()
    expect(ids(slots).filter(id => id === 'model-fusion')).toHaveLength(1)
    expect(ids(slots)).toEqual(['protocom-api', 'opencode-go', 'commandcode', 'clinepass', 'model-fusion'])
  })

  it('registers the locale namespace and the stylesheet', async () => {
    const { root } = await baseContext()
    const before = document.head.querySelectorAll('style[data-plugin="dsh-protocom-api"]').length
    await mountPlugin(root)
    expect((root as never as { locale: { namespaces: string[] } }).locale.namespaces)
      .toEqual(['settings.protocom'])
    const after = document.head.querySelectorAll('style[data-plugin="dsh-protocom-api"]')
    expect(after.length).toBe(before + 1)
  })

  it('drops the Fusion section again when its dependencies unmount', async () => {
    const { root, slots } = await baseContext()
    await mountPlugin(root)
    const fiber = await root.plugin({ name: 'configForms', apply: (ctx) => { new ConfigForms(ctx as never) } })
    const nsFiber = await root.plugin({ name: 'remote.session', apply: (ctx) => { new Namespace(ctx as never, 'session') } })
    for (let tick = 0; tick < 2; tick += 1) await Promise.resolve()
    expect(ids(slots)).toContain('model-fusion')

    // The scoped fiber owns the registration, so the section must not outlive
    // the services it renders from.
    await fiber.dispose()
    await nsFiber.dispose()
    for (let tick = 0; tick < 3; tick += 1) await Promise.resolve()
    expect(ids(slots)).not.toContain('model-fusion')
    expect(ids(slots)).toEqual(['protocom-api', 'opencode-go', 'commandcode', 'clinepass'])
  })
})

/**
 * The defect itself, stated as the invariant a future edit must not break: a
 * service read is legal only from a context that DECLARED it, and optional
 * chaining cannot rescue an undeclared read.
 */
describe('why the availability probe could not work', () => {
  it('throws on an undeclared read even though the service is fully active', async () => {
    const root = new Context()
    await root.plugin({ name: 'remote', apply: (ctx) => { new Remote(ctx as never) } })
    await root.plugin({ name: 'remote.session', apply: (ctx) => { new Namespace(ctx as never, 'session') } })
    await root.plugin({ name: 'remote.settings', apply: (ctx) => { new Namespace(ctx as never, 'settings') } })
    await Promise.resolve()

    const seen: string[] = []
    await root.plugin({
      name: 'consumer',
      // Declares `remote` only, exactly like the plugin's own `inject` array.
      inject: ['remote'] as never,
      apply: (ctx) => {
        const remote = (ctx as never as { remote: { session?: unknown } }).remote
        // `ctx.get` is the sanctioned probe and reports the namespace live...
        seen.push(`get -> ${String((ctx as never as { get(n: string): unknown }).get('remote.session') !== undefined)}`)
        try {
          // ...but the property read that the old probe performed throws, and
          // `?.` cannot prevent it because the throw happens on the get itself.
          void remote.session?.toString()
          seen.push('property read -> allowed')
        } catch (error) {
          seen.push(`property read -> ${(error as Error).message}`)
        }
      },
    })

    expect(seen[0]).toBe('get -> true')
    expect(seen[1]).toMatch(/cannot get property "remote\.session" without inject/)
  })
})

/**
 * Build the Fusion operations the way `index.ts` does: a parent fiber that
 * declared `remote` opens a scoped fiber for the two Fusion-only services, and
 * the factory is constructed from THAT context. `remote` is reachable without
 * being declared again because the scoped fiber inherits its parent's inject.
 */
async function mountFusionScope(root: Context): Promise<FusionOperations> {
  let operations: FusionOperations | undefined
  await root.plugin({
    name: 'fusion-owner',
    inject: ['remote'] as never,
    apply: (ctx) => {
      ;(ctx as never as {
        inject: (names: string[], cb: (child: never) => unknown) => { dispose(): Promise<void> }
      }).inject(['remote.session', 'configForms'] as never, (child: never) => {
        operations = createFusionOperations(child, key => key)
      })
    },
  })
  for (let tick = 0; tick < 3; tick += 1) await Promise.resolve()
  if (operations === undefined) throw new Error('the Fusion scope never applied')
  return operations
}

/** The two reads the factory performs are legal from the declared scope. */
describe('Fusion operations inside the declared scope', () => {
  it('binds the catalog, the section and the leader soft-apply', async () => {
    const root = new Context()
    await root.plugin({ name: 'remote', apply: (ctx) => { new Remote(ctx as never) } })
    await root.plugin({
      name: 'remote.session',
      apply: (ctx) => {
        const ns = new Namespace(ctx as never, 'session') as never as Record<string, unknown>
        ns.modelCatalog = async () => ({ ok: true as const, value: { groups: [], failures: [], routableProviders: [] } })
        ns.list = async () => ({ ok: true as const, value: { items: [{ sessionId: 'root-1' }] } })
        ns.selectModel = async () => ({ ok: true as const })
      },
    })
    await root.plugin({
      name: 'configForms',
      apply: (ctx) => {
        const forms = new ConfigForms(ctx as never) as never as Record<string, unknown>
        forms.get = () => ({
          getSnapshot: () => ({ status: 'ready' as const, value: { enabled: true }, revision: 3, writable: true }),
          subscribe: () => () => {},
          mutate: async () => true,
        })
      },
    })
    await root.plugin({
      name: 'sessions',
      apply: (ctx) => {
        const sessions = new Sessions(ctx as never)
        sessions.byId = { 'root-1': { id: 'root-1', retainedBy: { mainView: 1 } } }
      },
    })
    await Promise.resolve()

    const operations = await mountFusionScope(root)
    expect(await operations.loadCatalog()).toEqual({ kind: 'found', catalog: { groups: [], failures: [], routableProviders: [] } })
    expect(operations.section()).toEqual({ status: 'ready', value: { enabled: true }, revision: 3, writable: true })

    // The shell selection is the row the main view retains — the snapshot has
    // no `current` field. Reading a nonexistent field used to answer undefined
    // on every page, so this soft-apply always claimed there was no session.
    expect(await operations.applyLeader({ provider: 'p', model: 'm' })).toEqual([])
  })

  it('reports the no-session case instead of succeeding silently', async () => {
    const root = new Context()
    await root.plugin({ name: 'remote', apply: (ctx) => { new Remote(ctx as never) } })
    await root.plugin({ name: 'remote.session', apply: (ctx) => { new Namespace(ctx as never, 'session') } })
    await root.plugin({ name: 'configForms', apply: (ctx) => { new ConfigForms(ctx as never) } })
    await root.plugin({
      name: 'sessions',
      apply: (ctx) => {
        const sessions = new Sessions(ctx as never)
        // A Session exists but nothing retains it: no conversation on screen.
        sessions.byId = { 'bg-1': { id: 'bg-1', retainedBy: {} } }
      },
    })
    await Promise.resolve()

    const operations = await mountFusionScope(root)
    expect(await operations.applyLeader({ provider: 'p', model: 'm' })).toEqual(['applyLeaderNoSession'])
  })

  it('tells an unlisted session apart from a subagent session', async () => {
    // Both used to report "this is a subagent", which sends the operator looking
    // for a main conversation they are already in. The two cases need different
    // wording because only one of them is the operator's mistake.
    const mount = async (origin: 'subagent' | undefined, id: string): Promise<FusionOperations> => {
      const root = new Context()
      await root.plugin({ name: 'remote', apply: (ctx) => { new Remote(ctx as never) } })
      await root.plugin({
        name: 'remote.session',
        apply: (ctx) => {
          const ns = new Namespace(ctx as never, 'session') as never as Record<string, unknown>
          ns.list = async () => ({ ok: true as const, value: { items: origin === undefined ? [] : [{ sessionId: id, origin }] } })
          ns.selectModel = async () => ({ ok: true as const })
        },
      })
      await root.plugin({ name: 'configForms', apply: (ctx) => { new ConfigForms(ctx as never) } })
      await root.plugin({
        name: 'sessions',
        apply: (ctx) => {
          const sessions = new Sessions(ctx as never)
          sessions.byId = { [id]: { id, retainedBy: { mainView: 1 } } }
        },
      })
      await Promise.resolve()
      return mountFusionScope(root)
    }

    expect(await (await mount(undefined, 'root-1')).applyLeader({ provider: 'p', model: 'm' }))
      .toEqual(['applyLeaderNotListed'])
    expect(await (await mount('subagent', 'child-1')).applyLeader({ provider: 'p', model: 'm' }))
      .toEqual(['applyLeaderSubagent'])
  })

  it('does not report a refused write as a successful one', async () => {
    // The real form RESOLVES false when the Host refuses a mutation (validation,
    // a stale revision, or a memory-only page) instead of rejecting. Discarding
    // that value made the section report "saved" over an unchanged config.
    const root = new Context()
    await root.plugin({ name: 'remote', apply: (ctx) => { new Remote(ctx as never) } })
    await root.plugin({ name: 'remote.session', apply: (ctx) => { new Namespace(ctx as never, 'session') } })
    let forms: ConfigForms | undefined
    await root.plugin({
      name: 'configForms',
      apply: (ctx) => {
        forms = new ConfigForms(ctx as never)
        forms.accepts = false
        forms.revision = 7
      },
    })
    await Promise.resolve()

    const operations = await mountFusionScope(root)
    // A fence that did NOT move is a plain refusal, not a conflict...
    expect(await operations.saveFusion(draft(), 7)).toEqual({ kind: 'refused', message: 'saveFailed' })
    // ...while a fence that moved under us is the conflict the copy describes.
    expect(await operations.saveFusion(draft(), 3)).toEqual({ kind: 'conflict', message: 'conflict' })
    expect(forms?.writes).toHaveLength(2)

    if (forms !== undefined) forms.accepts = true
    expect(await operations.saveFusion(draft(), 7)).toEqual({ kind: 'written' })
  })

  it('surfaces a thrown write failure instead of claiming success', async () => {
    const root = new Context()
    await root.plugin({ name: 'remote', apply: (ctx) => { new Remote(ctx as never) } })
    await root.plugin({ name: 'remote.session', apply: (ctx) => { new Namespace(ctx as never, 'session') } })
    await root.plugin({
      name: 'configForms',
      apply: (ctx) => {
        const forms = new ConfigForms(ctx as never)
        forms.throws = new Error('wire down')
      },
    })
    await Promise.resolve()

    const operations = await mountFusionScope(root)
    expect(await operations.saveFusion(draft(), 1)).toEqual({ kind: 'refused', message: 'wire down' })
  })
})
