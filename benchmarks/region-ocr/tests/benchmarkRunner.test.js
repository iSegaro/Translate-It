import { describe, expect, it } from 'vitest'

import { createBenchmarkCorpusModel } from '../corpus/index.js'
import {
  BenchmarkRunContext,
  cancelBenchmark,
  createBenchmarkRunner,
  runBenchmark
} from '../runner/index.js'

function createCorpus() {
  return createBenchmarkCorpusModel({
    corpusId: 'runner-corpus',
    corpusVersion: '1.0.0',
    schemaVersion: '1.0.0',
    documents: [{
      id: 'doc-b',
      file: 'b.pdf',
      regions: [
        { id: 'r2' },
        { id: 'r1' }
      ]
    }, {
      id: 'doc-a',
      file: 'a.pdf',
      regions: [
        { id: 'r3' }
      ]
    }]
  })
}

function resolvedOperation(value) {
  return {
    promise: Promise.resolve(value),
    cancel() {}
  }
}

function deferredOperation() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return {
    promise,
    resolve,
    reject,
    cancelCalls: 0,
    cancel() {
      this.cancelCalls += 1
    }
  }
}

describe('Region OCR benchmark runner foundation', () => {
  it('traverses corpus documents and regions deterministically in manifest order', async () => {
    const seen = []
    const operation = runBenchmark({
      runId: 'run-001',
      corpus: createCorpus(),
      executeRegion({ document, region }) {
        seen.push(`${document.id}/${region.id}`)
        return resolvedOperation({ payload: `${document.id}/${region.id}` })
      }
    })

    const result = await operation.promise

    expect(seen).toEqual(['doc-b/r2', 'doc-b/r1', 'doc-a/r3'])
    expect(result.regionResults.map(({ documentId, regionId }) => `${documentId}/${regionId}`)).toEqual(seen)
  })

  it('executes regions sequentially by default', async () => {
    const calls = []
    const first = deferredOperation()
    const second = deferredOperation()
    const operations = [first, second, resolvedOperation('third')]
    const run = runBenchmark({
      runId: 'run-001',
      corpus: createCorpus(),
      executeRegion({ region }) {
        calls.push(region.id)
        return operations.shift()
      }
    })

    expect(calls).toEqual(['r2'])
    first.resolve('first')
    await Promise.resolve()
    expect(calls).toEqual(['r2', 'r1'])
    second.resolve('second')

    const result = await run.promise
    expect(result).toMatchObject({ status: 'completed', completedRegions: 3, failedRegions: 0 })
  })

  it('cancels before scheduling later regions', async () => {
    const calls = []
    const active = deferredOperation()
    const run = runBenchmark({
      runId: 'run-001',
      corpus: createCorpus(),
      executeRegion({ region }) {
        calls.push(region.id)
        return active
      }
    })

    run.cancel()
    active.resolve({ ignored: true })

    const result = await run.promise

    expect(calls).toEqual(['r2'])
    expect(result).toMatchObject({
      status: 'cancelled',
      completedRegions: 0,
      cancelledRegions: 3,
      failedRegions: 0,
      regionResults: []
    })
  })

  it('forwards cancellation to the active region operation and suppresses late completion', async () => {
    const active = deferredOperation()
    const run = runBenchmark({
      runId: 'run-001',
      corpus: createCorpus(),
      executeRegion() {
        return active
      }
    })

    cancelBenchmark(run)
    active.resolve({ latePayload: true })

    const result = await run.promise
    expect(active.cancelCalls).toBe(1)
    expect(result).toMatchObject({
      status: 'cancelled',
      completedRegions: 0,
      cancelledRegions: 3,
      regionResults: []
    })
  })

  it('reports deterministic execution progress without timing or metric fields', async () => {
    const progress = []
    const run = runBenchmark({
      runId: 'run-001',
      corpus: createCorpus(),
      onProgress(snapshot) {
        progress.push(snapshot)
      },
      executeRegion({ region }) {
        return resolvedOperation(region.id)
      }
    })

    await run.promise

    expect(progress.map((item) => ({
      totalRegions: item.totalRegions,
      completedRegions: item.completedRegions,
      failedRegions: item.failedRegions,
      currentDocument: item.currentDocument?.id || null,
      currentRegion: item.currentRegion?.id || null
    }))).toEqual([
      { totalRegions: 3, completedRegions: 0, failedRegions: 0, currentDocument: null, currentRegion: null },
      { totalRegions: 3, completedRegions: 0, failedRegions: 0, currentDocument: 'doc-b', currentRegion: 'r2' },
      { totalRegions: 3, completedRegions: 1, failedRegions: 0, currentDocument: 'doc-b', currentRegion: 'r2' },
      { totalRegions: 3, completedRegions: 1, failedRegions: 0, currentDocument: 'doc-b', currentRegion: 'r1' },
      { totalRegions: 3, completedRegions: 2, failedRegions: 0, currentDocument: 'doc-b', currentRegion: 'r1' },
      { totalRegions: 3, completedRegions: 2, failedRegions: 0, currentDocument: 'doc-a', currentRegion: 'r3' },
      { totalRegions: 3, completedRegions: 3, failedRegions: 0, currentDocument: 'doc-a', currentRegion: 'r3' }
    ])
    expect(Object.keys(progress[0]).sort()).toEqual([
      'completedRegions',
      'currentDocument',
      'currentRegion',
      'failedRegions',
      'totalRegions'
    ])
  })

  it('reports failed region count immediately after failures', async () => {
    const progress = []
    let calls = 0
    const run = runBenchmark({
      runId: 'run-001',
      corpus: createCorpus(),
      onProgress(snapshot) {
        progress.push(snapshot)
      },
      executeRegion() {
        calls += 1
        return calls === 1
          ? { promise: Promise.reject(new Error('failed')), cancel() {} }
          : resolvedOperation({ ok: true })
      }
    })

    await run.promise

    expect(progress.map(({ completedRegions, failedRegions }) => ({ completedRegions, failedRegions }))).toEqual([
      { completedRegions: 0, failedRegions: 0 },
      { completedRegions: 0, failedRegions: 0 },
      { completedRegions: 0, failedRegions: 1 },
      { completedRegions: 0, failedRegions: 1 },
      { completedRegions: 1, failedRegions: 1 },
      { completedRegions: 1, failedRegions: 1 },
      { completedRegions: 2, failedRegions: 1 }
    ])
  })

  it('returns deeply immutable execution results preserving callback payloads', async () => {
    const payload = { nested: { retained: true } }
    const run = runBenchmark({
      runId: 'run-001',
      corpus: createCorpus(),
      executeRegion() {
        return resolvedOperation(payload)
      }
    })

    const result = await run.promise

    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.regionResults[0].value.nested)).toBe(true)
    expect(result.regionResults[0].value.nested.retained).toBe(true)
    expect(() => {
      result.regionResults[0].value.nested.retained = false
    }).toThrow(TypeError)
  })

  it('captures callback failures as failed region results and continues traversal', async () => {
    const failure = new Error('region failed')
    let calls = 0
    const run = runBenchmark({
      runId: 'run-001',
      corpus: createCorpus(),
      executeRegion() {
        calls += 1
        return calls === 1
          ? { promise: Promise.reject(failure), cancel() {} }
          : resolvedOperation({ ok: true })
      }
    })

    const result = await run.promise

    expect(result).toMatchObject({ status: 'completed', completedRegions: 2, failedRegions: 1 })
    expect(result.regionResults[0]).toMatchObject({ status: 'failed', reason: failure })
  })

  it('passes an immutable cancellation-aware run context to every callback', async () => {
    const contexts = []
    const run = runBenchmark({
      corpus: createCorpus(),
      runId: 'run-123',
      executeRegion({ context }) {
        contexts.push(context)
        return resolvedOperation(context.runId)
      }
    })

    await run.promise
    expect(contexts.every((context) => context instanceof BenchmarkRunContext)).toBe(true)
    expect(contexts.every((context) => context === run.context)).toBe(true)
    expect(run.context).toMatchObject({ runId: 'run-123', totalRegions: 3 })
    expect(Object.isFrozen(run.context)).toBe(true)
  })

  it('creates a runner that owns one active execution and forwards cancel', async () => {
    const active = deferredOperation()
    const runner = createBenchmarkRunner({
      runId: 'run-001',
      corpus: createCorpus(),
      executeRegion() {
        return active
      }
    })

    const run = runner.run()
    expect(() => runner.run()).toThrow('Benchmark runner already has an active operation')
    runner.cancel()
    active.resolve('late')

    const result = await run.promise
    expect(active.cancelCalls).toBe(1)
    expect(result.status).toBe('cancelled')
  })

  it('requires caller-provided runId without inventing execution identity', () => {
    expect(() => runBenchmark({
      corpus: createCorpus(),
      executeRegion() {
        return resolvedOperation(null)
      }
    })).toThrow(new TypeError('runBenchmark requires runId'))
  })
})
