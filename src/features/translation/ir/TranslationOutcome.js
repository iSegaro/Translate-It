/**
 * Translation outcome domain contracts defined by ADR-015.
 *
 * Factories reuse Value Objects created by this module. They shallow-copy
 * caller-owned records and arrays; opaque nested facts remain caller-owned.
 */

const valueObjects = new WeakSet()

export const ExecutionStatus = Object.freeze({
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
})

export const TranslationQuality = Object.freeze({
  COMPLETE: 'COMPLETE',
  PARTIAL: 'PARTIAL',
  NONE: 'NONE',
})

export const UnitDisposition = Object.freeze({
  TRANSLATED: 'TRANSLATED',
  UNRESOLVED: 'UNRESOLVED',
  CANCELLED: 'CANCELLED',
})

/**
 * @typedef {object} TranslationOperation
 * @property {ReadonlyArray<object>} requestedUnits
 * @property {ReadonlyArray<object>} attempts
 * @property {ExecutionResult|null} execution
 * @property {ValidationResult|null} validation
 * @property {TranslationDiagnosticReport|null} diagnostics
 */

/**
 * @typedef {object} ExecutionResult
 * @property {string|null} status
 * @property {string|null} completionReason
 * @property {string|null} terminalReason
 * @property {number} retryCount
 * @property {boolean} providerFailoverUsed
 * @property {ReadonlyArray<object>} attempts
 */

/**
 * @typedef {object} ValidationResult
 * @property {boolean|null} isValid
 * @property {ReadonlyArray<object>} validatedUnits
 * @property {ReadonlyArray<object>} invalidUnits
 * @property {ReadonlyArray<string>} missingUnitIds
 * @property {ReadonlyArray<string>} duplicateUnitIds
 * @property {ReadonlyArray<string>} unknownUnitIds
 * @property {object|null} orderingFacts
 * @property {object|null} cardinality
 * @property {ReadonlyArray<object>} violations
 * @property {object|null} parserEvidence
 */

/**
 * @typedef {object} TranslationUnitResult
 * @property {string|null} id
 * @property {string|null} disposition
 * @property {string|null} [translatedText]
 */

/**
 * @typedef {object} TranslationResult
 * @property {string|null} quality
 * @property {number} requestedCount
 * @property {number} translatedCount
 * @property {number} unresolvedCount
 * @property {number} cancelledCount
 * @property {ReadonlyArray<TranslationUnitResult>} units
 */

/**
 * @typedef {object} TranslationDiagnosticReport
 * @property {ReadonlyArray<object>} entries
 */

/**
 * @typedef {object} TranslationDiagnosticSummary
 * @property {boolean} hasParserRepair
 * @property {boolean} hasValidationFailure
 * @property {string|null} terminalReason
 * @property {number} retryCount
 * @property {boolean} providerFailoverUsed
 */

/**
 * @typedef {object} TranslationOutcome
 * @property {ExecutionResult|null} execution
 * @property {TranslationResult|null} translationResult
 * @property {TranslationDiagnosticSummary} diagnosticSummary
 */

/**
 * @typedef {object} FeatureApplicationResult
 * @property {number} appliedCount
 * @property {number} preservedOriginalCount
 * @property {number} rolledBackCount
 * @property {object|null} state
 */

function copyArray(value) {
  return Object.freeze(Array.isArray(value) ? [...value] : [])
}

function createValueObject(record) {
  const value = Object.freeze(record)
  valueObjects.add(value)
  return value
}

function copyRecord(value) {
  if (valueObjects.has(value)) return value
  return value && typeof value === 'object' && !Array.isArray(value)
    ? createValueObject({ ...value })
    : null
}

function copyRecordArray(value) {
  return Object.freeze(Array.isArray(value) ? value.map(copyRecord) : [])
}

function copyUnitResult(value) {
  if (valueObjects.has(value)) return value
  const unit = copyRecord(value) || {}
  const result = {
    id: unit.id ?? null,
    disposition: unit.disposition ?? null,
  }

  if (unit.translatedText !== undefined) result.translatedText = unit.translatedText
  return createValueObject(result)
}

