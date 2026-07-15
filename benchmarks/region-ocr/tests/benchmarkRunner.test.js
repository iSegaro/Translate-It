import { describe, expect, it } from 'vitest'

import { createBenchmarkCorpusModel } from '../corpus/index.js'
import { RegionExecutionStatus } from '../execution-results/index.js'
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

function executionResult(documentId, regionId, payload = {}, status = RegionExecutionStatus.RECOGNIZED) {
  return { documentId, regionId, status, payload }
}

function expectAccountingInvariant(result) {
  expect(
    result.recognizedRegions +
    result.failedRegions +
    result.skippedRegions +
    result.cancelledRegions +
    result.runCancelledRegions +
    result.unscheduledRegions
  ).toBe(result.totalRegions)
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
        return resolvedOperation(executionResult(document.id, region.id, { value: `${document.id}/${region.id}` }))
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
    const operations = [first, second]
    const run = runBenchmark({
      runId: 'run-001',
      corpus: createCorpus(),
      executeRegion({ region }) {
        calls.push(region.id)
        return operations.shift() || resolvedOperation(executionResult('doc-a', region.id, { value: 'third' }))
      }
    })

    expect(calls).toEqual(['r2'])
    first.resolve(executionResult('doc-b', 'r2', { value: 'first' }))
    await Promise.resolve()
    expect(calls).toEqual(['r2', 'r1'])
    second.resolve(executionResult('doc-b', 'r1', { value: 'second' }))

    const result = await run.promise
    expect(result).toMatchObject({ status: 'completed', recognizedRegions: 3, failedRegions: 0 })
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
    active.resolve(executionResult('doc-b', 'r2', { ignored: true }))

    const result = await run.promise

    expect(calls).toEqual(['r2'])
    expect(result).toMatchObject({
      status: 'cancelled',
      recognizedRegions: 0,
      cancelledRegions: 0,
      runCancelledRegions: 1,
      unscheduledRegions: 2,
      failedRegions: 0,
      regionResults: []
    })
    expectAccountingInvariant(result)
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
    active.resolve(executionResult('doc-b', 'r2', { latePayload: true }))

    const result = await run.promise
    expect(active.cancelCalls).toBe(1)
    expect(result).toMatchObject({
      status: 'cancelled',
      recognizedRegions: 0,
      cancelledRegions: 0,
      runCancelledRegions: 1,
      unscheduledRegions: 2,
      regionResults: []
    })
    expectAccountingInvariant(result)
  })

  it('accounts run cancellation during second active region as started but unfinished', async () => {
    const first = deferredOperation()
    const second = deferredOperation()
    const operations = [first, second]
    const calls = []
    const run = runBenchmark({
      runId: 'run-001',
      corpus: createCorpus(),
      executeRegion({ document, region }) {
        calls.push(`${document.id}/${region.id}`)
        return operations.shift()
      }
    })

    first.resolve(executionResult('doc-b', 'r2', { ok: true }))
    await Promise.resolve()
    run.cancel()
    second.resolve(executionResult('doc-b', 'r1', { late: true }))

    const result = await run.promise

    expect(calls).toEqual(['doc-b/r2', 'doc-b/r1'])
    expect(result).toMatchObject({
      status: 'cancelled',
      recognizedRegions: 1,
      runCancelledRegions: 1,
      unscheduledRegions: 1,
      regionResults: [expect.objectContaining({ documentId: 'doc-b', regionId: 'r2' })]
    })
    expectAccountingInvariant(result)
  })

  it('reports deterministic execution progress without timing or metric fields', async () => {
    const progress = []
    const run = runBenchmark({
      runId: 'run-001',
      corpus: createCorpus(),
      onProgress(snapshot) {
        progress.push(snapshot)
      },
      executeRegion({ document, region }) {
        return resolvedOperation(executionResult(document.id, region.id, { value: region.id }))
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
          : resolvedOperation(executionResult(calls === 2 ? 'doc-b' : 'doc-a', calls === 2 ? 'r1' : 'r3', { ok: true }))
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
      executeRegion({ document, region }) {
        return resolvedOperation(executionResult(document.id, region.id, payload))
      }
    })

    const result = await run.promise

    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.regionResults[0].payload.nested)).toBe(true)
    expect(result.regionResults[0].payload.nested.retained).toBe(true)
    expect(() => {
      result.regionResults[0].payload.nested.retained = false
    }).toThrow(TypeError)
  })

  it('stores callback-owned execution results unchanged after finalization', async () => {
    const callbackResult = executionResult('doc-b', 'r2', {
      callbackOwned: true
    }, RegionExecutionStatus.SKIPPED)
    const run = runBenchmark({
      runId: 'run-001',
      corpus: createCorpus(),
      executeRegion({ document, region }) {
        return document.id === 'doc-b' && region.id === 'r2'
          ? resolvedOperation(callbackResult)
          : resolvedOperation(executionResult(document.id, region.id, { ok: true }))
      }
    })

    const result = await run.promise

    expect(result).toMatchObject({ recognizedRegions: 2, skippedRegions: 1, failedRegions: 0 })
    expect(result.regionResults[0]).toStrictEqual(callbackResult)
    expect(result.regionResults[0]).toMatchObject({
      documentId: 'doc-b',
      regionId: 'r2',
      status: 'skipped',
      payload: { callbackOwned: true }
    })
    expect(Object.isFrozen(result.regionResults[0])).toBe(true)
  })

  it.each([
    ['wrong documentId', executionResult('wrong-doc', 'r2', { bad: true })],
    ['wrong regionId', executionResult('doc-b', 'wrong-region', { bad: true })],
    ['both wrong', executionResult('wrong-doc', 'wrong-region', { bad: true })]
  ])('rejects callback result with %s and records orchestration failure', async (_, badResult) => {
    const calls = []
    const run = runBenchmark({
      runId: 'run-001',
      corpus: createCorpus(),
      executeRegion({ document, region }) {
        calls.push(`${document.id}/${region.id}`)
        return calls.length === 1
          ? resolvedOperation(badResult)
          : resolvedOperation(executionResult(document.id, region.id, { ok: true }))
      }
    })

    const result = await run.promise

    expect(calls).toEqual(['doc-b/r2', 'doc-b/r1', 'doc-a/r3'])
    expect(result).toMatchObject({ recognizedRegions: 2, failedRegions: 1 })
    expect(result.regionResults[0]).toMatchObject({
      documentId: 'doc-b',
      regionId: 'r2',
      status: 'failed',
      payload: {
        reason: {
          code: 'region_identity_mismatch',
          expected: { documentId: 'doc-b', regionId: 'r2' },
          received: { documentId: badResult.documentId, regionId: badResult.regionId }
        }
      }
    })
  })

  it('counts callback-owned failed execution results without wrapping them', async () => {
    const failedResult = executionResult('doc-b', 'r2', { executionFailed: true }, RegionExecutionStatus.FAILED)
    const run = runBenchmark({
      runId: 'run-001',
      corpus: createCorpus(),
      executeRegion({ document, region }) {
        return document.id === 'doc-b' && region.id === 'r2'
          ? resolvedOperation(failedResult)
          : resolvedOperation(executionResult(document.id, region.id, { ok: true }))
      }
    })

    const result = await run.promise

    expect(result).toMatchObject({ recognizedRegions: 2, failedRegions: 1 })
    expect(result.regionResults[0]).toStrictEqual(failedResult)
    expect(result.regionResults[0].payload).toEqual({ executionFailed: true })
  })

  it('counts callback-owned cancelled execution results separately from unscheduled regions', async () => {
    const run = runBenchmark({
      runId: 'run-001',
      corpus: createCorpus(),
      executeRegion({ document, region }) {
        return document.id === 'doc-b' && region.id === 'r2'
          ? resolvedOperation(executionResult(document.id, region.id, { executionCancelled: true }, RegionExecutionStatus.CANCELLED))
          : resolvedOperation(executionResult(document.id, region.id, { ok: true }))
      }
    })

    const result = await run.promise

    expect(result).toMatchObject({
      status: 'completed',
      recognizedRegions: 2,
      cancelledRegions: 1,
      runCancelledRegions: 0,
      unscheduledRegions: 0,
      failedRegions: 0
    })
    expectAccountingInvariant(result)
  })

  it('captures orchestration failures as failed region results and continues traversal', async () => {
    const failure = new Error('region failed')
    let calls = 0
    const run = runBenchmark({
      runId: 'run-001',
      corpus: createCorpus(),
      executeRegion() {
        calls += 1
        return calls === 1
          ? { promise: Promise.reject(failure), cancel() {} }
          : resolvedOperation(executionResult(calls === 2 ? 'doc-b' : 'doc-a', calls === 2 ? 'r1' : 'r3', { ok: true }))
      }
    })

    const result = await run.promise

    expect(result).toMatchObject({ status: 'completed', recognizedRegions: 2, failedRegions: 1 })
    expect(result.regionResults[0]).toMatchObject({ status: 'failed', payload: { reason: failure } })
  })

  it('passes an immutable cancellation-aware run context to every callback', async () => {
    const contexts = []
    const run = runBenchmark({
      corpus: createCorpus(),
      runId: 'run-123',
      executeRegion({ document, region, context }) {
        contexts.push(context)
        return resolvedOperation(executionResult(document.id, region.id, { value: context.runId }))
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
    active.resolve(executionResult('doc-b', 'r2', { late: true }))

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
