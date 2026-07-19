import { createBenchmarkSummary } from './BenchmarkSummary.js'

function confidenceOf(result) {
  const confidence = result?.output?.data?.confidence
  return Number.isFinite(confidence) ? confidence : null
}

function cerOf(result) {
  const cer = result?.evaluation?.cer?.characterErrorRate
  return Number.isFinite(cer) ? cer : null
}

export class BenchmarkAnalyzer {
  analyze(benchmarkResult = {}) {
    const results = Array.isArray(benchmarkResult.results) ? benchmarkResult.results : []
    const latencyResults = results.filter(result => Number.isFinite(result?.runtime?.latencyMs))
    const confidenceResults = results.map(result => ({ result, confidence: confidenceOf(result) }))
      .filter(({ confidence }) => confidence !== null)
    const evaluatedResults = results.map(result => ({ result, cer: cerOf(result) }))
      .filter(({ cer }) => cer !== null)
    const successfulTexts = results
      .filter(result => result?.output?.status === 'recognized' && typeof result?.output?.data?.text === 'string')
      .map(result => result.output.data.text)
    const fastest = latencyResults.reduce((best, result) => !best || result.runtime.latencyMs < best.runtime.latencyMs ? result : best, null)
    const slowest = latencyResults.reduce((best, result) => !best || result.runtime.latencyMs > best.runtime.latencyMs ? result : best, null)
    const highestConfidence = confidenceResults.reduce((best, item) => !best || item.confidence > best.confidence ? item : best, null)
    const lowestConfidence = confidenceResults.reduce((best, item) => !best || item.confidence < best.confidence ? item : best, null)
    const evaluationWinner = evaluatedResults.reduce((best, item) => !best || item.cer < best.cer ? item : best, null)
    const outputCount = new Set(successfulTexts).size

    const summary = {
      winnerCandidateId: evaluationWinner?.result.candidateId ?? highestConfidence?.result.candidateId ?? null,
      winner: evaluationWinner
        ? { candidateId: evaluationWinner.result.candidateId, reason: 'lowest-cer' }
        : highestConfidence
          ? { candidateId: highestConfidence.result.candidateId, reason: 'highest-confidence' }
          : null,
      fastestCandidateId: fastest?.candidateId ?? null,
      latency: {
        fastestMs: fastest?.runtime.latencyMs ?? null,
        slowestMs: slowest?.runtime.latencyMs ?? null,
        deltaMs: fastest && slowest ? slowest.runtime.latencyMs - fastest.runtime.latencyMs : null
      },
      confidence: {
        highest: highestConfidence?.confidence ?? null,
        lowest: lowestConfidence?.confidence ?? null,
        delta: highestConfidence && lowestConfidence ? highestConfidence.confidence - lowestConfidence.confidence : null,
        comparable: confidenceResults.length >= 2
      },
      output: {
        identical: successfulTexts.length >= 2 && outputCount === 1,
        comparable: successfulTexts.length >= 2,
        uniqueOutputCount: outputCount
      }
    }

    if (evaluationWinner) {
      summary.evaluation = {
        winnerCandidateId: evaluationWinner.result.candidateId,
        cer: evaluationWinner.cer
      }
    }

    return createBenchmarkSummary(summary)
  }
}
