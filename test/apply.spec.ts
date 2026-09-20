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
} {
  const fetchRoutes: RecordedRoute[] = []
  const webRoutes: unknown[] = []
  const adapterRoutes: string[][] = []
  const ctx: any = {
    logger: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} },
    get: () => undefined,
    effect: (fn: () => unknown) => {
      const disposer = fn()
      return () => { if (typeof disposer === 'function') (disposer as () => void)() }
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
    settings: { installSection: () => {} },
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
  return { ctx, fetchRoutes, webRoutes, adapterRoutes }
}

const config = { groups: { codex: { enabled: true, apiKey: 'PROTOCOM_CODEX_API_KEY' } } }

describe('plugin assembly (P0-1)', () => {
  it('registers the balance route on the fenced connection channel and never on webServer', () => {
    const { ctx, fetchRoutes, webRoutes, adapterRoutes } = fakeContext()
    apply(ctx, config)
    // The old exact webServer route is what bypassed the /api fence.
    expect(webRoutes).toEqual([])
    expect(fetchRoutes).toHaveLength(1)
    expect(fetchRoutes[0]?.path).toBe('/api/protocom-api/balance')
    expect(fetchRoutes[0]?.methods).toEqual(['GET'])
    expect(fetchRoutes[0]?.requestBody).toBe('buffered')
    expect(adapterRoutes).toEqual([['protocom-codex']])
  })

  it('stays loadable when the connection service is absent', () => {
    const { ctx, fetchRoutes, webRoutes } = fakeContext(false)
    expect(() => apply(ctx, config)).not.toThrow()
    expect(fetchRoutes).toEqual([])
    expect(webRoutes).toEqual([])
  })
})
