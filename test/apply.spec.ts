import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.ts'
import { CommandCodeSection, FusionSection, GoSection, ProtocomSection } from '../src/config.ts'

/**
 * The config shape DSH 1.7 hands a plugin: one Loader entry whose sections are
 * volatile references. Schemastery fills each section's defaults here exactly
 * as the Host does, so a section the profile never mentioned still resolves.
 * @param protocom - protocom section input, overriding the schema defaults.
 * @returns a Config whose four sections each answer `get()`.
 */
function volatileConfig(protocom: Record<string, unknown> = {}): any {
  return {
    protocom: { get: () => ProtocomSection(protocom as never) },
    opencodeGo: { get: () => GoSection({}) },
    commandcode: { get: () => CommandCodeSection({}) },
    fusion: { get: () => FusionSection({}) },
  }
}

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
    // 1.7 removed `settings.installSection`: a plugin's own Config is its form,
    // so the assembly must not reach for a registration API at all. The stub
    // stays deliberately bare -- any such call is now a TypeError, which is
    // exactly the regression this fake should catch.
    settings: {},
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

const config = volatileConfig({ groups: { codex: { enabled: true, apiKey: 'PROTOCOM_CODEX_API_KEY' } } })

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
    const { ctx, listeners } = fakeContext()
    apply(ctx, config)
    // Four sections changed hands from "registered namespace" to "field of this
    // one entry", so what each mount now needs is a change signal rather than a
    // registration: three families plus Fusion, then the routing rule itself.
    expect(listeners.filter(entry => entry.name === 'loader/volatile-update')).toHaveLength(4)
    // The rule only works from a global, outermost listener: a subagent's agent
    // scope is below whatever scope this plugin mounts in.
    expect(listeners.filter(entry => entry.name === 'agent/request'))
      .toEqual([{ name: 'agent/request', options: { global: true, prepend: true } }])
  })
})
