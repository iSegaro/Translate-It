export function createBenchmarkSummary(summary) {
  const cloned = {
    winnerCandidateId: summary.winnerCandidateId,
    fastestCandidateId: summary.fastestCandidateId,
    latency: Object.freeze({ ...summary.latency }),
    confidence: Object.freeze({ ...summary.confidence }),
    output: Object.freeze({ ...summary.output })
  }

  if (summary.evaluation) cloned.evaluation = Object.freeze({ ...summary.evaluation })

  return Object.freeze(cloned)
}
