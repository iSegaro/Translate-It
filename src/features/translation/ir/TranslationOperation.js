import { createTranslationDiagnosticReport } from './TranslationOutcome.js'

const MAX_DIAGNOSTIC_ENTRIES = 100
const MAX_STRING_LENGTH = 256

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
export function createTranslationOperation(messageId) {
  const diagnostics = []
  let droppedDiagnostics = 0
  let report = null
  let finalized = false

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
