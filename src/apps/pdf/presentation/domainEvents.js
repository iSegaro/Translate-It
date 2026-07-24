/**
 * Canonical Domain Result creators for PDF presentation workflows.
 *
 * Features emit these domain-only payloads. Presentation layers decide how to
 * communicate them without callers owning event-name strings.
 */
export const DomainEvents = Object.freeze({
  exportCompleted: ({ format } = {}) => ({ name: 'export-completed', format }),
  exportFailed: ({ error } = {}) => ({ name: 'export-failed', error }),
  ocrFailed: () => ({ name: 'ocr-failed' }),
  ocrLanguageMissing: () => ({ name: 'ocr-language-missing' }),
  regionOcrNoText: () => ({ name: 'region-ocr-no-text' }),
  regionOcrFailed: () => ({ name: 'region-ocr-failed' }),
  comparisonCompleted: ({ id, summary, result } = {}) => ({ name: 'comparison-completed', id, summary, result }),
  comparisonFailed: ({ id, error } = {}) => ({ name: 'comparison-failed', id, error }),
  translationPartial: ({ occurrenceId, reason, error } = {}) => ({ name: 'translation-partial', occurrenceId, reason, error }),
  translationFailed: ({ occurrenceId, reason, error } = {}) => ({ name: 'translation-failed', occurrenceId, reason, error }),
  translationOutcomeCleared: () => ({ name: 'translation-outcome-cleared' }),
  translationStarted: () => ({ name: 'translation-started' }),
  ocrStarted: () => ({ name: 'ocr-started' }),
  ocrProgressUpdated: ({ current, total } = {}) => ({ name: 'ocr-progress-update', current, total }),
  regionOcrStarted: () => ({ name: 'region-ocr-started' }),
  comparisonStarted: () => ({ name: 'comparison-started' }),
  activityCompleted: () => ({ name: 'activity-completed' })
})
