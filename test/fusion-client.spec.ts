import { describe, expect, it } from 'vitest'
import {
  FUSION_SECTION_PATH,
  fusionOps,
  leaderTargetSession,
  PROTOCOM_ENTRY_ID,
} from '../src/client/fusion-operations.ts'
import type { FusionDraft } from '../src/client/fusion-operations.ts'

const LEADER = { provider: 'opencode-go-sub', model: 'deepseek-v4.1-flash::ctx@1048576', reasoningEffort: 'high' }
const CODER = { provider: 'protocom-aggregate', model: 'z-ai/glm-5.3-flash::ctx@262144' }

describe('Fusion operations (T4)', () => {
  it('addresses the one entry, with Fusion as a path inside it', () => {
    // 1.7 keys a form by profile row and gives each plugin exactly one Config,
    // so the four sections this plugin used to register separately share an id
    // and are told apart by their path prefix.
    expect(PROTOCOM_ENTRY_ID).toBe('protocom-api')
    expect(FUSION_SECTION_PATH).toBe('fusion')
  })

  it('writes the complete section so no stale field survives', () => {
    const ops = fusionOps({
      enabled: true,
      leader: LEADER,
      coder: CODER,
      includeForks: false,
      applyLeader: false,
    })
    // Paths are rooted at the section name: the form belongs to the entry, so
    // an unprefixed path would address a field of the wrong section.
    expect(ops).toEqual([
      { op: 'set', path: ['fusion', 'enabled'], value: true },
      { op: 'set', path: ['fusion', 'leader'], value: { provider: LEADER.provider, model: LEADER.model, reasoningEffort: 'high' } },
      { op: 'set', path: ['fusion', 'coder'], value: { provider: CODER.provider, model: CODER.model } },
      { op: 'set', path: ['fusion', 'includeForks'], value: false },
      { op: 'set', path: ['fusion', 'applyLeader'], value: false },
    ])
  })

  it('clears a seat by writing an empty object rather than omitting the path', () => {
    // Omitting the path would leave the previous seat stored, so clearing must
    // be an explicit write of the empty seat.
    const ops = fusionOps({ enabled: false, leader: undefined, coder: undefined, includeForks: true, applyLeader: true })
    expect(ops[1]).toEqual({ op: 'set', path: ['fusion', 'leader'], value: {} })
    expect(ops[2]).toEqual({ op: 'set', path: ['fusion', 'coder'], value: {} })
  })
})

describe('leader soft-apply target (T4)', () => {
  const ROOT = { sessionId: 'root', origin: undefined }
  const CHILD = { sessionId: 'child', origin: 'subagent' as const }

  it('targets the current top-level Session', () => {
    expect(leaderTargetSession([ROOT, CHILD], 'root')).toBe('root')
  })

  it('never targets a subagent Session', () => {
    // Addressing a subagent through the Host model API would activate persisted
    // history outside the parent-continuation path, which the harness refuses.
    expect(leaderTargetSession([ROOT, CHILD], 'child')).toBeUndefined()
  })

  it('does nothing without a current Session or a known row', () => {
    expect(leaderTargetSession([ROOT], undefined)).toBeUndefined()
    expect(leaderTargetSession([ROOT], 'missing')).toBeUndefined()
    expect(leaderTargetSession([], 'root')).toBeUndefined()
  })

  it('treats an unmarked row as a top-level conversation', () => {
    expect(leaderTargetSession([{ sessionId: 'plain' }], 'plain')).toBe('plain')
  })
})

describe('Fusion drafts (T4)', () => {
  it('keeps undefined seats distinct from set ones', () => {
    const draft: FusionDraft = { enabled: false, leader: undefined, coder: CODER, includeForks: true, applyLeader: true }
    expect(draft.leader).toBeUndefined()
    expect(draft.coder).toEqual(CODER)
  })
})
