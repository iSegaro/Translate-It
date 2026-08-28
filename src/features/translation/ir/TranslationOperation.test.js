import { describe, expect, it } from 'vitest'
import { createProviderExecutionMetadataRef, createTranslationOperation, deriveRecoverySummary, recordProviderCompletion, RecoveryFinalOutcome, ParentCandidateState, publishProviderExecutionMetadata } from './TranslationOperation.js'
import { CompletionTermination, createCompletionRecord } from './CompletionContract.js'
import { AIResponseParser } from '../providers/utils/AIResponseParser.js'
import { ResponseFormat } from '@/shared/config/translationConstants.js'
import { createManifestView, createRequestUnitManifest } from './RequestUnitManifest.js'
import { TranslationCallPurpose } from '../providers/ProviderConstants.js'

describe('TranslationOperation', () => {
  it('publishes immutable snapshots from distinct provider execution slots', () => {
    const operation = createTranslationOperation('metadata-slots')
    const executionContext = { operation }
    const first = createProviderExecutionMetadataRef()
    const second = createProviderExecutionMetadataRef()
    first.metadata.detectedLanguage = 'en'
    second.metadata.detectedLanguage = 'fa'

    expect(first).not.toBe(second)
    expect(publishProviderExecutionMetadata(executionContext, first, 'PRIMARY_TRANSLATION')).not.toBe(false)
    expect(publishProviderExecutionMetadata(executionContext, second, 'PRIMARY_TRANSLATION')).not.toBe(false)
    expect(operation.snapshotProviderExecutionMetadata()).toEqual([
      { callPurpose: 'PRIMARY_TRANSLATION', metadata: { detectedLanguage: 'en' } },
      { callPurpose: 'PRIMARY_TRANSLATION', metadata: { detectedLanguage: 'fa' } },
    ])
    expect(operation.snapshotProviderExecutionMetadata()[0].metadata).not.toBe(first.metadata)
  })

  it('publishes one execution slot at most once', () => {
    const operation = createTranslationOperation('metadata-publish-once')
    const executionContext = { operation }
    const ref = createProviderExecutionMetadataRef()
    ref.metadata.detectedLanguage = 'en'

    expect(publishProviderExecutionMetadata(executionContext, ref, 'PRIMARY_TRANSLATION')).not.toBe(false)
    expect(publishProviderExecutionMetadata(executionContext, ref, 'PRIMARY_TRANSLATION')).toBe(false)
    expect(operation.snapshotProviderExecutionMetadata()).toHaveLength(1)
  })

  it('normalizes missing call purpose to primary translation', () => {
    const operation = createTranslationOperation('metadata-default-purpose')
    const ref = createProviderExecutionMetadataRef()
    ref.metadata.detectedLanguage = ' EN '

    publishProviderExecutionMetadata({ operation }, ref)

    expect(operation.snapshotProviderExecutionMetadata()).toEqual([
      { callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION, metadata: { detectedLanguage: ' EN ' } },
    ])
  })

  it('blocks metadata publication after finalization', () => {
    const operation = createTranslationOperation('metadata-finalized-publication')
    const first = createProviderExecutionMetadataRef()
    const second = createProviderExecutionMetadataRef()
    first.metadata.detectedLanguage = 'en'
    second.metadata.detectedLanguage = 'de'

    publishProviderExecutionMetadata({ operation }, first)
    operation.finalize()

    expect(publishProviderExecutionMetadata({ operation }, second)).toBe(false)
    expect(operation.snapshotProviderExecutionMetadata()).toHaveLength(1)
  })

  it('keeps published metadata and aggregate readable after finalization', () => {
    const operation = createTranslationOperation('metadata-finalized-snapshot')
    const ref = createProviderExecutionMetadataRef()
    ref.metadata.detectedLanguage = ' EN '

    publishProviderExecutionMetadata({ operation }, ref)
    operation.finalize()

    const records = operation.snapshotProviderExecutionMetadata()
    expect(records).toEqual([
      { callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION, metadata: { detectedLanguage: ' EN ' } },
    ])
    expect(operation.snapshotAggregatedProviderMetadata()).toEqual({ detectedLanguage: 'en' })
    expect(Object.isFrozen(records)).toBe(true)
    expect(Object.isFrozen(records[0])).toBe(true)
    expect(Object.isFrozen(records[0].metadata)).toBe(true)
  })

  it.each([
    ['no records', [], {}],
    ['missing language', [{ callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION, metadata: {} }], {}],
    ['one candidate', [{ callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION, metadata: { detectedLanguage: ' EN ' } }], { detectedLanguage: 'en' }],
    ['unanimous candidates', [
      { callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION, metadata: { detectedLanguage: 'en' } },
      { callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION, metadata: { detectedLanguage: ' EN ' } },
      { callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION, metadata: { detectedLanguage: 'EN' } },
    ], { detectedLanguage: 'en' }],
    ['conflicting candidates', [
      { callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION, metadata: { detectedLanguage: 'en' } },
      { callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION, metadata: { detectedLanguage: 'de' } },
    ], {}],
  ])('aggregates %s deterministically', (_label, records, expected) => {
    const operation = createTranslationOperation(`aggregate-${_label}`)
    records.forEach(({ callPurpose, metadata }) => operation.recordProviderExecutionMetadata(metadata, callPurpose))

    expect(operation.snapshotAggregatedProviderMetadata()).toEqual(expected)
  })

  it.each([
    ['no records', [], { status: 'absent' }],
    ['missing language', [{ callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION, metadata: {} }], { status: 'absent' }],
    ['non-string language', [{ callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION, metadata: { detectedLanguage: 42 } }], { status: 'absent' }],
    ['blank language', [{ callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION, metadata: { detectedLanguage: '  ' } }], { status: 'absent' }],
    ['recovery-only metadata', [{ callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY, metadata: { detectedLanguage: 'en' } }], { status: 'absent' }],
    ['unknown-purpose-only metadata', [{ callPurpose: 'UNKNOWN', metadata: { detectedLanguage: 'en' } }], { status: 'absent' }],
    ['one language', [{ callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION, metadata: { detectedLanguage: 'en' } }], { status: 'unanimous', detectedLanguage: 'en' }],
    ['identical languages', [
      { callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION, metadata: { detectedLanguage: 'en' } },
      { callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION, metadata: { detectedLanguage: 'en' } },
    ], { status: 'unanimous', detectedLanguage: 'en' }],
    ['canonicalized languages', [
      { callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION, metadata: { detectedLanguage: 'en' } },
      { callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION, metadata: { detectedLanguage: ' EN ' } },
      { callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION, metadata: { detectedLanguage: 'En' } },
    ], { status: 'unanimous', detectedLanguage: 'en' }],
    ['distinct languages', [
      { callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION, metadata: { detectedLanguage: 'en' } },
      { callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION, metadata: { detectedLanguage: 'de' } },
    ], { status: 'conflict' }],
  ])('returns diagnostic status for %s', (_label, records, expected) => {
    const operation = createTranslationOperation(`diagnostic-${_label}`)
    records.forEach(({ callPurpose, metadata }) => operation.recordProviderExecutionMetadata(metadata, callPurpose))

    expect(operation.snapshotProviderDetectionDiagnostic()).toEqual(expected)
  })

  it('keeps diagnostic status independent of publication order', () => {
    const createOperation = (languages) => {
      const operation = createTranslationOperation('diagnostic-order')
      languages.forEach((detectedLanguage) => operation.recordProviderExecutionMetadata(
        { detectedLanguage }, TranslationCallPurpose.PRIMARY_TRANSLATION,
      ))
      return operation
    }

    expect(createOperation(['en', 'de']).snapshotProviderDetectionDiagnostic()).toEqual({ status: 'conflict' })
    expect(createOperation(['de', 'en']).snapshotProviderDetectionDiagnostic()).toEqual({ status: 'conflict' })
  })

  it('ignores recovery records when primary evidence is unanimous', () => {
    const operation = createTranslationOperation('diagnostic-recovery-unanimous')
    operation.recordProviderExecutionMetadata({ detectedLanguage: 'en' }, TranslationCallPurpose.PRIMARY_TRANSLATION)
    operation.recordProviderExecutionMetadata({ detectedLanguage: 'de' }, TranslationCallPurpose.STRUCTURED_RECOVERY)
    operation.recordProviderExecutionMetadata({ detectedLanguage: 'fa' }, TranslationCallPurpose.PARENT_RECOVERY)

    expect(operation.snapshotProviderDetectionDiagnostic()).toEqual({ status: 'unanimous', detectedLanguage: 'en' })
    expect(operation.snapshotAggregatedProviderMetadata()).toEqual({ detectedLanguage: 'en' })
  })

  it('ignores recovery records when primary evidence conflicts', () => {
    const operation = createTranslationOperation('diagnostic-recovery-conflict')
    operation.recordProviderExecutionMetadata({ detectedLanguage: 'en' }, TranslationCallPurpose.PRIMARY_TRANSLATION)
    operation.recordProviderExecutionMetadata({ detectedLanguage: 'de' }, TranslationCallPurpose.PRIMARY_TRANSLATION)
    operation.recordProviderExecutionMetadata({ detectedLanguage: 'fa' }, TranslationCallPurpose.STRUCTURED_RECOVERY)

    expect(operation.snapshotProviderDetectionDiagnostic()).toEqual({ status: 'conflict' })
    expect(operation.snapshotAggregatedProviderMetadata()).toEqual({})
  })

  it('returns an immutable diagnostic snapshot after finalization without mutating metadata', () => {
    const operation = createTranslationOperation('diagnostic-finalized')
    const metadata = { detectedLanguage: ' EN ' }
    operation.recordProviderExecutionMetadata(metadata, TranslationCallPurpose.PRIMARY_TRANSLATION)
    const beforeFinalize = operation.snapshotProviderDetectionDiagnostic()
    operation.finalize()

    const snapshot = operation.snapshotProviderDetectionDiagnostic()
    metadata.detectedLanguage = 'de'

    expect(snapshot).toEqual(beforeFinalize)
    expect(snapshot).toEqual({ status: 'unanimous', detectedLanguage: 'en' })
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(operation.snapshotProviderExecutionMetadata()[0].metadata).toEqual({ detectedLanguage: ' EN ' })
    expect(operation.snapshotAggregatedProviderMetadata()).toEqual({ detectedLanguage: 'en' })
  })

  it('ignores recovery, unknown, empty, and non-string candidates', () => {
    const operation = createTranslationOperation('aggregate-filtering')
    for (const [callPurpose, detectedLanguage] of [
      [TranslationCallPurpose.STRUCTURED_RECOVERY, 'en'],
      [TranslationCallPurpose.PARENT_RECOVERY, 'en'],
      ['UNKNOWN', 'en'],
      [TranslationCallPurpose.PRIMARY_TRANSLATION, ''],
      [TranslationCallPurpose.PRIMARY_TRANSLATION, null],
      [TranslationCallPurpose.PRIMARY_TRANSLATION, 42],
    ]) {
      operation.recordProviderExecutionMetadata({ detectedLanguage }, callPurpose)
    }

    expect(operation.snapshotAggregatedProviderMetadata()).toEqual({})
  })

  it('does not depend on record order or mutate stored snapshots', () => {
    const aggregate = (languages) => {
      const operation = createTranslationOperation('aggregate-order')
      languages.forEach((detectedLanguage) => operation.recordProviderExecutionMetadata(
        { detectedLanguage }, TranslationCallPurpose.PRIMARY_TRANSLATION,
      ))
      return operation
    }
    const operation = aggregate([' EN ', 'en'])
    const reversedOperation = aggregate(['en', ' EN '])
    const snapshot = operation.snapshotProviderExecutionMetadata()

    expect(operation.snapshotAggregatedProviderMetadata()).toEqual({ detectedLanguage: 'en' })
    expect(reversedOperation.snapshotAggregatedProviderMetadata()).toEqual({ detectedLanguage: 'en' })
    expect(operation.snapshotProviderExecutionMetadata()).toEqual(snapshot)
  })

  it('keeps parent candidates operation-scoped, write-once, and history-free', () => {
    const operation = createTranslationOperation('parent-candidates')
    const parent = operation.createParentCandidate({
      parentId: 'g1', sourceOrder: 0, sessionId: 's1', provider: 'OpenAI', mode: 'select-element',
      conversationParticipates: true, cleanSource: 'clean source',
    })
    const sameParent = operation.createParentCandidate({ parentId: 'g1', sourceOrder: 0, conversationParticipates: true })
    const otherParent = operation.createParentCandidate({ parentId: 'g2', sourceOrder: 1, conversationParticipates: true })

    expect(sameParent).toBeNull()
    expect(parent).toBe(operation.getParentCandidate('g1'))
    expect(otherParent).not.toBe(parent)
    expect(parent.stageSource('replacement')).toBe(false)
    expect(parent.stageResult('translated')).toBe(true)
    expect(parent.state).toBe(ParentCandidateState.RESULT_STAGED)
    expect(parent.stageSource('replacement')).toBe(false)
    expect(parent).not.toHaveProperty('commit')
    expect(parent.discard()).toBe(true)
    expect(parent.discard()).toBe(false)
    expect(operation.snapshotParentCandidates()).toEqual([
      expect.objectContaining({ parentId: 'g1', cleanSource: 'clean source', cleanResult: 'translated', state: ParentCandidateState.DISCARDED }),
      expect.objectContaining({ parentId: 'g2', state: ParentCandidateState.PROVISIONAL }),
    ])
  })

  it('does not create parent candidates without participation', () => {
    const operation = createTranslationOperation('non-participating')
    expect(operation.createParentCandidate({ parentId: 'g1', conversationParticipates: false })).toBeNull()
    expect(operation.snapshotParentCandidates()).toEqual([])
  })

  it('keeps result-staged state when source is staged afterward', () => {
    const operation = createTranslationOperation('reverse-staging')
    const candidate = operation.createParentCandidate({ parentId: 'g1', conversationParticipates: true })

    expect(candidate.stageResult('translated')).toBe(true)
    expect(candidate.state).toBe(ParentCandidateState.RESULT_STAGED)
    expect(candidate.stageSource('source')).toBe(true)
    expect(candidate.state).toBe(ParentCandidateState.RESULT_STAGED)
  })

  it('returns one parent candidate under concurrent fragment lookup', async () => {
    const operation = createTranslationOperation('parallel-parent')
    const lookups = await Promise.all([
      Promise.resolve(operation.createParentCandidate({ parentId: 'g1', sourceOrder: 0, conversationParticipates: true })),
      Promise.resolve(operation.getParentCandidate('g1')),
      Promise.resolve(operation.getParentCandidate('g1')),
    ])

    expect(lookups[0]).toBe(lookups[1])
    expect(lookups[1]).toBe(lookups[2])
    expect(operation.snapshotParentCandidates()).toHaveLength(1)
  })

  it('registers duplicate parents once and preserves explicit source order', () => {
    const operation = createTranslationOperation('registration')
    expect(operation.registerParentCandidates([
      { parentId: 'g2', sourceOrder: 7, conversationParticipates: true },
      { parentId: 'g1', sourceOrder: 2, conversationParticipates: true },
      { parentId: 'g2', sourceOrder: 99, conversationParticipates: true },
    ])).toBe(2)

    expect(operation.snapshotParentCandidates()).toEqual([
      expect.objectContaining({ parentId: 'g2', sourceOrder: 7 }),
      expect.objectContaining({ parentId: 'g1', sourceOrder: 2 }),
    ])
  })

  it('discards and clears candidates on finalize', () => {
    const operation = createTranslationOperation('finalize-parents')
    const candidate = operation.createParentCandidate({ parentId: 'g1', conversationParticipates: true })

    operation.finalize()

    expect(operation.snapshotParentCandidates()).toEqual([])
    expect(candidate.state).toBe(ParentCandidateState.DISCARDED)
    expect(candidate.stageResult('late result')).toBe(false)
    expect(operation.getParentCandidate('g1')).toBeNull()
  })
  it('derives immutable recovery summaries from ordered diagnostics', () => {
    const report = Object.freeze({ entries: Object.freeze([
      Object.freeze({ type: 'RECOVERY_TRIGGERED', provider: 'A' }),
      Object.freeze({ type: 'RECOVERY_FAILED', provider: 'A' }),
      Object.freeze({ type: 'RECOVERY_TRIGGERED', provider: 'B' }),
      Object.freeze({ type: 'RECOVERY_SUCCEEDED', provider: 'B' }),
    ]) })
    const summary = deriveRecoverySummary(report, { operationSucceeded: true })
    expect(summary).toMatchObject({ structuredResponseViolations: 2, recoveryPasses: 2, hadRecovery: true, hadRecoverySuccess: true, hadRecoveryFailure: true, recoveryIncomplete: false, finalRecoveryOutcome: RecoveryFinalOutcome.SUCCEEDED })
    expect(summary.providerFacts).toEqual([
      expect.objectContaining({ provider: 'A', recoveryFailures: 1 }),
      expect.objectContaining({ provider: 'B', recoverySuccesses: 1 }),
    ])
    expect(Object.isFrozen(summary)).toBe(true)
    expect(Object.isFrozen(summary.providerFacts)).toBe(true)
  })

  it('returns safe none summary for absent diagnostics and supersedes failed recovery after terminal success', () => {
    expect(deriveRecoverySummary()).toMatchObject({ recoveryPasses: 0, finalRecoveryOutcome: RecoveryFinalOutcome.NONE, providerFacts: [] })
    expect(deriveRecoverySummary({ entries: [{ type: 'RECOVERY_TRIGGERED', provider: 'A' }, { type: 'RECOVERY_FAILED', provider: 'A' }] }, { operationSucceeded: true }).finalRecoveryOutcome)
      .toBe(RecoveryFinalOutcome.SUPERSEDED)
  })

  it.each([
    ['succeeds with terminal success', ['RECOVERY_TRIGGERED', 'RECOVERY_SUCCEEDED'], { operationSucceeded: true }, RecoveryFinalOutcome.SUCCEEDED, false],
    ['fails with terminal failure', ['RECOVERY_TRIGGERED', 'RECOVERY_FAILED'], { terminalStatus: 'failed' }, RecoveryFinalOutcome.FAILED, false],
    ['is incomplete without terminal event', ['RECOVERY_TRIGGERED'], {}, RecoveryFinalOutcome.INCOMPLETE, true],
    ['is incomplete when success lacks terminal context', ['RECOVERY_TRIGGERED', 'RECOVERY_SUCCEEDED'], {}, RecoveryFinalOutcome.INCOMPLETE, false],
    ['is incomplete when failure lacks terminal context', ['RECOVERY_TRIGGERED', 'RECOVERY_FAILED'], {}, RecoveryFinalOutcome.INCOMPLETE, false],
    ['is superseded by later primary success', ['RECOVERY_TRIGGERED', 'RECOVERY_FAILED'], { operationSucceeded: true }, RecoveryFinalOutcome.SUPERSEDED, false],
    ['fails after two failed passes', ['RECOVERY_TRIGGERED', 'RECOVERY_FAILED', 'RECOVERY_TRIGGERED', 'RECOVERY_FAILED'], { terminalStatus: 'failed' }, RecoveryFinalOutcome.FAILED, false],
  ])('classifies recovery outcome when it %s', (_label, types, terminalContext, outcome, incomplete) => {
    const entries = types.map((type, index) => ({ type, provider: index < 2 ? 'A' : 'B' }))
    const summary = deriveRecoverySummary({ entries }, terminalContext)
    expect(summary.finalRecoveryOutcome).toBe(outcome)
    expect(summary.recoveryIncomplete).toBe(incomplete)
  })

  it('ignores orphan terminal events and falls back missing terminal providers', () => {
    expect(deriveRecoverySummary({ entries: [{ type: 'RECOVERY_SUCCEEDED' }, { type: 'RECOVERY_FAILED' }] }).finalRecoveryOutcome).toBe(RecoveryFinalOutcome.NONE)
    const report = { entries: [{ type: 'RECOVERY_TRIGGERED', provider: 'A' }, { type: 'RECOVERY_FAILED' }] }
    const first = deriveRecoverySummary(report, { terminalStatus: 'failed' })
    const second = deriveRecoverySummary(report, { terminalStatus: 'failed' })
    expect(first).toEqual(second)
    expect(first.providerFacts[0]).toMatchObject({ provider: 'A', recoveryFailures: 1 })
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.providerFacts)).toBe(true)
    expect(Object.isFrozen(first.providerFacts[0])).toBe(true)
    expect(report.entries).toHaveLength(2)
  })
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

    expect(result.results).toEqual([''])
    expect(result.contractViolation).toBe(true)
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

    expect(result.results).toEqual(['', 'second'])
    expect(result.contractViolation).toBe(true)
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

