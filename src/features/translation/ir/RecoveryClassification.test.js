import { describe, expect, it } from 'vitest'
import {
  classifyRecoveryFailure,
  RecoveryClassification,
} from './RecoveryClassification.js'
import { CompletionTermination, createCompletionRecord } from './CompletionContract.js'

function completion(termination) {
  return createCompletionRecord({ provider: 'Test', termination })
}

describe('RecoveryClassification', () => {
  it('classifies truncated parse failure as truncation', () => {
    const result = classifyRecoveryFailure({
      completion: completion(CompletionTermination.TRUNCATED),
      parseFailed: true,
      contractViolation: true,
    })

    expect(result).toMatchObject({
      classification: RecoveryClassification.TRUNCATED_RESPONSE,
      termination: CompletionTermination.TRUNCATED,
      parseFailed: true,
      contractViolation: true,
    })
  })

  it('classifies normal parse failure as parser failure', () => {
    expect(classifyRecoveryFailure({
      completion: completion(CompletionTermination.NORMAL),
      parseFailed: true,
      contractViolation: true,
    }).classification).toBe(RecoveryClassification.PARSE_FAILURE)
  })

  it('classifies normal semantic failure as contract violation', () => {
    expect(classifyRecoveryFailure({
      completion: completion(CompletionTermination.NORMAL),
      contractViolation: true,
      violationCodes: ['V3_EMPTY_TRANSLATED_INTERVAL', 'V3_EMPTY_TRANSLATED_INTERVAL'],
    })).toMatchObject({
      classification: RecoveryClassification.CONTRACT_VIOLATION,
      violationCodes: ['V3_EMPTY_TRANSLATED_INTERVAL'],
    })
  })

  it('classifies absent completion from semantic facts without fabricating UNKNOWN', () => {
    expect(classifyRecoveryFailure({ contractViolation: true })).toMatchObject({
      classification: RecoveryClassification.CONTRACT_VIOLATION,
      termination: null,
    })
  })

  it('keeps UNKNOWN termination distinct while using parser precedence', () => {
    expect(classifyRecoveryFailure({
      completion: completion(CompletionTermination.UNKNOWN),
      parseFailed: true,
      contractViolation: true,
    })).toMatchObject({
      classification: RecoveryClassification.PARSE_FAILURE,
      termination: CompletionTermination.UNKNOWN,
    })
  })

  it('classifies policy and provider-error terminations before content facts', () => {
    expect(classifyRecoveryFailure({
      completion: completion(CompletionTermination.POLICY),
      parseFailed: true,
      contractViolation: true,
    }).classification).toBe(RecoveryClassification.POLICY_TERMINATION)
    expect(classifyRecoveryFailure({
      completion: completion(CompletionTermination.PROVIDER_ERROR),
      parseFailed: true,
      contractViolation: true,
    }).classification).toBe(RecoveryClassification.PROVIDER_ERROR_TERMINATION)
  })

  it('returns no failure classification for accepted output', () => {
    expect(classifyRecoveryFailure({
      completion: completion(CompletionTermination.NORMAL),
    })).toBeNull()
  })

  it('returns immutable classification facts', () => {
    const result = classifyRecoveryFailure({
      completion: completion(CompletionTermination.TRUNCATED),
      parseFailed: true,
      contractViolation: true,
      violationCodes: ['EMPTY_TRANSLATED_TEXT'],
    })

    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.violationCodes)).toBe(true)
  })
})
