import { createTranslationDiagnosticReport } from './TranslationOutcome.js'

const MAX_DIAGNOSTIC_ENTRIES = 100
const MAX_STRING_LENGTH = 256
const SettlementState = Object.freeze({
  UNSETTLED: Symbol('UNSETTLED'),
  SETTLED: Symbol('SETTLED'),
  CANCELLED: Symbol('CANCELLED'),
})
const EMPTY_CANCELLED_UNIT_IDS = Object.freeze([])

export const RecoveryFinalOutcome = Object.freeze({
  NONE: 'NONE',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  INCOMPLETE: 'INCOMPLETE',
  SUPERSEDED: 'SUPERSEDED',
})

export function deriveRecoverySummary(report, terminalContext = {}) {
  const passes = []
  const providers = new Map()
  for (const entry of Array.isArray(report?.entries) ? report.entries : []) {
    if (entry?.type === 'RECOVERY_TRIGGERED') {
      const pass = { provider: entry.provider, terminal: null }
      passes.push(pass)
      const fact = providers.get(pass.provider) || { provider: pass.provider, structuredResponseViolations: 0, recoveryPasses: 0, recoverySuccesses: 0, recoveryFailures: 0, incompleteRecoveries: 0 }
      fact.structuredResponseViolations++
      fact.recoveryPasses++
      providers.set(pass.provider, fact)
    } else if ((entry?.type === 'RECOVERY_SUCCEEDED' || entry?.type === 'RECOVERY_FAILED')) {
      const pass = [...passes].reverse().find(item => item.terminal === null)
      if (pass) {
        pass.terminal = entry.type
        const provider = entry.provider || pass.provider
        const fact = providers.get(provider) || { provider, structuredResponseViolations: 0, recoveryPasses: 0, recoverySuccesses: 0, recoveryFailures: 0, incompleteRecoveries: 0 }
        if (entry.type === 'RECOVERY_SUCCEEDED') fact.recoverySuccesses++
        else fact.recoveryFailures++
        providers.set(provider, fact)
      }
    }
  }
  for (const pass of passes.filter(item => item.terminal === null)) providers.get(pass.provider)?.incompleteRecoveries++
  const last = passes.at(-1)
  const success = passes.some(item => item.terminal === 'RECOVERY_SUCCEEDED')
  const failure = passes.some(item => item.terminal === 'RECOVERY_FAILED')
  let finalRecoveryOutcome = RecoveryFinalOutcome.NONE
  if (last) {
    if (last.terminal === 'RECOVERY_SUCCEEDED' && terminalContext.operationSucceeded) finalRecoveryOutcome = RecoveryFinalOutcome.SUCCEEDED
    else if (last.terminal === 'RECOVERY_FAILED' && terminalContext.operationSucceeded) finalRecoveryOutcome = RecoveryFinalOutcome.SUPERSEDED
    else if (last.terminal === 'RECOVERY_FAILED' && terminalContext.terminalStatus === 'failed') finalRecoveryOutcome = RecoveryFinalOutcome.FAILED
    else finalRecoveryOutcome = RecoveryFinalOutcome.INCOMPLETE
  }
  const providerFacts = Object.freeze([...providers.values()].map(fact => Object.freeze(fact)))
  return Object.freeze({ structuredResponseViolations: passes.length, recoveryPasses: passes.length, hadRecovery: passes.length > 0, hadRecoverySuccess: success, hadRecoveryFailure: failure, recoveryIncomplete: passes.some(item => item.terminal === null), finalRecoveryOutcome, providerFacts })
}

function safeString(value) {
  return typeof value === 'string' ? value.slice(0, MAX_STRING_LENGTH) : undefined
}

function safeNumber(value) {
  return Number.isFinite(value) ? value : undefined
}

function sanitizeDiagnostic(messageId, fact = {}) {
  const diagnostic = {
    type: safeString(fact.type) || 'DIAGNOSTIC',
    stage: safeString(fact.stage) || 'unknown',
    messageId,
    timestamp: safeNumber(fact.timestamp) ?? Date.now(),
  }

  for (const key of ['batchIndex', 'attempt', 'count', 'expectedCount', 'receivedCount', 'missingCount']) {
    const value = safeNumber(fact[key])
    if (value !== undefined) diagnostic[key] = value
  }

  for (const key of ['provider', 'reason', 'code']) {
    const value = safeString(fact[key])
    if (value !== undefined) diagnostic[key] = value
  }

  for (const key of ['repaired', 'fallback', 'cancelled']) {
    if (typeof fact[key] === 'boolean') diagnostic[key] = fact[key]
  }

  return diagnostic
}

