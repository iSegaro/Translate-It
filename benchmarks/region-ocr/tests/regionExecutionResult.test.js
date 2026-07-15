import { describe, expect, it } from 'vitest'

import {
  REGION_EXECUTION_STATUSES,
  RegionExecutionResultValidationError,
  RegionExecutionStatus,
  createRegionExecutionResult,
  finalizeRegionExecutionResult,
  validateRegionExecutionResult
} from '../execution-results/index.js'

function createValidResult(overrides = {}) {
  return createRegionExecutionResult({
    documentId: 'document-01',
    regionId: 'region-01',
    status: RegionExecutionStatus.RECOGNIZED,
    payload: { opaque: { text: 'raw runtime payload', confidence: 0.95 } },
    ...overrides
  })
}

describe('Region OCR benchmark execution result contract', () => {
  it('publishes immutable status definitions', () => {
    expect(RegionExecutionStatus).toEqual({
      RECOGNIZED: 'recognized',
      FAILED: 'failed',
      CANCELLED: 'cancelled',
      SKIPPED: 'skipped'
    })
    expect(REGION_EXECUTION_STATUSES).toEqual(['recognized', 'failed', 'cancelled', 'skipped'])
    expect(Object.isFrozen(RegionExecutionStatus)).toBe(true)
    expect(Object.isFrozen(REGION_EXECUTION_STATUSES)).toBe(true)
  })

  it('accepts valid execution results for all statuses', () => {
    for (const status of REGION_EXECUTION_STATUSES) {
      expect(validateRegionExecutionResult(createValidResult({ status }))).toMatchObject({
        valid: true,
        errors: []
      })
    }
  })

  it('rejects invalid status with structured errors', () => {
    const result = validateRegionExecutionResult(createValidResult({ status: 'ocr-specific-status' }))

    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'invalid_status',
      path: '$.status'
    }))
  })

  it('rejects missing required fields', () => {
    const result = validateRegionExecutionResult({ payload: null })

    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing_required_field', path: '$.documentId' }),
      expect.objectContaining({ code: 'missing_required_field', path: '$.regionId' }),
      expect.objectContaining({ code: 'missing_required_field', path: '$.status' })
    ]))
  })

  it('rejects malformed identifiers', () => {
    const result = validateRegionExecutionResult(createValidResult({
      documentId: 'Document 01',
      regionId: '../region'
    }))

    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid_identifier', path: '$.documentId' }),
      expect.objectContaining({ code: 'invalid_identifier', path: '$.regionId' })
    ]))
  })

  it('finalizes deeply immutable execution results', () => {
    const finalized = finalizeRegionExecutionResult(createValidResult())

    expect(Object.isFrozen(finalized)).toBe(true)
    expect(Object.isFrozen(finalized.payload.opaque)).toBe(true)
    expect(() => {
      finalized.payload.opaque.text = 'mutated'
    }).toThrow(TypeError)
  })

  it('preserves unknown fields during creation and finalization', () => {
    const result = finalizeRegionExecutionResult(createValidResult({
      futureRuntimeMetadata: { retained: true }
    }))

    expect(result.futureRuntimeMetadata.retained).toBe(true)
    expect(Object.isFrozen(result.futureRuntimeMetadata)).toBe(true)
  })

  it('keeps payload opaque and does not validate OCR-shaped contents', () => {
    const payload = {
      rawOutput: { nested: ['anything'] },
      invalidOcrField: Symbol('runtime-only')
    }
    const result = validateRegionExecutionResult(createValidResult({ payload }))

    expect(result).toMatchObject({ valid: true, errors: [] })
    expect(result.value.payload).toBe(payload)
  })

  it('returns deterministic validation errors', () => {
    const invalid = {
      documentId: 'Document 01',
      regionId: '',
      status: 'bad'
    }

    const first = validateRegionExecutionResult(structuredClone(invalid)).errors
    const second = validateRegionExecutionResult(structuredClone(invalid)).errors

    expect(second).toEqual(first)
    expect(first.map(({ path }) => path)).toEqual([...first.map(({ path }) => path)].sort())
  })

  it('throws structured errors instead of freezing invalid results', () => {
    const invalid = createValidResult({ status: 'bad' })

    expect(() => finalizeRegionExecutionResult(invalid)).toThrow(RegionExecutionResultValidationError)
    try {
      finalizeRegionExecutionResult(invalid)
    } catch (caught) {
      expect(caught.errors).toContainEqual(expect.objectContaining({ code: 'invalid_status' }))
      expect(Object.isFrozen(invalid)).toBe(false)
    }
  })
})
