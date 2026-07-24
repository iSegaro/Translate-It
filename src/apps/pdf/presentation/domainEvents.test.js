import { describe, expect, it } from 'vitest'

import { DomainEvents } from './domainEvents.js'

describe('DomainEvents', () => {
  it('exports frozen canonical creators', () => {
    expect(Object.isFrozen(DomainEvents)).toBe(true)
  })

  it('creates acknowledgement results', () => {
    expect(DomainEvents.exportCompleted({ format: 'txt' })).toEqual({ name: 'export-completed', format: 'txt' })
    expect(DomainEvents.exportFailed({ error: 'Disk full' })).toEqual({ name: 'export-failed', error: 'Disk full' })
    expect(DomainEvents.ocrFailed()).toEqual({ name: 'ocr-failed' })
    expect(DomainEvents.ocrLanguageMissing()).toEqual({ name: 'ocr-language-missing' })
    expect(DomainEvents.regionOcrNoText()).toEqual({ name: 'region-ocr-no-text' })
    expect(DomainEvents.regionOcrFailed()).toEqual({ name: 'region-ocr-failed' })
  })

  it('creates outcome results', () => {
    const comparison = DomainEvents.comparisonCompleted({ id: '1', summary: {}, result: {} })

    expect(comparison).toEqual({ name: 'comparison-completed', id: '1', summary: {}, result: {} })
    expect(DomainEvents.comparisonFailed({ id: '2', error: 'Failed' })).toEqual({
      name: 'comparison-failed', id: '2', error: 'Failed'
    })
    expect(DomainEvents.translationPartial({ occurrenceId: 3, error: 'Partial failure' })).toEqual({
      name: 'translation-partial', occurrenceId: 3, error: 'Partial failure'
    })
    expect(DomainEvents.translationFailed({ occurrenceId: 4, error: 'Failed' })).toEqual({
      name: 'translation-failed', occurrenceId: 4, error: 'Failed'
    })
    expect(DomainEvents.translationOutcomeCleared()).toEqual({ name: 'translation-outcome-cleared' })
  })

  it('creates activity results', () => {
    expect(DomainEvents.translationStarted()).toEqual({ name: 'translation-started' })
    expect(DomainEvents.ocrStarted()).toEqual({ name: 'ocr-started' })
    expect(DomainEvents.ocrProgressUpdated({ current: 1, total: 2 })).toEqual({
      name: 'ocr-progress-update', current: 1, total: 2
    })
    expect(DomainEvents.regionOcrStarted()).toEqual({ name: 'region-ocr-started' })
    expect(DomainEvents.comparisonStarted()).toEqual({ name: 'comparison-started' })
    expect(DomainEvents.activityCompleted()).toEqual({ name: 'activity-completed' })
  })
})