/**
 * Creates the private runtime context for one messageId. It is never serialized
 * or sent through messaging; only its immutable terminal report leaves it.
 */
export function createTranslationOperation(messageId, manifest = null) {
  const diagnostics = []
  const manifestUnits = Array.isArray(manifest?.units) ? manifest.units : []
  let unitStates = null
  function getUnitStates() {
    if (unitStates) return unitStates

    unitStates = new Map()
    for (const unit of manifestUnits) {
      if (typeof unit?.unitId === 'string' && !unitStates.has(unit.unitId)) {
        unitStates.set(unit.unitId, SettlementState.UNSETTLED)
      }
    }
    return unitStates
  }
  let droppedDiagnostics = 0
  let report = null
  let cancelledUnitIds = null
  let pendingAcceptedUnitIds = null
  let pendingAcceptedUnitIdSet = null
  let finalized = false

  function getPendingAcceptedStorage() {
    if (pendingAcceptedUnitIds) return { list: pendingAcceptedUnitIds, set: pendingAcceptedUnitIdSet }

    pendingAcceptedUnitIds = []
    pendingAcceptedUnitIdSet = new Set()
    return { list: pendingAcceptedUnitIds, set: pendingAcceptedUnitIdSet }
  }

  return {
    messageId,
    appendDiagnostic(fact) {
      if (finalized) return false
      if (diagnostics.length >= MAX_DIAGNOSTIC_ENTRIES - 1) {
        droppedDiagnostics++
        return false
      }
      diagnostics.push(sanitizeDiagnostic(messageId, fact))
      return true
    },
    settleUnits(unitIds) {
      const accepted = []
      const values = typeof unitIds === 'string'
        ? [unitIds]
        : (unitIds && typeof unitIds[Symbol.iterator] === 'function' ? unitIds : [])

      const states = getUnitStates()
      for (const unitId of values) {
        if (states.get(unitId) !== SettlementState.UNSETTLED) continue
        states.set(unitId, SettlementState.SETTLED)
        accepted.push(unitId)
      }
      return Object.freeze(accepted)
    },
    cancelRemaining() {
      if (cancelledUnitIds) return cancelledUnitIds

      const accepted = []
      const states = getUnitStates()
      for (const [unitId, state] of states) {
        if (state !== SettlementState.UNSETTLED) continue
        states.set(unitId, SettlementState.CANCELLED)
        accepted.push(unitId)
      }
      cancelledUnitIds = Object.freeze(accepted)
      return cancelledUnitIds
    },
    snapshotCancelled() {
      return cancelledUnitIds || EMPTY_CANCELLED_UNIT_IDS
    },
    acceptTerminalUnits(unitIds) {
      const values = typeof unitIds === 'string'
        ? [unitIds]
        : (unitIds && typeof unitIds[Symbol.iterator] === 'function' ? unitIds : [])

      const states = getUnitStates()
      const { list, set } = getPendingAcceptedStorage()

      for (const unitId of values) {
        if (typeof unitId !== 'string' || !states.has(unitId) || set.has(unitId)) continue
        set.add(unitId)
        list.push(unitId)
      }
    },
    drainAcceptedUnitIds() {
      if (!pendingAcceptedUnitIds) return EMPTY_CANCELLED_UNIT_IDS

      const snapshot = Object.freeze([...pendingAcceptedUnitIds])
      pendingAcceptedUnitIds = null
      pendingAcceptedUnitIdSet = null
      return snapshot
    },
    finalize() {
      if (report) return report
      finalized = true
      if (droppedDiagnostics > 0) {
        diagnostics.push(sanitizeDiagnostic(messageId, {
          type: 'DIAGNOSTICS_TRUNCATED',
          stage: 'operation',
          count: droppedDiagnostics,
        }))
      }
      report = createTranslationDiagnosticReport({ entries: diagnostics })
      return report
    },
    get finalized() {
      return finalized
    },
  }
}

export function appendTranslationDiagnostic(executionContext, fact) {
  return executionContext?.operation?.appendDiagnostic(fact) || false
}

export function finalizeTranslationOperation(executionContext) {
  return executionContext?.operation?.finalize() || null
}
