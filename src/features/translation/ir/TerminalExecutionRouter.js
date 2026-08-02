/**
 * Terminal Execution Router - Pure execution-policy boundary.
 *
 * Decides how accepted terminal units map to future ledger settlement.
 * Stateless: owns no execution state; TranslationOperation remembers.
 * PR4B.5: COMPLETED settlement active.
 * PR4B.6B: CANCELLED cancelRemaining active. FAILED/TIMEOUT unwired.
 */

const EMPTY_ACCEPTED_UNIT_IDS = Object.freeze([])
const EMPTY_CANCELLED_UNIT_IDS = Object.freeze([])

export const TerminalAction = Object.freeze({
  SETTLE: 'settle',
  CANCEL_REMAINING: 'cancelRemaining',
  NONE: 'none',
})

export const TerminalStatus = Object.freeze({
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
  TIMEOUT: 'timeout',
})

function policyForStatus(status) {
  if (status === TerminalStatus.COMPLETED) return TerminalAction.SETTLE
  if (status === TerminalStatus.CANCELLED) return TerminalAction.CANCEL_REMAINING
  return TerminalAction.NONE
}

function extractUnitIds(manifestUnits) {
  return Array.isArray(manifestUnits) ? manifestUnits.map((unit) => unit?.unitId) : []
}

export const TerminalExecutionRouter = Object.freeze({
  /**
   * Returns the synchronous, optional, fail-open terminal acceptance handoff.
   * The executor forwards canonical manifest unit references; only the router
   * extracts execution identity (unitId) from them.
   */
  createTerminalUnitsObserver(operation) {
    return (manifestUnits) => {
      try {
        operation?.acceptTerminalUnits?.(extractUnitIds(manifestUnits))
      } catch {
        /* fail-open */
      }
    }
  },

  /**
   * Routes a terminal transition. Settles drained accepted units for
   * COMPLETED only; NONE actions never drain operation state (critical
   * invariant, keeps FAILED/TIMEOUT/CANCELLED ledgers untouched).
   */
  routeTerminalExecution(operation, { status }) {
    const action = policyForStatus(status)

    if (action === TerminalAction.CANCEL_REMAINING) {
      const cancelledUnitIds = operation?.cancelRemaining?.() || EMPTY_CANCELLED_UNIT_IDS
      return Object.freeze({
        action,
        acceptedUnitIds: EMPTY_ACCEPTED_UNIT_IDS,
        cancelledUnitIds,
      })
    }

    if (action !== TerminalAction.SETTLE) {
      return Object.freeze({
        action,
        acceptedUnitIds: EMPTY_ACCEPTED_UNIT_IDS,
        cancelledUnitIds: EMPTY_CANCELLED_UNIT_IDS,
      })
    }

    const acceptedUnitIds = operation?.drainAcceptedUnitIds?.() || EMPTY_ACCEPTED_UNIT_IDS
    if (acceptedUnitIds.length > 0) {
      operation?.settleUnits?.(acceptedUnitIds)
    }

    return Object.freeze({
      action,
      acceptedUnitIds,
      cancelledUnitIds: EMPTY_CANCELLED_UNIT_IDS,
    })
  },
})
