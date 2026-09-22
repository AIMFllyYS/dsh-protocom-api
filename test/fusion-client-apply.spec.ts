/**
 * Client assembly: the Fusion section is registered alongside the two provider
 * panels, and a deployment missing its two extra services loses only Fusion.
 */
import { describe, expect, it } from 'vitest'
import { apply } from '../src/client/index.ts'

interface Registered {
  name: string
  id: string
  order: number
}

/** A stand-in client context recording what the plugin registers. */
function fakeClientContext(hasFusionServices = true): {
  ctx: any
  sections: Registered[]
  styleTags: unknown[]
  localeNamespaces: string[]
} {
  const sections: Registered[] = []
  const styleTags: unknown[] = []
  const localeNamespaces: string[] = []
  const slotInjections: (() => void)[] = []
  const ctx: any = {
    logger: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} },
    get: (name: string) => {
      if (name === 'settingsScope') return hasFusionServices ? {} : undefined
      return {}
    },
    effect: (fn: () => unknown) => {
      const disposer = fn()
      return () => { if (typeof disposer === 'function') (disposer as () => void)() }
    },
    locale: {
      register: (ns: string) => { localeNamespaces.push(ns); return () => {} },
      bind: () => (key: string) => key,
    },
    slots: {
      inject: (_key: string, callback: () => () => void) => {
        slotInjections.push(callback())
        return () => {}
      },
      register: (options: Registered) => {
        sections.push({ name: options.name, id: options.id, order: options.order })
        return () => {}
      },
    },
    remote: hasFusionServices
      ? { session: {}, credentials: {}, llm: {}, settings: {}, $on: () => () => {} }
      : { credentials: {}, llm: {}, settings: {}, $on: () => () => {} },
  }
  // The stylesheet effect appends to document.head; capture it without a DOM.
  ;(globalThis as { document?: unknown }).document = {
    createElement: () => ({ dataset: {}, textContent: '' }),
    head: { appendChild: (tag: unknown) => { styleTags.push(tag) } },
  }
  return { ctx, sections, styleTags, localeNamespaces }
}

describe('client assembly (T5)', () => {
  it('registers all three settings sections in order', () => {
    const { ctx, sections } = fakeClientContext()
    apply(ctx)
    expect(sections.map(section => section.id)).toEqual(['protocom-api', 'opencode-go', 'model-fusion'])
    expect(sections.map(section => section.order)).toEqual([20, 21, 22])
    expect(ctx.effect).toBeTypeOf('function')
  })

  it('registers the locale namespace and injects the stylesheet', () => {
    const { ctx, localeNamespaces } = fakeClientContext()
    apply(ctx)
    expect(localeNamespaces).toEqual(['settings.protocom'])
  })

  it('omits Fusion when the deployment lacks its extra services', () => {
    // A missing settingsScope must not deactivate the whole client plugin —
    // the provider panels do not depend on it.
    const { ctx, sections } = fakeClientContext(false)
    expect(() => apply(ctx)).not.toThrow()
    expect(sections.map(section => section.id)).toEqual(['protocom-api', 'opencode-go'])
  })
})
