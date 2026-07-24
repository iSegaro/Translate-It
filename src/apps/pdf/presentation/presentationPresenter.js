const FORMAT_LABELS = Object.freeze({
  txt: 'TXT',
  markdown: 'Markdown',
  html: 'HTML'
})

function formatLabel(format) {
  return FORMAT_LABELS[format] ?? format
}

function buildComparisonMessage(summary) {
  const parts = []
  if (summary?.winner?.candidateId) {
    parts.push(`Winner: ${summary.winner.candidateId}.`)
  }
  if (Number.isFinite(summary?.latency?.fastestMs)) {
    parts.push(`Fastest: ${summary.latency.fastestMs}ms.`)
  }
  return parts.join(' ') || 'Region Comparison completed.'
}

/**
 * Presentation Presenter — converts Domain Results to Presentation Intents.
 *
 * Owns wording, severity, and communication intent. Produces Presentation
 * Intent only. Surface adapters own component-specific payload construction.
 * Never knows about surfaces, adapters, or routing.
 *
 * @param {object} domainResult  { name: string, ...domainData }
 * @returns {object | null} Presentation Intent or null if no presentation needed
 */
export function present(domainResult) {
  const { name } = domainResult || {}

  switch (name) {
    // ── Acknowledgement ──

    case 'export-completed':
      return {
        intent: 'acknowledgement',
        severity: 'success',
        message: `${formatLabel(domainResult.format)} exported successfully`
      }

    case 'export-failed':
      return {
        intent: 'acknowledgement',
        severity: 'error',
        message: domainResult.error || 'Export failed'
      }

    case 'ocr-failed':
      return {
        intent: 'acknowledgement',
        severity: 'error',
        message: 'OCR failed. Please try again.'
      }

    case 'ocr-language-missing':
      return {
        intent: 'acknowledgement',
        severity: 'error',
        message: 'No OCR language is installed. Open Manage Languages from the OCR menu to download one.'
      }

    case 'region-ocr-no-text':
      return {
        intent: 'acknowledgement',
        severity: 'warning',
        message: 'No text found in the selected region.'
      }

    case 'region-ocr-failed':
      return {
        intent: 'acknowledgement',
        severity: 'error',
        message: 'Region OCR failed. Please try another region.'
      }

    // ── Outcome ──

    case 'comparison-completed':
      return {
        intent: 'outcome',
        notification: {
          id: domainResult.id,
          variant: 'success',
          title: 'Region Comparison complete',
          message: buildComparisonMessage(domainResult.summary)
        },
        comparison: domainResult.result && {
          analysis: domainResult.summary,
          results: domainResult.result.results,
          totalElapsedMs: domainResult.result.summary?.totalElapsedMs
        }
      }

    case 'comparison-failed':
      return {
        intent: 'outcome',
        notification: {
          id: domainResult.id,
          variant: 'error',
          title: 'Region Comparison failed',
          message: domainResult.error || 'Region Comparison failed. Please try again.'
        }
      }

    case 'translation-partial':
      return {
        intent: 'outcome',
        partialTranslation: {
          occurrenceId: domainResult.occurrenceId
        }
      }

    // ── Activity ──

    case 'translation-started':
      return {
        intent: 'activity',
        running: true,
        title: 'Translating visible pages',
        indeterminate: true,
        progress: null,
        cancellable: true
      }

    case 'ocr-started':
      return {
        intent: 'activity',
        running: true,
        title: 'OCR: Processing pages',
        indeterminate: false,
        progress: 0,
        cancellable: true
      }

    case 'ocr-progress-update':
      return {
        intent: 'activity',
        running: true,
        title: 'OCR: Processing pages',
        indeterminate: false,
        progress: Math.round((domainResult.current / domainResult.total) * 100),
        cancellable: true
      }

    case 'region-ocr-started':
      return {
        intent: 'activity',
        running: true,
        title: 'Scanning region...',
        indeterminate: true,
        progress: null,
        cancellable: true
      }

    case 'comparison-started':
      return {
        intent: 'activity',
        running: true,
        title: 'Region Comparison',
        indeterminate: true,
        progress: null,
        cancellable: true
      }

    case 'activity-completed':
      return {
        intent: 'activity',
        running: false,
        title: '',
        indeterminate: true,
        progress: null,
        cancellable: false
      }

    default:
      return null
  }
}
