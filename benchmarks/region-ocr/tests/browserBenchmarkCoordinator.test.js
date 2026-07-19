import { describe, expect, it, vi } from 'vitest'

vi.mock('@/features/screen-capture/services/ocrEngine.js', () => ({
  prepareOCREngine: vi.fn(),
  recognizeStructured: vi.fn()
}))

vi.mock('@/features/screen-capture/utils/ocrLanguageMap.js', () => ({
  toTesseractLanguageCode: language => language
}))

vi.mock('@/features/pdf-translation/core/pdfjs.js', () => ({
  ensurePdfJsConfigured: vi.fn()
}))

import { BrowserBenchmarkCoordinator } from '../browser/BrowserBenchmarkCoordinator.js'

const HASH = value => `sha256:${value.repeat(64).slice(0, 64)}`

function candidates(values = [1, 2]) {
  return values.map((scale, index) => ({ id: `candidate-${index + 1}`, scale, language: 'eng' }))
}

function execution(candidate) {
  return {
    artifacts: {
      run: { artifactId: `run-${candidate.id}` },
      samples: [{ artifactId: `sample-${candidate.id}` }]
    }
  }
}

function scoring(candidate) {
  const metricValue = candidate.scale / 10
  return {
    runtimeResult: {
      sampleScores: [{ documentId: 'doc-01', regionId: 'region-01', status: 'recognized', metrics: { cer: metricValue }, normalization: {}, diagnostics: {}, metadata: {} }],
      summary: {
        total: 1,
        recognized: 1,
        failed: 0,
        cancelled: 0,
        skipped: 0,
        metrics: { cer: { count: 1, mean: metricValue } }
      },
      normalizationPolicy: { id: 'unicode-nfc', version: '1.0.0', parameters: {} },
      scorer: { id: 'region-ocr-metrics', version: '1.0.0', parameters: {} }
    },
    artifact: {
      schemaVersion: '1.0.0',
      artifactType: 'scored-result',
      artifactId: `scored-${candidate.id}`,
      contentHash: HASH(String(candidate.scale)),
      normalizationPolicy: { id: 'unicode-nfc', version: '1.0.0', parameters: {} },
      scorer: { id: 'region-ocr-metrics', version: '1.0.0', parameters: {} }
    }
  }
}

function createCoordinator({
  candidateList = candidates(),
  createExecutionAdapter,
  writeComparisonArtifact = vi.fn(input => input)
} = {}) {
  const adapters = []
  const adapterFactory = createExecutionAdapter || vi.fn(({ candidate }) => {
    const adapter = { run: vi.fn(() => ({ promise: Promise.resolve(execution(candidate)), cancel: vi.fn() })) }
    adapters.push(adapter)
    return adapter
  })
  const score = vi.fn(({ rawRun }) => {
    const id = rawRun.artifactId.startsWith('run-') ? rawRun.artifactId.slice(4) : 'unknown'
    const match = candidateList.find(c => c.id === id)
    return scoring(match || { id, scale: 1, language: 'eng' })
  })
  const coordinator = new BrowserBenchmarkCoordinator({
    corpus: { manifest: {} },
    assets: [],
    candidates: candidateList,
    createRunDescriptor: ({ candidate }) => ({ runId: `run-${candidate.id}` }),
    createSampleArtifactMetadata: () => ({}),
    createScoredResultDescriptor: () => ({}),
    createComparisonResultDescriptor: () => ({ artifactId: 'comparison-001' }),
    loadGroundTruthLookup: vi.fn(async () => ({})),
    createMetricRegistry: vi.fn(() => ({ score })),
    createExecutionAdapter: adapterFactory,
    writeComparisonArtifact
  })
  return { coordinator, adapterFactory, adapters, score, writeComparisonArtifact }
}

describe('Browser benchmark coordinator', () => {
  it('executes one candidate without invoking a comparison runtime', async () => {
    const { coordinator, writeComparisonArtifact } = createCoordinator({ candidateList: candidates([1]) })
    const result = await coordinator.run().promise

    expect(result.candidateResults).toHaveLength(1)
    expect(result.comparisonRuntimeResult).toBeNull()
    expect(result.comparisonArtifact).toBeNull()
    expect(writeComparisonArtifact).not.toHaveBeenCalled()
  })

  it('executes candidates sequentially with their explicit scales and produces comparison artifact', async () => {
    const { coordinator, adapterFactory, writeComparisonArtifact } = createCoordinator({ candidateList: candidates([1.25, 2, 3]) })
    const result = await coordinator.run().promise

    expect(adapterFactory.mock.calls.map(([options]) => options.candidate.scale)).toEqual([1.25, 2, 3])
    expect(result.candidateResults.map(({ candidate }) => candidate.id)).toEqual(['candidate-1', 'candidate-2', 'candidate-3'])
    expect(result.comparisonRuntimeResult.candidates.map(({ label }) => label)).toEqual(['candidate-1', 'candidate-2', 'candidate-3'])
    expect(writeComparisonArtifact).toHaveBeenCalledOnce()
    expect(writeComparisonArtifact.mock.calls[0][0].comparisonResultDescriptor.candidateRefs.map(({ label }) => label)).toEqual(['candidate-1', 'candidate-2', 'candidate-3'])
  })

  it('continues later candidates after one candidate operation fails', async () => {
    const candidateList = candidates([1, 2])
    const createExecutionAdapter = vi.fn(({ candidate }) => ({
      run: vi.fn(() => candidate.id === 'candidate-1'
        ? { promise: Promise.reject(new Error('first candidate failed')), cancel: vi.fn() }
        : { promise: Promise.resolve(execution(candidate)), cancel: vi.fn() })
    }))
    const { coordinator, writeComparisonArtifact } = createCoordinator({ candidateList, createExecutionAdapter })
    const result = await coordinator.run().promise

    expect(createExecutionAdapter.mock.calls.map(([options]) => options.candidate.id)).toEqual(['candidate-1', 'candidate-2'])
    expect(result.candidateFailures.map(({ candidate }) => candidate.id)).toEqual(['candidate-1'])
    expect(result.candidateResults.map(({ candidate }) => candidate.id)).toEqual(['candidate-2'])
    expect(writeComparisonArtifact).not.toHaveBeenCalled()
  })

  it('preserves supplied candidate ordering deterministically', async () => {
    const candidateList = [
      { id: 'third', scale: 3, language: 'eng' },
      { id: 'first', scale: 1, language: 'eng' }
    ]
    const { coordinator } = createCoordinator({ candidateList })
    const first = await coordinator.run().promise
    const second = await createCoordinator({ candidateList }).coordinator.run().promise

    expect(first.comparisonRuntimeResult.candidates.map(({ label }) => label)).toEqual(['third', 'first'])
    expect(second.comparisonRuntimeResult).toEqual(first.comparisonRuntimeResult)
  })

  it('propagates cancellation to active candidate and does not start next candidate', async () => {
    let resolveExecution
    const activeCancel = vi.fn(() => resolveExecution(execution(candidates([1])[0])))
    const createExecutionAdapter = vi.fn(() => ({
      run: vi.fn(() => ({ promise: new Promise(resolve => { resolveExecution = resolve }), cancel: activeCancel }))
    }))
    const { coordinator } = createCoordinator({ createExecutionAdapter })
    const operation = coordinator.run()
    await vi.waitFor(() => expect(createExecutionAdapter).toHaveBeenCalledOnce())
    operation.cancel()
    const result = await operation.promise

    expect(activeCancel).toHaveBeenCalledOnce()
    expect(createExecutionAdapter).toHaveBeenCalledOnce()
    expect(result.cancelled).toBe(true)
  })
})
