import { describe, expect, it } from 'vitest'
import { BenchmarkAnalyzer } from './BenchmarkAnalyzer.js'

function benchmarkResult(results = []) {
  return { results }
}

function recognized(candidateId, { text = 'same', confidence, latencyMs, cer } = {}) {
  const result = {
    candidateId,
    output: { status: 'recognized', data: { text } }
  }
  if (confidence !== undefined) result.output.data.confidence = confidence
  if (latencyMs !== undefined) result.runtime = { latencyMs }
  if (cer !== undefined) result.evaluation = { cer: { characterErrorRate: cer } }
  return result
}

describe('BenchmarkAnalyzer', () => {
  it('accepts a completed BenchmarkResult and derives immutable insights', () => {
    const summary = new BenchmarkAnalyzer().analyze(benchmarkResult([
      recognized('scale-1-eng', { text: 'same', confidence: 90, latencyMs: 80, cer: 0.2 }),
      recognized('scale-1.5-eng', { text: 'same', confidence: 95, latencyMs: 50, cer: 0.1 })
    ]))

    expect(summary).toEqual({
      winnerCandidateId: 'scale-1.5-eng',
      fastestCandidateId: 'scale-1.5-eng',
      latency: { fastestMs: 50, slowestMs: 80, deltaMs: 30 },
      confidence: { highest: 95, lowest: 90, delta: 5 },
      output: { identical: true, comparable: true, uniqueOutputCount: 1 },
      evaluation: { winnerCandidateId: 'scale-1.5-eng', cer: 0.1 }
    })
    expect(Object.isFrozen(summary)).toBe(true)
    expect(Object.isFrozen(summary.latency)).toBe(true)
    expect(Object.isFrozen(summary.confidence)).toBe(true)
    expect(Object.isFrozen(summary.output)).toBe(true)
    expect(Object.isFrozen(summary.evaluation)).toBe(true)
  })

  it('handles empty, failed, and single recognized outputs as not comparable', () => {
    const analyzer = new BenchmarkAnalyzer()

    expect(analyzer.analyze(benchmarkResult()).output).toEqual({ identical: false, comparable: false, uniqueOutputCount: 0 })
    expect(analyzer.analyze(benchmarkResult([{ output: { status: 'failed' } }, recognized('one')])).output)
      .toEqual({ identical: false, comparable: false, uniqueOutputCount: 1 })
    expect(analyzer.analyze(benchmarkResult([{ output: { status: 'failed' } }])).output)
      .toEqual({ identical: false, comparable: false, uniqueOutputCount: 0 })
  })

  it('uses confidence when CER is absent and preserves stable ties', () => {
    const summary = new BenchmarkAnalyzer().analyze(benchmarkResult([
      recognized('first', { text: 'one', confidence: 80, latencyMs: 20 }),
      recognized('second', { text: 'two', confidence: 80, latencyMs: 20 })
    ]))

    expect(summary.winnerCandidateId).toBe('first')
    expect(summary.fastestCandidateId).toBe('first')
    expect(summary.confidence).toEqual({ highest: 80, lowest: 80, delta: 0 })
    expect(summary.latency).toEqual({ fastestMs: 20, slowestMs: 20, deltaMs: 0 })
    expect(summary).not.toHaveProperty('evaluation')
  })

  it('handles missing confidence, one confidence, missing latency, and partial evaluation', () => {
    const summary = new BenchmarkAnalyzer().analyze(benchmarkResult([
      recognized('first', { text: 'one', latencyMs: 10, cer: 0.4 }),
      recognized('second', { text: 'two', confidence: 95 })
    ]))

    expect(summary.winnerCandidateId).toBe('first')
    expect(summary.confidence).toEqual({ highest: 95, lowest: 95, delta: 0 })
    expect(summary.latency).toEqual({ fastestMs: 10, slowestMs: 10, deltaMs: 0 })
    expect(summary.evaluation).toEqual({ winnerCandidateId: 'first', cer: 0.4 })
    expect(new BenchmarkAnalyzer().analyze(benchmarkResult([recognized('third')])).latency)
      .toEqual({ fastestMs: null, slowestMs: null, deltaMs: null })
  })

  it('does not freeze caller-owned result objects', () => {
    const input = benchmarkResult([recognized('first', { confidence: 90, latencyMs: 10 })])
    const output = input.results[0].output

    new BenchmarkAnalyzer().analyze(input)

    expect(Object.isFrozen(input)).toBe(false)
    expect(Object.isFrozen(input.results)).toBe(false)
    expect(Object.isFrozen(output)).toBe(false)
  })
})
