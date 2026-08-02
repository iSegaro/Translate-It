import { describe, expect, it, vi } from 'vitest'
import { TerminalAction, TerminalExecutionRouter, TerminalStatus } from './TerminalExecutionRouter.js'

describe('TerminalExecutionRouter', () => {
  it('forwards canonical unitIds synchronously to the operation', () => {
    const operation = { acceptTerminalUnits: vi.fn(), drainAcceptedUnitIds: vi.fn() }
    const observe = TerminalExecutionRouter.createTerminalUnitsObserver(operation)

    expect(typeof observe).toBe('function')

    observe(['first', 'unknown'])
    observe(['first'])

    expect(operation.acceptTerminalUnits).toHaveBeenCalledTimes(2)
    expect(operation.acceptTerminalUnits).toHaveBeenCalledWith(['first', 'unknown'])
    expect(operation.acceptTerminalUnits).toHaveBeenCalledWith(['first'])
  })

  it('is optional and fail-open when the operation is absent', () => {
    const observe = TerminalExecutionRouter.createTerminalUnitsObserver(null)

    expect(() => observe(['first'])).not.toThrow()
  })

  it('is fail-open when the operation rejects an observation', () => {
    const operation = {
      acceptTerminalUnits: vi.fn(() => { throw new Error('ignore') }),
      drainAcceptedUnitIds: vi.fn(),
    }
    const observe = TerminalExecutionRouter.createTerminalUnitsObserver(operation)

    expect(() => observe(['first'])).not.toThrow()
  })

  it('consumes drainAcceptedUnitIds at terminal routing', () => {
    const operation = {
      acceptTerminalUnits: vi.fn(),
      drainAcceptedUnitIds: vi.fn(() => Object.freeze(['first'])),
    }

    const outcome = TerminalExecutionRouter.routeTerminalExecution(operation, { status: TerminalStatus.COMPLETED })

    expect(operation.drainAcceptedUnitIds).toHaveBeenCalledTimes(1)
    expect(outcome).toEqual({ action: TerminalAction.SETTLE, acceptedUnitIds: ['first'] })
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
