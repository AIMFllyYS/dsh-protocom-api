// @vitest-environment node
/**
 * The client's settings boundary, which is where the 1.7 nesting lives.
 *
 * DSH 1.7 keys a settings form by Loader entry and gives a plugin one Config, so
 * all four families read and write the SAME entry with their own section as the
 * path root. Getting that wrong fails in two different ways depending on which
 * half is wrong, and NEITHER raises an error the operator can act on:
 *
 *  - addressing a section as if it were still a namespace reports
 *    "settings namespace unavailable" (that is what the Go and Command Code
 *    panels showed);
 *  - addressing the right entry with an unrooted path renders every field at
 *    its default, so a configured and enabled group looks switched off.
 *
 * These tests pin both halves.
 */
import { describe, expect, it, vi } from 'vitest'
import { createProtocomOperations, PROTOCOM_ENTRY_ID } from '../src/client/operations.ts'

/** The entry's whole Config, as the Host describes it. */
const ENTRY_VALUE = {
  protocom: { groups: { aggregate: { enabled: true, apiKey: 'PROTOCOM_AGGREGATE_API_KEY' } } },
  opencodeGo: { groups: { go: { enabled: true, apiKey: 'OPENCODE_GO_API_KEY' } } },
  commandcode: { groups: {} },
  fusion: { enabled: false },
}

/** A context whose settings remote records what it was asked. */
function bench(): { ctx: never; mutate: ReturnType<typeof vi.fn>; discover: ReturnType<typeof vi.fn> } {
  const mutate = vi.fn(async () => ({ ok: true as const, value: { ns: PROTOCOM_ENTRY_ID, value: ENTRY_VALUE } }))
  const discover = vi.fn(async () => ({ ok: true as const, value: [] }))
  const ctx = {
    remote: {
      settings: {
        describe: async () => ({
          ok: true as const,
          value: { namespaces: [{ ns: PROTOCOM_ENTRY_ID, value: ENTRY_VALUE, revision: 3, writable: true }] },
        }),
        mutate,
      },
      credentials: { describe: async () => ({ ok: true as const, value: {} }), set: async () => ({ ok: true as const }) },
      llm: { discoverModels: discover },
    },
  }
  return { ctx: ctx as never, mutate, discover }
}

const GO = { ns: 'opencode-go', sectionKey: 'opencodeGo' }

describe('client settings boundary (1.0.1)', () => {
  it('hands each family only its own section of the shared entry', async () => {
    const { ctx } = bench()
    const view = await createProtocomOperations(ctx, GO).describeSettings()
    // Not the Config root: the panel reads `value.groups`, which only exists
    // inside the section.
    expect(view?.value).toEqual(ENTRY_VALUE.opencodeGo)
    expect(view?.ns).toBe(PROTOCOM_ENTRY_ID)
  })

  it('roots a write at the family section rather than the Config root', async () => {
    const { ctx, mutate } = bench()
    await createProtocomOperations(ctx, GO).writeSettings(
      [{ op: 'set', path: ['groups', 'go', 'enabled'], value: true }], 3,
    )
    expect(mutate).toHaveBeenCalledWith(PROTOCOM_ENTRY_ID, [
      { op: 'set', path: ['opencodeGo', 'groups', 'go', 'enabled'], value: true },
    ], 3)
  })

  it('roots the credential-reference write too', async () => {
    const { ctx, mutate } = bench()
    await createProtocomOperations(ctx, GO).storeApiKey('go', 'OPENCODE_GO_API_KEY', 'sk-x', 3)
    expect(mutate).toHaveBeenCalledWith(PROTOCOM_ENTRY_ID, [
      { op: 'set', path: ['opencodeGo', 'groups', 'go', 'apiKey'], value: 'OPENCODE_GO_API_KEY' },
      { op: 'set', path: ['opencodeGo', 'groups', 'go', 'enabled'], value: true },
    ], 3)
  })

  it('keeps discovery on the family key, which is its own key space', async () => {
    const { ctx, discover } = bench()
    await createProtocomOperations(ctx, GO).discoverModels({ baseURL: 'https://example.test/v1' })
    // Naming the entry here would register all four families under one key and
    // the Host refuses the second registration.
    expect(discover).toHaveBeenCalledWith('opencode-go', { baseURL: 'https://example.test/v1' })
  })

  it('reads the protocom family out of the same entry', async () => {
    const { ctx, mutate } = bench()
    const ops = createProtocomOperations(ctx, { ns: 'protocom-api', sectionKey: 'protocom' })
    expect((await ops.describeSettings())?.value).toEqual(ENTRY_VALUE.protocom)
    await ops.writeSettings([{ op: 'set', path: ['baseURL'], value: 'https://x.test/v1' }], undefined)
    expect(mutate).toHaveBeenCalledWith(PROTOCOM_ENTRY_ID, [
      { op: 'set', path: ['protocom', 'baseURL'], value: 'https://x.test/v1' },
    ], undefined)
  })
})
