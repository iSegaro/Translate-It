import { describe, expect, it, vi } from 'vitest'
import { TerminalAction, TerminalExecutionRouter, TerminalStatus } from './TerminalExecutionRouter.js'

const manifestUnits = Object.freeze([
  Object.freeze({ unitId: 'unit-0', requestIndex: 0 }),
  Object.freeze({ unitId: 'unit-1', requestIndex: 1 }),
])

describe('TerminalExecutionRouter', () => {
  it('accepts ManifestUnit references and extracts canonical unitIds for the operation', () => {
    const operation = { acceptTerminalUnits: vi.fn(), drainAcceptedUnitIds: vi.fn() }
    const observe = TerminalExecutionRouter.createTerminalUnitsObserver(operation)

    expect(typeof observe).toBe('function')

    observe([manifestUnits[0], manifestUnits[1]])
    observe([manifestUnits[0]])

    expect(operation.acceptTerminalUnits).toHaveBeenCalledTimes(2)
    expect(operation.acceptTerminalUnits).toHaveBeenCalledWith(['unit-0', 'unit-1'])
    expect(operation.acceptTerminalUnits).toHaveBeenCalledWith(['unit-0'])
  })

  it('never forwards ManifestUnit references to the operation', () => {
    const operation = { acceptTerminalUnits: vi.fn(), drainAcceptedUnitIds: vi.fn() }
    const observe = TerminalExecutionRouter.createTerminalUnitsObserver(operation)

    observe(manifestUnits)

    expect(operation.acceptTerminalUnits).not.toHaveBeenCalledWith(manifestUnits)
    expect(operation.acceptTerminalUnits).toHaveBeenCalledWith(['unit-0', 'unit-1'])
  })

  it('is optional and fail-open when the operation is absent', () => {
    const observe = TerminalExecutionRouter.createTerminalUnitsObserver(null)

    expect(() => observe(manifestUnits)).not.toThrow()
  })

  it('is fail-open when the operation rejects an observation', () => {
    const operation = {
      acceptTerminalUnits: vi.fn(() => { throw new Error('ignore') }),
      drainAcceptedUnitIds: vi.fn(),
    }
    const observe = TerminalExecutionRouter.createTerminalUnitsObserver(operation)

    expect(() => observe(manifestUnits)).not.toThrow()
  })

  it('drains once and settles once when COMPLETED', () => {
    const operation = {
      acceptTerminalUnits: vi.fn(),
      drainAcceptedUnitIds: vi.fn(() => Object.freeze(['unit-0'])),
      settleUnits: vi.fn(),
    }

    const outcome = TerminalExecutionRouter.routeTerminalExecution(operation, { status: TerminalStatus.COMPLETED })

    expect(operation.drainAcceptedUnitIds).toHaveBeenCalledTimes(1)
    expect(operation.settleUnits).toHaveBeenCalledTimes(1)
    expect(operation.settleUnits).toHaveBeenCalledWith(['unit-0'])
    expect(outcome).toEqual({ action: TerminalAction.SETTLE, acceptedUnitIds: ['unit-0'] })
    expect(Object.isFrozen(outcome.acceptedUnitIds)).toBe(true)
  })

  it('settles nothing new when COMPLETED routing is repeated', () => {
    let pending = ['unit-0']
    const operation = {
      acceptTerminalUnits: vi.fn(),
      drainAcceptedUnitIds: vi.fn(() => {
        const next = Object.freeze([...pending])
        pending = []
        return next
      }),
      settleUnits: vi.fn(),
    }

    TerminalExecutionRouter.routeTerminalExecution(operation, { status: TerminalStatus.COMPLETED })
    const second = TerminalExecutionRouter.routeTerminalExecution(operation, { status: TerminalStatus.COMPLETED })

    expect(operation.drainAcceptedUnitIds).toHaveBeenCalledTimes(2)
    expect(operation.settleUnits).toHaveBeenCalledTimes(1)
    expect(operation.settleUnits).toHaveBeenCalledWith(['unit-0'])
    expect(second).toEqual({ action: TerminalAction.SETTLE, acceptedUnitIds: [] })
  })

  it('never drains or settles when FAILED', () => {
    const operation = {
      acceptTerminalUnits: vi.fn(),
      drainAcceptedUnitIds: vi.fn(),
      settleUnits: vi.fn(),
    }

    const outcome = TerminalExecutionRouter.routeTerminalExecution(operation, { status: TerminalStatus.FAILED })

    expect(operation.drainAcceptedUnitIds).not.toHaveBeenCalled()
    expect(operation.settleUnits).not.toHaveBeenCalled()
    expect(outcome).toEqual({ action: TerminalAction.NONE, acceptedUnitIds: [] })
    expect(Object.isFrozen(outcome.acceptedUnitIds)).toBe(true)
  })

  it('never drains or settles when TIMEOUT', () => {
    const operation = {
      acceptTerminalUnits: vi.fn(),
      drainAcceptedUnitIds: vi.fn(),
      settleUnits: vi.fn(),
    }

    const outcome = TerminalExecutionRouter.routeTerminalExecution(operation, { status: TerminalStatus.TIMEOUT })

    expect(operation.drainAcceptedUnitIds).not.toHaveBeenCalled()
    expect(operation.settleUnits).not.toHaveBeenCalled()
    expect(outcome).toEqual({ action: TerminalAction.NONE, acceptedUnitIds: [] })
    expect(Object.isFrozen(outcome.acceptedUnitIds)).toBe(true)
  })

  it('maps terminal statuses to the settle/cancelRemaining/none policy', () => {
    const operation = (drained = []) => ({
      acceptTerminalUnits: vi.fn(),
      drainAcceptedUnitIds: vi.fn(() => Object.freeze(drained)),
    })

    expect(TerminalExecutionRouter.routeTerminalExecution(operation(), { status: TerminalStatus.COMPLETED }).action)
      .toBe(TerminalAction.SETTLE)
    expect(TerminalExecutionRouter.routeTerminalExecution(operation(), { status: TerminalStatus.CANCELLED }).action)
      .toBe(TerminalAction.CANCEL_REMAINING)
    expect(TerminalExecutionRouter.routeTerminalExecution(operation(), { status: TerminalStatus.FAILED }).action)
      .toBe(TerminalAction.NONE)
    expect(TerminalExecutionRouter.routeTerminalExecution(operation(), { status: TerminalStatus.TIMEOUT }).action)
      .toBe(TerminalAction.NONE)
  })
})