/**
 * Creates an immutable execution snapshot without deriving execution semantics.
 *
 * @param {Partial<ExecutionResult>} [input]
 * @returns {ExecutionResult}
 */
export function createExecutionResult({
  status = null,
  completionReason = null,
  terminalReason = null,
  retryCount = 0,
  providerFailoverUsed = false,
  attempts = [],
} = {}) {
  return createValueObject({
    status,
    completionReason,
    terminalReason,
    retryCount,
    providerFailoverUsed,
    attempts: copyRecordArray(attempts),
  })
}

/**
 * Creates an immutable validation snapshot without validating or repairing units.
 *
 * @param {Partial<ValidationResult>} [input]
 * @returns {ValidationResult}
 */
export function createValidationResult({
  isValid = null,
  validatedUnits = [],
  invalidUnits = [],
  missingUnitIds = [],
  duplicateUnitIds = [],
  unknownUnitIds = [],
  orderingFacts = null,
  cardinality = null,
  violations = [],
  parserEvidence = null,
} = {}) {
  return createValueObject({
    isValid,
    validatedUnits: copyRecordArray(validatedUnits),
    invalidUnits: copyRecordArray(invalidUnits),
    missingUnitIds: copyArray(missingUnitIds),
    duplicateUnitIds: copyArray(duplicateUnitIds),
    unknownUnitIds: copyArray(unknownUnitIds),
    orderingFacts: copyRecord(orderingFacts),
    cardinality: copyRecord(cardinality),
    violations: copyRecordArray(violations),
    parserEvidence: copyRecord(parserEvidence),
  })
}

/**
 * Creates an immutable translation snapshot without deriving quality or counts.
 *
 * @param {Partial<TranslationResult>} [input]
 * @returns {TranslationResult}
 */
export function createTranslationResult({
  quality = null,
  requestedCount = 0,
  translatedCount = 0,
  unresolvedCount = 0,
  cancelledCount = 0,
  units = [],
} = {}) {
  return createValueObject({
    quality,
    requestedCount,
    translatedCount,
    unresolvedCount,
    cancelledCount,
    units: Object.freeze(Array.isArray(units) ? units.map(copyUnitResult) : []),
  })
}

/**
 * Creates an immutable sanitized diagnostic snapshot. Entries are opaque JSON-safe facts.
 *
 * @param {Partial<TranslationDiagnosticReport>} [input]
 * @returns {TranslationDiagnosticReport}
 */
export function createTranslationDiagnosticReport({ entries = [] } = {}) {
  return createValueObject({ entries: copyRecordArray(entries) })
}

/**
 * Creates an immutable outcome snapshot without changing execution or translation semantics.
 *
 * @param {Partial<TranslationOutcome>} [input]
 * @returns {TranslationOutcome}
 */
export function createTranslationOutcome({
  execution = null,
  translationResult = null,
  diagnosticSummary = {},
} = {}) {
  return createValueObject({
    execution: copyRecord(execution),
    translationResult: copyRecord(translationResult),
    diagnosticSummary: Object.freeze({
      hasParserRepair: diagnosticSummary.hasParserRepair ?? false,
      hasValidationFailure: diagnosticSummary.hasValidationFailure ?? false,
      terminalReason: diagnosticSummary.terminalReason ?? null,
      retryCount: diagnosticSummary.retryCount ?? 0,
      providerFailoverUsed: diagnosticSummary.providerFailoverUsed ?? false,
    }),
  })
}

/**
 * Creates an immutable feature application snapshot without mutating TranslationOutcome.
 *
 * @param {Partial<FeatureApplicationResult>} [input]
 * @returns {FeatureApplicationResult}
 */
export function createFeatureApplicationResult({
  appliedCount = 0,
  preservedOriginalCount = 0,
  rolledBackCount = 0,
  state = null,
} = {}) {
  return createValueObject({
    appliedCount,
    preservedOriginalCount,
    rolledBackCount,
    state: copyRecord(state),
  })
}
