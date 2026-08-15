import { describe, expect, it } from 'vitest'
import { createTranslationOperation } from './TranslationOperation.js'
import { AIResponseParser } from '../providers/utils/AIResponseParser.js'
import { ResponseFormat } from '@/shared/config/translationConstants.js'
import { createManifestView, createRequestUnitManifest } from './RequestUnitManifest.js'

describe('TranslationOperation', () => {
  it('keeps private settlement state in manifest order', () => {
    const manifest = createRequestUnitManifest([{ i: 'first' }, { i: 'second' }, { i: 'third' }])
    const operation = createTranslationOperation('message-settlement', manifest)

    expect(operation.snapshotCancelled()).toEqual([])
    expect(Object.isFrozen(operation.snapshotCancelled())).toBe(true)
    expect(operation.settleUnits(['second', 'second', 'unknown'])).toEqual(['second'])
    expect(operation.settleUnits(['second'])).toEqual([])

    const cancelled = operation.cancelRemaining()
    expect(cancelled).toEqual(['first', 'third'])
    expect(Object.isFrozen(cancelled)).toBe(true)
    expect(operation.cancelRemaining()).toBe(cancelled)
    expect(operation.snapshotCancelled()).toBe(cancelled)
    expect(operation.settleUnits(['first', 'third'])).toEqual([])
  })

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

  it('keeps legacy mapped output unchanged after validation', () => {
    const operation = createTranslationOperation('message-validation-output')
    const originalBatch = [{ i: 'first', t: 'source one' }, { i: 'second', t: 'source two' }]
    const manifestView = createManifestView(createRequestUnitManifest(originalBatch))
    const result = AIResponseParser.parseBatchResult(
      '[{"i":"second","t":"translated"},{"i":"second","t":""}]',
      2,
      originalBatch,
      'Custom',
      ResponseFormat.JSON_ARRAY,
      { operation },
      manifestView,
    )

    expect(result).toEqual(['source one', 'second'])
    expect(operation.finalize().entries).toContainEqual(expect.objectContaining({
      type: 'PARSER_DUPLICATE_ID',
      stage: 'parser',
    }))
  })
})

describe('TranslationOperation pending accepted units', () => {
  const manifest = createRequestUnitManifest([{ i: 'first' }, { i: 'second' }, { i: 'third' }])

  it('accepts canonical manifest unitIds preserving first-accepted order', () => {
    const operation = createTranslationOperation('accept-order', manifest)

    operation.acceptTerminalUnits(['second', 'first'])
    operation.acceptTerminalUnits(['third'])

    expect(operation.drainAcceptedUnitIds()).toEqual(['second', 'first', 'third'])
  })

  it('ignores duplicate and unknown unitIds', () => {
    const operation = createTranslationOperation('accept-dedup', manifest)

    operation.acceptTerminalUnits(['second', 'second', 'unknown', 'second'])

    expect(operation.drainAcceptedUnitIds()).toEqual(['second'])
  })

  it('returns one frozen snapshot and clears the pending collection', () => {
    const operation = createTranslationOperation('accept-drain', manifest)

    operation.acceptTerminalUnits(['third'])

    const snapshot = operation.drainAcceptedUnitIds()
    expect(snapshot).toEqual(['third'])
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(operation.drainAcceptedUnitIds()).toEqual([])
    expect(Object.isFrozen(operation.drainAcceptedUnitIds())).toBe(true)
  })

  it('starts a new pending collection after drain', () => {
    const operation = createTranslationOperation('accept-reopen', manifest)

    operation.acceptTerminalUnits(['first'])
    operation.drainAcceptedUnitIds()
    operation.acceptTerminalUnits(['second', 'third'])

    expect(operation.drainAcceptedUnitIds()).toEqual(['second', 'third'])
  })

  it('does not interact with the settlement ledger', () => {
    const operation = createTranslationOperation('accept-no-ledger', manifest)

    operation.acceptTerminalUnits(['first', 'second'])
    const drained = operation.drainAcceptedUnitIds()

    expect(operation.snapshotCancelled()).toEqual([])
    expect(operation.settleUnits(drained)).toEqual(['first', 'second'])
    expect(operation.cancelRemaining()).toEqual(['third'])
  })
})