describe('TranslationOperation completion record attachment', () => {
  it('records one normalized completion', () => {
    const operation = createTranslationOperation('completion-single')
    const record = createCompletionRecord({
      provider: 'gemini',
      model: 'gemini-1.5-flash',
      termination: CompletionTermination.NORMAL,
      responseId: 'resp-1',
    })

    const stored = operation.recordCompletion(record)
    expect(stored).not.toBe(false)
    expect(stored).toMatchObject({
      provider: 'gemini',
      model: 'gemini-1.5-flash',
      termination: 'NORMAL',
      responseId: 'resp-1',
    })
    expect(Object.isFrozen(stored)).toBe(true)
    expect(operation.snapshotCompletions()[0]).toBe(stored)

    const snapshot = operation.snapshotCompletions()
    expect(snapshot).toHaveLength(1)
    expect(snapshot[0]).toMatchObject({
      provider: 'gemini',
      model: 'gemini-1.5-flash',
      termination: 'NORMAL',
      responseId: 'resp-1',
    })
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot[0])).toBe(true)
  })

  it('preserves response order across multiple physical responses', () => {
    const operation = createTranslationOperation('completion-multi')

    operation.recordCompletion(createCompletionRecord({ provider: 'gemini', termination: CompletionTermination.NORMAL, responseId: 'resp-1' }))
    operation.recordCompletion(createCompletionRecord({ provider: 'gemini', termination: CompletionTermination.TRUNCATED, responseId: 'resp-2' }))
    operation.recordCompletion(createCompletionRecord({ provider: 'openai', termination: CompletionTermination.POLICY, responseId: 'resp-3' }))

    expect(operation.snapshotCompletions().map(({ responseId, termination, provider }) => ({ responseId, termination, provider }))).toEqual([
      { responseId: 'resp-1', termination: 'NORMAL', provider: 'gemini' },
      { responseId: 'resp-2', termination: 'TRUNCATED', provider: 'gemini' },
      { responseId: 'resp-3', termination: 'POLICY', provider: 'openai' },
    ])
  })

  it('returns a fresh frozen snapshot without exposing the private collection', () => {
    const operation = createTranslationOperation('completion-snapshot')

    operation.recordCompletion(createCompletionRecord({ provider: 'gemini', termination: CompletionTermination.UNKNOWN }))

    const first = operation.snapshotCompletions()
    const second = operation.snapshotCompletions()
    expect(first).toEqual(second)
    expect(first).not.toBe(second)
    expect(() => { first.push({}) }).toThrow()
  })

  it('collapses raw provider termination strings at the operation boundary', () => {
    const operation = createTranslationOperation('completion-privacy')
    const executionContext = { operation }

    recordProviderCompletion(executionContext, {
      provider: 'gemini',
      termination: 'MAX_TOKENS',
      responseId: 'resp-raw',
      body: 'must not be retained',
      sourceText: 'must not be retained',
      translatedText: 'must not be retained',
    })

    const [stored] = operation.snapshotCompletions()
    expect(stored).toEqual({
      provider: 'gemini',
      model: null,
      termination: 'UNKNOWN',
      responseId: 'resp-raw',
      usage: null,
    })
  })

  it('keeps unrelated execution-context state intact', () => {
    const operation = createTranslationOperation('completion-isolation')
    const executionContext = { operation, marker: 'unchanged' }

    recordProviderCompletion(executionContext, createCompletionRecord({ provider: 'openai', termination: CompletionTermination.NORMAL }))
    operation.appendDiagnostic({ type: 'SOME_DIAGNOSTIC', stage: 'test' })

    expect(executionContext.marker).toBe('unchanged')
    expect(operation.snapshotCompletions()).toHaveLength(1)
    expect(operation.finalize().entries).toHaveLength(1)
  })

  it('is safe when no execution context exists', () => {
    expect(recordProviderCompletion(null, createCompletionRecord({ provider: 'gemini' }))).toBe(false)
    expect(recordProviderCompletion({}, createCompletionRecord({ provider: 'gemini' }))).toBe(false)
    expect(recordProviderCompletion({ operation: null }, createCompletionRecord({ provider: 'gemini' }))).toBe(false)
  })

  it('returns the frozen stored record and publishes it into the per-call completionRef slot', () => {
    const operation = createTranslationOperation('completion-slot')
    const completionRef = { record: null }
    const executionContext = { operation, completionRef }
    const record = createCompletionRecord({
      provider: 'gemini',
      termination: CompletionTermination.NORMAL,
      responseId: 'resp-slot',
    })

    const stored = recordProviderCompletion(executionContext, record)

    expect(stored).not.toBe(false)
    expect(Object.isFrozen(stored)).toBe(true)
    expect(operation.snapshotCompletions()[0]).toBe(stored)
    expect(completionRef.record).toBe(stored)
    expect(stored.responseId).toBe('resp-slot')
  })

  it('keeps per-call completionRef slots isolated across concurrent providers', () => {
    const operation = createTranslationOperation('completion-slot-concurrent')
    const slotA = { record: null }
    const slotB = { record: null }
    const contextA = { operation, completionRef: slotA }
    const contextB = { operation, completionRef: slotB }

    const storedA = recordProviderCompletion(contextA, createCompletionRecord({ provider: 'gemini', termination: CompletionTermination.TRUNCATED, responseId: 'resp-a' }))
    const storedB = recordProviderCompletion(contextB, createCompletionRecord({ provider: 'openai', termination: CompletionTermination.NORMAL, responseId: 'resp-b' }))

    expect(slotA.record).toBe(storedA)
    expect(slotB.record).toBe(storedB)
    expect(slotA.record).not.toBe(slotB.record)
    expect(slotA.record.responseId).toBe('resp-a')
    expect(slotB.record.responseId).toBe('resp-b')
    expect(operation.snapshotCompletions()).toHaveLength(2)
  })

  it('leaves completionRef untouched when recording fails', () => {
    const completionRef = { record: null }
    const executionContext = { completionRef }

    expect(recordProviderCompletion(executionContext, createCompletionRecord({ provider: 'gemini' }))).toBe(false)
    expect(completionRef.record).toBeNull()
  })

  it('rejects completions after finalization', () => {
    const operation = createTranslationOperation('completion-finalized')
    operation.finalize()

    expect(operation.recordCompletion(createCompletionRecord({ provider: 'gemini', termination: CompletionTermination.NORMAL }))).toBe(false)
    expect(operation.snapshotCompletions()).toEqual([])
  })

  it('accepts exactly 100 records and rejects the 101st', () => {
    const operation = createTranslationOperation('completion-capacity')

    for (let index = 0; index < 100; index++) {
      expect(operation.recordCompletion(createCompletionRecord({ provider: 'gemini', termination: CompletionTermination.NORMAL, responseId: `resp-${index}` }))).not.toBe(false)
    }

    expect(operation.recordCompletion(createCompletionRecord({ provider: 'gemini', termination: CompletionTermination.NORMAL, responseId: 'resp-overflow' }))).toBe(false)
    expect(operation.snapshotCompletions()).toHaveLength(100)
    expect(operation.snapshotCompletions().at(-1).responseId).toBe('resp-99')
  })

  it('is idempotent across repeated boundary sanitization', () => {
    const operation = createTranslationOperation('completion-idempotent')

    const record = createCompletionRecord({
      provider: 'gemini',
      termination: CompletionTermination.TRUNCATED,
      usage: { inputTokens: 5, outputTokens: 9 },
    })
    operation.recordCompletion(record)
    const first = operation.snapshotCompletions()[0]

    operation.recordCompletion(first)
    expect(operation.snapshotCompletions()[1]).toEqual(first)
  })

  it('freezes records and nested usage at the operation boundary', () => {
    const operation = createTranslationOperation('completion-immutable')

    operation.recordCompletion(createCompletionRecord({
      provider: 'gemini',
      termination: CompletionTermination.NORMAL,
      usage: { inputTokens: 3, outputTokens: 4 },
    }))

    const [stored] = operation.snapshotCompletions()
    expect(Object.isFrozen(stored)).toBe(true)
    expect(Object.isFrozen(stored.usage)).toBe(true)
  })
})
