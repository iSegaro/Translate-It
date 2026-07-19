export function createCorpusBenchmarkNotificationViewModel({ candidateResults, comparisonRuntimeResult, totalElapsedMs }) {
  if (!comparisonRuntimeResult) {
    const message = candidateResults.length < 2
      ? 'Need at least 2 successful candidates.'
      : 'Insufficient data for comparison.'
    return {
      title: null,
      summary: [{ label: 'Status', value: message }],
      columns: [],
      rows: [],
      footer: Number.isFinite(totalElapsedMs) ? `Total ${totalElapsedMs}ms` : null
    }
  }

  const cerValues = comparisonRuntimeResult.metrics?.cer?.candidateValues || []
  const best = cerValues.reduce(
    (best, cv) => !best || cv.value < best.value ? cv : best,
    null
  )

  const columnDefs = [
    { id: 'candidate', label: 'Candidate' },
    { id: 'cer', label: 'CER' },
    { id: 'wer', label: 'WER' },
    { id: 'exactMatch', label: 'Exact%' },
    { id: 'samples', label: 'Samples' }
  ]

  const candidateRows = comparisonRuntimeResult.candidates.map(candidate => {
    const cer = cerValues.find(cv => cv.label === candidate.label)
    const wer = comparisonRuntimeResult.metrics?.wer?.candidateValues?.find(
      cv => cv.label === candidate.label
    )
    const exactMatch = comparisonRuntimeResult.metrics?.exactMatch?.candidateValues?.find(
      cv => cv.label === candidate.label
    )

    return {
      cells: [
        { id: 'candidate', value: candidate.label, code: true },
        { id: 'cer', value: cer ? cer.value.toFixed(3) : '—', numeric: true },
        { id: 'wer', value: wer ? wer.value.toFixed(3) : '—', numeric: true },
        {
          id: 'exactMatch',
          value: exactMatch ? `${(exactMatch.value * 100).toFixed(0)}%` : '—',
          numeric: true
        },
        { id: 'samples', value: String(cer?.count ?? '—'), numeric: true }
      ]
    }
  })

  const title = best ? `Winner ${best.label} (CER ${best.value.toFixed(3)})` : null
  const comparable = comparisonRuntimeResult.diagnostics?.comparable !== false
  const summary = [{ label: 'Comparable', value: comparable ? 'Yes' : 'No' }]

  if (comparisonRuntimeResult.candidates.length !== (candidateResults?.length || 0)) {
    summary.push({
      label: 'Partial',
      value: `${comparisonRuntimeResult.candidates.length} of ${candidateResults.length} candidates compared`
    })
  }

  const footer = Number.isFinite(totalElapsedMs) ? `Total ${totalElapsedMs}ms` : null

  return { title, summary, columns: columnDefs, rows: candidateRows, footer }
}
