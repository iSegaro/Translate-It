import {
  RegionExecutionStatus,
  finalizeRegionExecutionResult
} from '../execution-results/index.js'
import { BenchmarkRunContext } from './BenchmarkRunContext.js'

const RUN_STATUS = Object.freeze({
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
})

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  Object.values(value).forEach((child) => deepFreeze(child, seen))
  return Object.freeze(value)
}

function createTraversal(corpus) {
  return (corpus.documents || []).flatMap((document, documentIndex) => (
    (document.regions || []).map((region, regionIndex) => ({
      document,
      region,
      documentIndex,
      regionIndex
    }))
  ))
}

function progressSnapshot(totalRegions, completedRegions, failedRegions, current) {
  return Object.freeze({
    totalRegions,
    completedRegions,
    failedRegions,
    currentDocument: current?.document || null,
    currentRegion: current?.region || null
  })
}

function emitProgress(onProgress, totalRegions, completedRegions, failedRegions, current) {
  onProgress?.(progressSnapshot(totalRegions, completedRegions, failedRegions, current))
}

function incrementStatusCounter(state, status) {
  switch (status) {
    case RegionExecutionStatus.RECOGNIZED:
      state.recognizedRegions += 1
      state.completedRegions += 1
      break
    case RegionExecutionStatus.FAILED:
      state.failedRegions += 1
      break
    case RegionExecutionStatus.SKIPPED:
      state.skippedRegions += 1
      state.completedRegions += 1
      break
    case RegionExecutionStatus.CANCELLED:
      state.cancelledRegions += 1
      state.completedRegions += 1
      break
  }
}

function createIdentityMismatchFailure(item, received) {
  return createOrchestrationFailure(item, {
    code: 'region_identity_mismatch',
    expected: {
      documentId: item.document.id,
      regionId: item.region.id
    },
    received: {
      documentId: received?.documentId,
      regionId: received?.regionId
    }
  })
}

function recordExecutionResult(state, item, result) {
  const finalized = finalizeRegionExecutionResult(result)
  if (finalized.documentId !== item.document.id || finalized.regionId !== item.region.id) {
    const failure = createIdentityMismatchFailure(item, finalized)
    state.regionResults.push(failure)
    incrementStatusCounter(state, failure.status)
    return
  }

  state.regionResults.push(finalized)
  incrementStatusCounter(state, finalized.status)
}

function createOrchestrationFailure(item, reason) {
  return finalizeRegionExecutionResult({
    documentId: item.document.id,
    regionId: item.region.id,
    status: RegionExecutionStatus.FAILED,
    payload: { reason }
  })
}

function validateOptions(options) {
  if (!options?.corpus) throw new TypeError('runBenchmark requires corpus')
  if (!options.runId) throw new TypeError('runBenchmark requires runId')
  if (typeof options.executeRegion !== 'function') throw new TypeError('runBenchmark requires executeRegion callback')
}

export function runBenchmark(options) {
  validateOptions(options)

  const traversal = createTraversal(options.corpus)
  const context = new BenchmarkRunContext({
    runId: options.runId,
    corpus: options.corpus,
    totalRegions: traversal.length
  })
  const state = {
    activeOperation: null,
    startedRegions: 0,
    completedRegions: 0,
    recognizedRegions: 0,
    failedRegions: 0,
    skippedRegions: 0,
    cancelledRegions: 0,
    regionResults: []
  }

  async function run() {
    emitProgress(options.onProgress, traversal.length, 0, 0, null)

    for (const item of traversal) {
      if (context.cancelled) break

      emitProgress(options.onProgress, traversal.length, state.completedRegions, state.failedRegions, item)

      try {
        state.startedRegions += 1
        const operation = options.executeRegion({
          document: item.document,
          region: item.region,
          context
        })
        state.activeOperation = operation
        const executionResult = await operation.promise
        state.activeOperation = null
        if (context.cancelled) break

        recordExecutionResult(state, item, executionResult)
      } catch (reason) {
        state.activeOperation = null
        if (context.cancelled) break

        recordExecutionResult(state, item, createOrchestrationFailure(item, reason))
      }

      emitProgress(options.onProgress, traversal.length, state.completedRegions, state.failedRegions, item)
    }

    const finishedRegions = state.recognizedRegions + state.failedRegions + state.skippedRegions + state.cancelledRegions
    return deepFreeze({
      status: context.cancelled ? RUN_STATUS.CANCELLED : RUN_STATUS.COMPLETED,
      totalRegions: traversal.length,
      recognizedRegions: state.recognizedRegions,
      failedRegions: state.failedRegions,
      skippedRegions: state.skippedRegions,
      cancelledRegions: state.cancelledRegions,
      runCancelledRegions: context.cancelled ? state.startedRegions - finishedRegions : 0,
      unscheduledRegions: context.cancelled ? traversal.length - state.startedRegions : 0,
      regionResults: state.regionResults
    })
  }

  return {
    promise: run(),
    cancel() {
      if (context.cancelled) return
      context.cancel()
      state.activeOperation?.cancel?.()
    },
    context
  }
}

export function cancelBenchmark(operation) {
  operation?.cancel?.()
}
