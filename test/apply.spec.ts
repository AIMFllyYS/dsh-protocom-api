import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.ts'

interface RecordedRoute {
  path: string
  methods: readonly string[]
  requestBody: string
  fetch: (request: Request) => Promise<Response>
}

function fakeContext(hasConnection = true): {
  ctx: any
  fetchRoutes: RecordedRoute[]
  webRoutes: unknown[]
  adapterRoutes: string[][]
  listeners: { name: string; options: unknown }[]
  sections: string[]
} {
  const fetchRoutes: RecordedRoute[] = []
  const webRoutes: unknown[] = []
  const adapterRoutes: string[][] = []
  const listeners: { name: string; options: unknown }[] = []
  const sections: string[] = []
  const ctx: any = {
    logger: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} },
    get: () => undefined,
    effect: (fn: () => unknown) => {
      const disposer = fn()
      return () => { if (typeof disposer === 'function') (disposer as () => void)() }
    },
    on: (name: string, _listener: unknown, options: unknown) => {
      listeners.push({ name, options })
      return () => {}
    },
    inject: (_names: string[], callback: (context: unknown) => void) => {
      callback(ctx)
      return () => {}
    },
    llm: {
      registerConfigurableProviders: () => () => {},
      registerModelDiscovery: () => () => {},
      registerAdapter: (routes: readonly string[]) => {
        adapterRoutes.push([...routes])
        const handle: any = () => {}
        handle.replace = (next: readonly string[]) => { adapterRoutes.push([...next]) }
        return handle
      },
    },
    settings: {
      installSection: (_owner: unknown, ns: string) => { sections.push(ns) },
    },
    webServer: {
      register: (route: unknown) => {
        webRoutes.push(route)
        return () => {}
      },
    },
  }
  if (hasConnection) {
    ctx.connection = {
      fetch: {
        register: (route: RecordedRoute) => {
          fetchRoutes.push(route)
          return async () => {}
        },
      },
    }
  }
  return { ctx, fetchRoutes, webRoutes, adapterRoutes, listeners, sections }
}

const config = { groups: { codex: { enabled: true, apiKey: 'PROTOCOM_CODEX_API_KEY' } } }

describe('plugin assembly (P0-1)', () => {
  it('registers the balance route on the fenced connection channel and never on webServer', () => {
    const { ctx, fetchRoutes, webRoutes, adapterRoutes } = fakeContext()
    apply(ctx, config)
    // The old exact webServer route is what bypassed the /api fence.
    expect(webRoutes).toEqual([])
    // One account surface per family, each on the fenced channel.
    expect(fetchRoutes).toHaveLength(3)
    expect(fetchRoutes[0]?.path).toBe('/api/protocom-api/balance')
    expect(fetchRoutes[1]?.path).toBe('/api/opencode-go/usage')
    expect(fetchRoutes[2]?.path).toBe('/api/commandcode/account')
    for (const route of fetchRoutes) {
      expect(route.methods).toEqual(['GET'])
      expect(route.requestBody).toBe('buffered')
    }
    expect(adapterRoutes).toEqual([['protocom-codex']])
  })

  it('stays loadable when the connection service is absent', () => {
    const { ctx, fetchRoutes, webRoutes } = fakeContext(false)
    expect(() => apply(ctx, config)).not.toThrow()
    expect(fetchRoutes).toEqual([])
    expect(webRoutes).toEqual([])
  })

  it('mounts every family and the Fusion request rule', () => {
    const { ctx, sections, listeners } = fakeContext()
    apply(ctx, config)
    // Each provider family installs its own namespace, then Fusion; the order
    // is the mount order in apply().
    expect(sections).toEqual(['protocom-api', 'opencode-go', 'commandcode', 'model-fusion'])
    // The rule only works from a global, outermost listener: a subagent's agent
    // scope is below whatever scope this plugin mounts in.
    expect(listeners).toEqual([{ name: 'agent/request', options: { global: true, prepend: true } }])
  })
})
