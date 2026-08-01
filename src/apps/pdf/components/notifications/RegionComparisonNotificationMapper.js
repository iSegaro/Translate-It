/**
 * Builds a render-ready viewModel for the Region Comparison results body.
 *
 * @param {object} input
 * @param {object} input.analysis - Comparison analysis from the presenter
 * @param {Array} input.results - Per-candidate result objects
 * @param {number} [input.totalElapsedMs] - Total elapsed time in ms
 * @returns {RegionComparisonNotificationPayload}
 *
 * @typedef {object} RegionComparisonNotificationPayload
 * @property {string|null} title - Winner description e.g. "Winner scale-1 (Lowest CER)"
 * @property {Array<{label: string, value: string}>} summary - OCR output and confidence items
 * @property {Array<{id: string, label: string}>} columns - Table column definitions
 * @property {Array<{cells: Array<RowCell>}>} rows - Result rows
 * @property {string|null} footer - Total runtime e.g. "Total 42ms"
 *
 * @typedef {object} RowCell
 * @property {string} id - Column identifier
 * @property {string} value - Cell display value
 * @property {boolean} [code] - Render value in monospace
 * @property {boolean} [numeric] - Align value numerically
 */
export function createRegionComparisonNotificationViewModel({ analysis, results, totalElapsedMs }) {
  const winnerCandidateId = analysis?.winnerCandidateId ?? null

  return {
    title: buildTitle(analysis),
    summary: buildSummary(analysis),
    columns: [
      { id: 'candidate', label: 'Candidate' },
      { id: 'scale', label: 'Scale' },
      { id: 'language', label: 'Lang' },
      { id: 'runtime', label: 'Runtime' },
      { id: 'confidence', label: 'Confidence' },
      { id: 'cer', label: 'CER' },
      { id: 'status', label: 'Result' }
    ],
    rows: buildRows(results || [], winnerCandidateId),
    footer: Number.isFinite(totalElapsedMs) ? `Total ${totalElapsedMs}ms` : null
  }
}

function buildTitle(analysis) {
  if (!analysis?.winner) return null
  return `Winner ${analysis.winner.candidateId} (${winnerReasonLabel(analysis.winner.reason)})`
}

function winnerReasonLabel(reason) {
  return reason === 'lowest-cer' ? 'Lowest CER' : 'Highest confidence'
}

function buildSummary(analysis) {
  const items = []
  if (analysis?.confidence?.highest != null) {
    let value = String(analysis.confidence.highest)
    if (analysis.confidence.comparable && analysis.confidence.delta !== 0) {
      value += ` (+${analysis.confidence.delta})`
    }
    items.push({ label: 'Confidence', value })
  }

  const outputLabel = analysis?.output?.comparable
    ? (analysis.output.identical ? 'Identical' : 'Different')
    : 'Not comparable'
  items.push({ label: 'OCR Output', value: outputLabel })

  return items
}

function buildRows(results, winnerCandidateId) {
  return results.map(result => ({
    cells: [
      { id: 'candidate', value: result.candidateId, code: true },
      { id: 'scale', value: formatScale(result.configuration?.scale), numeric: true },
      { id: 'language', value: result.runtimeLanguage || '—' },
      { id: 'runtime', value: formatRuntime(result.runtime?.latencyMs), numeric: true },
      { id: 'confidence', value: formatConfidence(result.output?.data?.confidence), numeric: true },
      { id: 'cer', value: formatCer(result.evaluation) || '—', numeric: true },
      { id: 'status', value: resultLabel(result, winnerCandidateId) }
    ]
  }))
}

function formatScale(scale) {
  return scale ?? '—'
}

function formatCer(evaluation) {
  const errorRate = evaluation?.cer?.characterErrorRate
  return Number.isFinite(errorRate) ? errorRate.toFixed(3) : ''
}

function formatRuntime(latencyMs) {
  return Number.isFinite(latencyMs) ? `${latencyMs}ms` : '—'
}

function formatConfidence(confidence) {
  return Number.isFinite(confidence) ? String(confidence) : '—'
}

function resultLabel(result, winnerCandidateId) {
  if (winnerCandidateId === result.candidateId) return 'Winner'
  return result.output?.status === 'recognized' ? '\u2713' : result.output?.status || '—'
}
