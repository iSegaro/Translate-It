import { describe, expect, it } from 'vitest'
import {
  ExecutionStatus,
  TranslationQuality,
  UnitDisposition,
  createExecutionResult,
  createFeatureApplicationResult,
  createTranslationDiagnosticReport,
  createTranslationOutcome,
  createTranslationResult,
  createValidationResult,
} from './TranslationOutcome.js'

describe('TranslationOutcome contracts', () => {
  it('exports frozen canonical enum values', () => {
    expect(ExecutionStatus).toEqual({ COMPLETED: 'COMPLETED', FAILED: 'FAILED', CANCELLED: 'CANCELLED' })
    expect(TranslationQuality).toEqual({ COMPLETE: 'COMPLETE', PARTIAL: 'PARTIAL', NONE: 'NONE' })
    expect(UnitDisposition).toEqual({ TRANSLATED: 'TRANSLATED', UNRESOLVED: 'UNRESOLVED', CANCELLED: 'CANCELLED' })
    expect(Object.isFrozen(ExecutionStatus)).toBe(true)
    expect(Object.isFrozen(TranslationQuality)).toBe(true)
    expect(Object.isFrozen(UnitDisposition)).toBe(true)
  })

  it('creates frozen execution and validation snapshots without mutating inputs', () => {
    const attempt = { provider: 'Custom', nested: { retry: 1 } }
    const orderingFacts = { strategy: 'position', nested: { source: 'caller' } }
    const attempts = [attempt]
    const validation = createValidationResult({
      isValid: false,
      validatedUnits: [{ id: '1', translatedText: 'translated' }],
      missingUnitIds: ['2'],
      orderingFacts,
      cardinality: { requested: 2, received: 1 },
      violations: [{ code: 'CARDINALITY' }],
    })
    const cancelledUnitIds = ['unit-1']
    const execution = createExecutionResult({ status: ExecutionStatus.FAILED, attempts, cancelledUnitIds })

    attempts.push({ provider: 'Other' })
    cancelledUnitIds.push('unit-2')
    attempt.provider = 'Changed'
    orderingFacts.strategy = 'changed'

    expect(execution.attempts).toEqual([{ provider: 'Custom', nested: { retry: 1 } }])
    expect(validation.orderingFacts).toEqual({ strategy: 'position', nested: { source: 'caller' } })
    expect(Object.isFrozen(execution)).toBe(true)
    expect(Object.isFrozen(execution.attempts)).toBe(true)
    expect(Object.isFrozen(execution.attempts[0])).toBe(true)
    expect(execution.cancelledUnitIds).toEqual(['unit-1'])
    expect(Object.isFrozen(execution.cancelledUnitIds)).toBe(true)
    expect(Object.isFrozen(validation)).toBe(true)
    expect(Object.isFrozen(validation.validatedUnits)).toBe(true)
    expect(Object.isFrozen(validation.validatedUnits[0])).toBe(true)
    expect(Object.isFrozen(validation.validatedUnits[0].violationCodes)).toBe(true)
    expect(Object.isFrozen(validation.orderingFacts)).toBe(true)
    expect(Object.isFrozen(validation.orderingFacts.nested)).toBe(false)
  })

  it('defaults execution cancellation IDs to an immutable empty array', () => {
    const execution = createExecutionResult()

    expect(execution.cancelledUnitIds).toEqual([])
    expect(Object.isFrozen(execution.cancelledUnitIds)).toBe(true)
  })

  it('preserves caller-supplied translation semantics without deriving quality or source fallback', () => {
    const result = createTranslationResult({
      quality: TranslationQuality.PARTIAL,
      requestedCount: 2,
      translatedCount: 1,
      unresolvedCount: 1,
      units: [
        { id: '1', disposition: UnitDisposition.TRANSLATED, translatedText: 'hello' },
        { id: '2', disposition: UnitDisposition.UNRESOLVED, sourceText: 'source' },
      ],
    })

    expect(result.quality).toBe(TranslationQuality.PARTIAL)
    expect(result.units).toEqual([
      { id: '1', disposition: UnitDisposition.TRANSLATED, translatedText: 'hello' },
      { id: '2', disposition: UnitDisposition.UNRESOLVED },
    ])
    expect(createTranslationResult({ translatedCount: 1, requestedCount: 1 }).quality).toBeNull()
  })

  it('creates serializable diagnostic, outcome, and feature application snapshots', () => {
    const report = createTranslationDiagnosticReport({ entries: [{ type: 'PARSER_REPAIRED', details: { quoted: true } }] })
    const outcome = createTranslationOutcome({
      execution: createExecutionResult({ status: ExecutionStatus.COMPLETED }),
      translationResult: null,
      diagnosticSummary: { hasParserRepair: true, retryCount: 2 },
    })
    const application = createFeatureApplicationResult({
      appliedCount: 1,
      preservedOriginalCount: 1,
      state: { feature: 'page', nested: { callerOwned: true } },
    })

    expect(report.entries).toEqual([{ type: 'PARSER_REPAIRED', details: { quoted: true } }])
    expect(Object.isFrozen(report)).toBe(true)
    expect(Object.isFrozen(report.entries)).toBe(true)
    expect(Object.isFrozen(report.entries[0])).toBe(true)
    expect(outcome.translationResult).toBeNull()
    expect(outcome.diagnosticSummary).toMatchObject({ hasParserRepair: true, retryCount: 2 })
    expect(Object.isFrozen(application)).toBe(true)
    expect(Object.isFrozen(application.state)).toBe(true)
    expect(Object.isFrozen(application.state.nested)).toBe(false)
    expect(JSON.parse(JSON.stringify({ report, outcome, application }))).toEqual({ report, outcome, application })
  })

  it('reuses module-created Value Objects while copying caller-owned records', () => {
    const execution = createExecutionResult({ status: ExecutionStatus.COMPLETED })
    const translationResult = createTranslationResult({ quality: TranslationQuality.COMPLETE })
    const callerOwnedRecord = { provider: 'Custom' }
    const report = createTranslationDiagnosticReport({ entries: [execution, callerOwnedRecord] })
    const outcome = createTranslationOutcome({ execution, translationResult })

    callerOwnedRecord.provider = 'Changed'

    expect(outcome.execution).toBe(execution)
    expect(outcome.translationResult).toBe(translationResult)
    expect(report.entries[0]).toBe(execution)
    expect(report.entries[1]).toEqual({ provider: 'Custom' })
    expect(report.entries[1]).not.toBe(callerOwnedRecord)
  })
})
