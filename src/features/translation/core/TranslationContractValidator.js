import { createValidationResult } from '../ir/TranslationOutcome.js'
import { MappingStrategy } from '../ir/RequestUnitManifest.js'
import { parseV3Intervals } from './V3IntervalParser.js'

function findRequestedIndex(responseId, manifestUnits, expectedCount, responseIdentityMode = 'logical') {
  if (responseIdentityMode === 'positional-wire') {
    if (!/^(0|[1-9]\d*)$/.test(String(responseId))) return -1
    const requestIndex = Number(responseId)
    return Number.isInteger(requestIndex) && requestIndex >= 0 && requestIndex < expectedCount
      ? requestIndex
      : -1
  }
  const identityIndex = manifestUnits.findIndex((unit) => unit.unitId === String(responseId))
  return identityIndex >= 0 && identityIndex < expectedCount ? identityIndex : -1
}

function createViolation(code, index) {
  return Object.freeze({ code, index })
}

function getSourceText(source) {
  return typeof source === 'object' && source !== null
    ? (source.t ?? source.text ?? '')
    : source
}

function validateV3Parent(sourceText, translatedText, parentId = 'unknown') {
  const source = parseV3Intervals(sourceText, { grammar: 'ti' })
  if (!source.structuralFacts.isV3) return null

  const translated = parseV3Intervals(translatedText, { grammar: 'ti' })
  const violations = []
  const sourceMarkerIds = source.markers.map(({ normalizedIdentity }) => normalizedIdentity)
  const translatedMarkerIds = translated.markers.map(({ normalizedIdentity }) => normalizedIdentity)
  const sourceIdSet = new Set(sourceMarkerIds)
  const translatedIdSet = new Set(translatedMarkerIds)
  const duplicateIds = translatedMarkerIds.filter((id, index) => translatedMarkerIds.indexOf(id) !== index)
  const missingIds = sourceMarkerIds.filter((id) => !translatedIdSet.has(id))
  const unexpectedIds = translatedMarkerIds.filter((id) => !sourceIdSet.has(id))

  if (sourceMarkerIds.length !== translatedMarkerIds.length) {
    violations.push({
      code: 'V3_MARKER_COUNT_MISMATCH',
      reason: 'MARKER_COUNT_MISMATCH',
      parentId,
      expectedMarkerCount: sourceMarkerIds.length,
      actualMarkerCount: translatedMarkerIds.length,
    })
  }
  if (sourceMarkerIds.length === translatedMarkerIds.length
      && (missingIds.length > 0 || unexpectedIds.length > 0)
      && sourceMarkerIds.some((id, index) => id !== translatedMarkerIds[index])) {
    violations.push({
      code: 'V3_MARKER_IDENTITY_MISMATCH',
      reason: 'MARKER_SEQUENCE_MISMATCH',
      parentId,
    })
  }
  duplicateIds.forEach((markerId) => {
    violations.push({
      code: 'V3_DUPLICATE_MARKER',
      reason: 'MARKER_SEQUENCE_MISMATCH',
      parentId,
      markerId,
    })
  })
  missingIds.forEach((markerId) => {
    violations.push({
      code: 'V3_MISSING_MARKER',
      reason: 'MARKER_COUNT_MISMATCH',
      parentId,
      markerId,
    })
  })
  unexpectedIds.forEach((markerId) => {
    violations.push({
      code: 'V3_UNEXPECTED_MARKER',
      reason: 'MARKER_COUNT_MISMATCH',
      parentId,
      markerId,
    })
  })

  if (sourceMarkerIds.length === translatedMarkerIds.length
      && missingIds.length === 0
      && unexpectedIds.length === 0
      && sourceMarkerIds.some((id, index) => id !== translatedMarkerIds[index])) {
    violations.push({
      code: 'V3_MARKER_ORDER_MISMATCH',
      reason: 'MARKER_SEQUENCE_MISMATCH',
      parentId,
    })
  }

  const intervalCount = Math.min(source.intervals.length, translated.intervals.length)
  for (let index = 0; index < intervalCount; index++) {
    const sourceInterval = source.intervals[index]
    const translatedInterval = translated.intervals[index]
    if (sourceInterval.text.trim() !== '' && translatedInterval.text.trim() === '') {
      violations.push({
        code: 'V3_EMPTY_TRANSLATED_INTERVAL',
        parentId,
        intervalIndex: index,
        markerId: sourceInterval.markerId,
      })
    }
  }

  const orphanDelimiters = translated.structuralFacts.orphanDelimiters
  if (Array.isArray(orphanDelimiters) && orphanDelimiters.length > 0) {
    const firstOrphan = orphanDelimiters[0]
    const intervalIndex = translated.intervals.findIndex((interval) => (
      firstOrphan >= interval.start && firstOrphan < interval.end
    ))
    violations.push({
      code: 'V3_ORPHAN_DELIMITER',
      reason: 'ORPHAN_DELIMITER',
      parentId,
      count: orphanDelimiters.length,
      intervalIndex,
      markerId: intervalIndex >= 0 ? source.intervals[intervalIndex]?.markerId : null,
    })
  }

  return {
    isValid: violations.length === 0,
    violations,
    source,
    translated,
  }
}

/**
 * Validates parser-normalized response candidates without changing execution or
 * legacy parser mapping behavior.
 */
export const TranslationContractValidator = {
  validate(manifestView, snapshot, parserEvidence = snapshot?.parserEvidence, options = {}) {
    const units = Array.isArray(snapshot?.units) ? snapshot.units : []
    const manifestUnits = Array.isArray(manifestView?.units)
      ? manifestView.units
      : []
    const expectedCount = manifestUnits.length
    const responseIdentityMode = options.responseIdentityMode
      || (manifestView?.declaredMappingStrategy === MappingStrategy.IDENTITY_REQUIRED ? 'logical' : 'positional-wire')
    const requestedIds = manifestUnits.map(({ unitId, requestIndex }) => (
      responseIdentityMode === 'logical' ? unitId : String(requestIndex)
    ))
    const hasResponseIds = units.some((unit) => unit.hasResponseId)
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
            requestedIndex = findRequestedIndex(unit.responseId, manifestUnits, expectedCount, responseIdentityMode)
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

      const sourceText = getSourceText(options.sourceItems?.[requestedIndex >= 0 ? requestedIndex : index])
      const v3Result = typeof sourceText === 'string' && sourceText.includes('@@TI_SEG_')
        ? validateV3Parent(sourceText, unit.translatedText, unit.responseId || requestedIds[requestedIndex] || 'unknown')
        : null
      if (v3Result && !v3Result.isValid) {
        v3Result.violations.forEach(({ code }) => unitViolations.push(code))
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
      orderingFacts: {
        mode: hasResponseIds && responseIdentityMode === 'positional-wire'
          ? 'POSITIONAL_WIRE'
          : (hasResponseIds ? 'IDENTITY' : 'POSITIONAL'),
        isInRequestOrder,
      },
      cardinality,
      violations,
      parserEvidence: parserEvidence || null,
    })
  },

  validateV3Parent,
}
