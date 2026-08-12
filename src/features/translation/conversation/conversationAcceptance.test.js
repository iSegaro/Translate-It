import { describe, expect, it } from 'vitest'
import { ConversationAcceptanceHandoff } from './ConversationAcceptanceHandoff.js'
import { ConversationAcceptanceHandle, AcceptanceResult } from './ConversationAcceptanceHandle.js'
import { ConversationAcceptanceCoordinator } from './ConversationAcceptanceCoordinator.js'
import { ParentAcceptanceState } from './ParentAcceptanceState.js'

function createHandoff(parents = [{ parentId: 'g1', sourceOrder: 0, cleanSource: 'source' }]) {
  return new ConversationAcceptanceHandoff({
    messageId: 'm1', sessionId: 's1', provider: 'OpenAI', mode: 'select-element', parents,
  })
}

describe('ConversationAcceptanceHandoff', () => {
  it('freezes immutable parent data and preserves source order', () => {
    const handoff = createHandoff([
      { parentId: 'g2', sourceOrder: 1, cleanSource: 'B' },
      { parentId: 'g1', sourceOrder: 0, cleanSource: 'A' },
    ])

    expect(Object.isFrozen(handoff)).toBe(true)
    expect(Object.isFrozen(handoff.parents)).toBe(true)
    expect(Object.isFrozen(handoff.parents[0])).toBe(true)
    expect(handoff.parents.map(parent => parent.sourceOrder)).toEqual([1, 0])
    expect(handoff).not.toHaveProperty('cleanResult')
  })

  it.each([
    ['messageId', { sessionId: 's', provider: 'p', mode: 'm', parents: [] }],
    ['sessionId', { messageId: 'm', provider: 'p', mode: 'm', parents: [] }],
    ['provider', { messageId: 'm', sessionId: 's', mode: 'm', parents: [] }],
    ['mode', { messageId: 'm', sessionId: 's', provider: 'p', parents: [] }],
  ])('rejects missing %s', (_field, data) => {
    expect(() => new ConversationAcceptanceHandoff(data)).toThrow()
  })

  it('rejects invalid and duplicate parent data', () => {
    expect(() => createHandoff([{ parentId: '', sourceOrder: 0, cleanSource: 'x' }])).toThrow()
    expect(() => createHandoff([
      { parentId: 'g1', sourceOrder: 0, cleanSource: 'x' },
      { parentId: 'g1', sourceOrder: 1, cleanSource: 'y' },
    ])).toThrow()
    expect(() => createHandoff([
      { parentId: 'g1', sourceOrder: 0, cleanSource: 'x' },
      { parentId: 'g2', sourceOrder: 0, cleanSource: 'y' },
    ])).toThrow()
  })
})

describe('ConversationAcceptanceHandle', () => {
  it('supports acceptance and rejects duplicate/conflicting transitions', () => {
    const handle = new ConversationAcceptanceHandle(createHandoff())

    expect(handle.snapshot().parents[0].state).toBe(ParentAcceptanceState.PENDING)
    expect(handle.acceptParent('g1', 'translated')).toBe(AcceptanceResult.ACCEPTED)
    expect(handle.acceptParent('g1', 'translated again')).toBe(AcceptanceResult.DUPLICATE)
    expect(handle.rejectParent('g1')).toBe(AcceptanceResult.CONFLICT)
    expect(handle.snapshot().parents[0].state).toBe(ParentAcceptanceState.ACCEPTED)
  })

  it('supports rejection and prevents later acceptance', () => {
    const handle = new ConversationAcceptanceHandle(createHandoff())

    expect(handle.rejectParent('g1')).toBe(AcceptanceResult.REJECTED)
    expect(handle.rejectParent('g1')).toBe(AcceptanceResult.DUPLICATE)
    expect(handle.acceptParent('g1', 'translated')).toBe(AcceptanceResult.CONFLICT)
  })

  it('supports future commit state transitions without performing commits', () => {
    const handle = new ConversationAcceptanceHandle(createHandoff())

    expect(handle.markCommitted('g1')).toBe(AcceptanceResult.CONFLICT)
    handle.acceptParent('g1', 'translated')
    expect(handle.markCommitted('g1')).toBe(AcceptanceResult.COMMITTED)
    expect(handle.markCommitted('g1')).toBe(AcceptanceResult.DUPLICATE)
    expect(handle.markCommitFailed('g1')).toBe(AcceptanceResult.CONFLICT)
  })

  it('returns distinct commit command results', () => {
    const handle = new ConversationAcceptanceHandle(createHandoff())

    handle.acceptParent('g1', 'translated')
    expect(handle.markCommitFailed('g1')).toBe(AcceptanceResult.COMMIT_FAILED)
    expect(handle.markCommitFailed('g1')).toBe(AcceptanceResult.DUPLICATE)
  })

  it('validates result and unknown parents without mutating state', () => {
    const handle = new ConversationAcceptanceHandle(createHandoff())

    expect(handle.acceptParent('missing', 'translated')).toBe(AcceptanceResult.UNKNOWN_PARENT)
    expect(handle.acceptParent('g1', '')).toBe(AcceptanceResult.INVALID_RESULT)
    expect(handle.snapshot().parents[0].state).toBe(ParentAcceptanceState.PENDING)
  })

  it('disposes handle and makes later operations stale', () => {
    const handle = new ConversationAcceptanceHandle(createHandoff())

    expect(handle.dispose()).toBe(true)
    expect(handle.dispose()).toBe(false)
    expect(handle.acceptParent('g1', 'translated')).toBe(AcceptanceResult.STALE)
    expect(handle.rejectParent('g1')).toBe(AcceptanceResult.STALE)
    expect(handle.markCommitted('g1')).toBe(AcceptanceResult.STALE)
    expect(handle.markCommitFailed('g1')).toBe(AcceptanceResult.STALE)
    expect(handle.snapshot().state).toBe('DISPOSED')
  })

  it('does not expose mutable handle state', () => {
    const handle = new ConversationAcceptanceHandle(createHandoff())

    expect(handle).not.toHaveProperty('parents')
    expect(handle).not.toHaveProperty('state')
    expect(handle).not.toHaveProperty('handoff')
  })

  it('returns immutable snapshots', () => {
    const handle = new ConversationAcceptanceHandle(createHandoff())
    const snapshot = handle.snapshot()

    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.parents)).toBe(true)
    expect(() => { snapshot.parents[0].state = 'MUTATED' }).toThrow()
    expect(handle.snapshot().parents[0].state).toBe(ParentAcceptanceState.PENDING)
  })
})

describe('ConversationAcceptanceCoordinator', () => {
  it('registers, looks up, removes, and rejects duplicate handles', () => {
    const coordinator = new ConversationAcceptanceCoordinator()
    const first = new ConversationAcceptanceHandle(createHandoff())
    const second = new ConversationAcceptanceHandle(createHandoff())

    expect(coordinator).not.toHaveProperty('handles')
    expect(coordinator.register('m1', first)).toBe(true)
    expect(coordinator.register('m1', second)).toBe(false)
    expect(coordinator.lookup('m1')).toBe(first)
    expect(coordinator.remove('m1')).toBe(true)
    expect(coordinator.lookup('m1')).toBeNull()
    expect(coordinator.remove('m1')).toBe(false)
  })
})
