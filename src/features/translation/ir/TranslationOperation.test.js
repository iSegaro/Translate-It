import { describe, expect, it } from 'vitest'
import { createTranslationOperation } from './TranslationOperation.js'
import { AIResponseParser } from '../providers/utils/AIResponseParser.js'
import { ResponseFormat } from '@/shared/config/translationConstants.js'

describe('TranslationOperation', () => {
  it('keeps bounded sanitized diagnostics and creates one immutable report', () => {
    const operation = createTranslationOperation('message-1')

    operation.appendDiagnostic({
      type: 'PARSER_REPAIRED_RESPONSE',
      stage: 'parser',
      reason: 'x'.repeat(300),
      sourceText: 'must not be retained',
      nested: { ignored: true },
    })

    const report = operation.finalize()

    expect(report.entries).toHaveLength(1)
    expect(report.entries[0]).toMatchObject({
      type: 'PARSER_REPAIRED_RESPONSE',
      stage: 'parser',
      messageId: 'message-1',
    })
    expect(report.entries[0].reason).toHaveLength(256)
    expect(report.entries[0]).not.toHaveProperty('sourceText')
    expect(report.entries[0]).not.toHaveProperty('nested')
    expect(Object.isFrozen(report)).toBe(true)
    expect(Object.isFrozen(report.entries)).toBe(true)
    expect(Object.isFrozen(report.entries[0])).toBe(true)
    expect(operation.finalize()).toBe(report)
  })

  it('rejects late diagnostics after finalization', () => {
    const operation = createTranslationOperation('message-2')
    operation.finalize()

    expect(operation.appendDiagnostic({ type: 'LATE', stage: 'test' })).toBe(false)
    expect(operation.finalized).toBe(true)
    expect(operation.finalize().entries).toEqual([])
  })

  it('records one truncation fact when diagnostic capacity is exceeded', () => {
    const operation = createTranslationOperation('message-3')

    for (let index = 0; index < 100; index++) {
      operation.appendDiagnostic({ type: 'FACT', stage: 'test', attempt: index })
    }

    const report = operation.finalize()

    expect(report.entries).toHaveLength(100)
    expect(report.entries.at(-1)).toMatchObject({
      type: 'DIAGNOSTICS_TRUNCATED',
      stage: 'operation',
      count: 1,
    })
  })

  it('preserves legacy parser fallback output while retaining a private diagnostic', () => {
    const operation = createTranslationOperation('message-4')
    const originalBatch = ['source text']
    const result = AIResponseParser.parseBatchResult(
      '{"translations":',
      1,
      originalBatch,
      'Custom',
      ResponseFormat.JSON_OBJECT,
      { operation },
    )

    expect(result).toEqual(originalBatch)
    expect(operation.finalize().entries).toContainEqual(expect.objectContaining({
      type: 'PARSER_MALFORMED_RESPONSE',
      stage: 'parser',
      messageId: 'message-4',
    }))
  })
})
