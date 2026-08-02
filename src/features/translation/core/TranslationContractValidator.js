import { createValidationResult } from '../ir/TranslationOutcome.js'

function getRequestedId(unit, index) {
  if (!unit || typeof unit !== 'object') return String(index)
  return String(unit.i || unit.uid || unit.id || index)
}

function findRequestedIndex(responseId, requestedUnits, expectedCount) {
  if (typeof responseId === 'string') {
    return requestedUnits.findIndex((unit) => {
      if (!unit || typeof unit !== 'object') return false
      return (unit.i || unit.uid || unit.id) === responseId
    })
  }

  const index = Number.parseInt(responseId, 10)
  return index >= 0 && index < expectedCount ? index : -1
}

function createViolation(code, index) {
  return Object.freeze({ code, index })
}

/**
 * Validates parser-normalized response candidates without changing execution or
 * legacy parser mapping behavior.
 */
export const TranslationContractValidator = {
  validate(snapshot, requestedUnits = [], { expectedCount = requestedUnits.length } = {}) {
    const units = Array.isArray(snapshot?.units) ? snapshot.units : []
    const requestedIds = requestedUnits.map(getRequestedId)
    const hasResponseIds = units.some((unit) => unit.hasResponseId)
    const seenIndexes = new Set()
    const missingUnitIds = []
    const duplicateUnitIds = []
    const unknownUnitIds = []
    const validatedUnits = []
    const invalidUnits = []
    const violations = []
    let isInRequestOrder = true

    units.forEach((unit, index) => {
      const unitViolations = []
      let requestedIndex = index

      if (hasResponseIds) {
        if (!unit.hasResponseId) {
          unitViolations.push('MISSING_RESPONSE_ID')
        } else {
          requestedIndex = findRequestedIndex(unit.responseId, requestedUnits, expectedCount)
          if (requestedIndex === -1) {
            unknownUnitIds.push(String(unit.responseId))
            unitViolations.push('UNKNOWN_RESPONSE_ID')
          } else if (seenIndexes.has(requestedIndex)) {
            duplicateUnitIds.push(requestedIds[requestedIndex])
            unitViolations.push('DUPLICATE_RESPONSE_ID')
          } else {
            seenIndexes.add(requestedIndex)
            if (requestedIndex !== index) isInRequestOrder = false
          }
        }
      } else if (index >= expectedCount) {
        unitViolations.push('UNEXPECTED_POSITION')
      }

      if (!unit.hasTranslatedText || typeof unit.translatedText !== 'string') {
        unitViolations.push('INVALID_TRANSLATED_TEXT')
      } else if (unit.translatedText.trim() === '') {
        unitViolations.push('EMPTY_TRANSLATED_TEXT')
      }

      const fact = Object.freeze({
        index,
        requestedIndex: requestedIndex >= 0 ? requestedIndex : null,
        responseId: unit.hasResponseId ? String(unit.responseId) : null,
      })
      validatedUnits.push(fact)
      if (unitViolations.length > 0) {
        invalidUnits.push(fact)
        unitViolations.forEach((code) => violations.push(createViolation(code, index)))
      }
    })

    if (hasResponseIds) {
      requestedIds.forEach((id, index) => {
        if (!seenIndexes.has(index)) missingUnitIds.push(id)
      })
    } else if (units.length < expectedCount) {
      missingUnitIds.push(...requestedIds.slice(units.length, expectedCount))
    }

    const cardinality = Object.freeze({ expectedCount, receivedCount: units.length })
    if (units.length !== expectedCount) violations.push(createViolation('CARDINALITY_MISMATCH', null))
    if (missingUnitIds.length > 0) violations.push(createViolation('MISSING_REQUESTED_UNITS', null))

    return createValidationResult({
      isValid: violations.length === 0,
      validatedUnits,
      invalidUnits,
      missingUnitIds,
      duplicateUnitIds,
      unknownUnitIds,
      orderingFacts: { mode: hasResponseIds ? 'IDENTITY' : 'POSITIONAL', isInRequestOrder },
      cardinality,
      violations,
      parserEvidence: snapshot?.parserEvidence || null,
    })
  },
}
