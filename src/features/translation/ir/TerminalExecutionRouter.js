/**
 * Terminal Execution Router - Pure execution-policy boundary.
 *
 * Decides how accepted terminal units map to future ledger settlement.
 * Stateless: owns no execution state; TranslationOperation remembers.
 * PR4B.3: architecture-only. No ledger wiring.
 */

const EMPTY_ACCEPTED_UNIT_IDS = Object.freeze([])

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
   * Consumes pending accepted units exactly once at terminal execution.
   * Decides policy only; never touches the ledger (architecture-only).
   */
  routeTerminalExecution(operation, { status }) {
    const action = policyForStatus(status)
    const acceptedUnitIds = operation?.drainAcceptedUnitIds?.() || EMPTY_ACCEPTED_UNIT_IDS

    return Object.freeze({ action, acceptedUnitIds })
  },
})
