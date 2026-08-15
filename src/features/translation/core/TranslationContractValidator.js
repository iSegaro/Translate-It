import { createValidationResult } from '../ir/TranslationOutcome.js'
import { MappingStrategy } from '../ir/RequestUnitManifest.js'

function findRequestedIndex(responseId, manifestUnits, expectedCount) {
  if (typeof responseId === 'string') {
    return manifestUnits.findIndex((unit) => unit.unitId === responseId)
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
  validate(manifestView, snapshot, parserEvidence = snapshot?.parserEvidence) {
    const units = Array.isArray(snapshot?.units) ? snapshot.units : []
    const manifestUnits = Array.isArray(manifestView?.units)
      ? manifestView.units
      : []
    const expectedCount = manifestUnits.length
    const requestedIds = manifestUnits.map(({ unitId, requestIndex }) => (
      manifestView?.declaredMappingStrategy === MappingStrategy.IDENTITY_REQUIRED ? unitId : String(requestIndex)
    ))
    const hasResponseIds = manifestView?.declaredMappingStrategy === MappingStrategy.IDENTITY_REQUIRED
      && units.some((unit) => unit.hasResponseId)
    const seenIndexes = new Set()
    const missingUnitIds = []
    const duplicateUnitIds = []
    const unknownUnitIds = []
    const invalidUnits = []
    const violations = []
    const requestFacts = Array.from({ length: expectedCount }, () => ({ unit: null, violationCodes: [] }))
    let isInRequestOrder = true

    units.forEach((unit, index) => {
      const unitViolations = []
      let requestedIndex = index

      if (hasResponseIds) {
        if (!unit.hasResponseId) {
          unitViolations.push('MISSING_RESPONSE_ID')
        } else {
          requestedIndex = findRequestedIndex(unit.responseId, manifestUnits, expectedCount)
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
      if (requestedIndex >= 0 && requestedIndex < expectedCount) {
        const requestFact = requestFacts[requestedIndex]
        if (requestFact.unit === null) requestFact.unit = unit
        requestFact.violationCodes.push(...unitViolations)
      }
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

    const validatedUnits = manifestUnits.map((manifestUnit, requestIndex) => {
      const requestFact = requestFacts[requestIndex]
      const violationCodes = requestFact.violationCodes.length > 0
        ? requestFact.violationCodes
        : (requestFact.unit ? [] : ['MISSING_REQUESTED_UNIT'])
      const translatedText = violationCodes.length === 0 && typeof requestFact.unit?.translatedText === 'string'
        ? requestFact.unit.translatedText
        : undefined
      return Object.freeze({
        requestIndex: manifestUnit.requestIndex,
        unitId: manifestUnit.unitId,
        ...(translatedText !== undefined && { translatedText }),
        violationCodes: Object.freeze([...violationCodes]),
      })
    })

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
      parserEvidence: parserEvidence || null,
    })
  },
}
