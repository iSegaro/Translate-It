import { describe, expect, it, vi } from 'vitest'

import { createExecutionOperation } from './executionOperation.js'

describe('ExecutionOperation', () => {
  it('creates an immutable handle with immutable context', () => {
    const promise = Promise.resolve({ status: 'recognized' })
    const cancel = vi.fn()
    const operation = createExecutionOperation({
      promise,
      cancel,
      context: { target: 'ocr', runId: 1, identity: { regionId: 'region-1' } }
    })

    expect(operation).toEqual({ promise, cancel, context: { target: 'ocr', runId: 1, identity: { regionId: 'region-1' } } })
    expect(Object.isFrozen(operation)).toBe(true)
    expect(Object.isFrozen(operation.context)).toBe(true)
    expect(Object.isFrozen(operation.context.identity)).toBe(true)
    expect(() => { operation.cancel = vi.fn() }).toThrow(TypeError)
    expect(() => { operation.context.runId = 2 }).toThrow(TypeError)
    expect(() => { operation.context.identity.regionId = 'region-2' }).toThrow(TypeError)

    operation.cancel()
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('rejects incomplete operation members', () => {
    expect(() => createExecutionOperation({ cancel: vi.fn() })).toThrow(TypeError)
    expect(() => createExecutionOperation({ promise: Promise.resolve() })).toThrow(TypeError)
  })
})
