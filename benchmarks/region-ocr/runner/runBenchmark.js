import { BenchmarkRunContext } from './BenchmarkRunContext.js'

const RUN_STATUS = Object.freeze({
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
})

const REGION_STATUS = Object.freeze({
  COMPLETED: 'completed',
  FAILED: 'failed'
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
    completedRegions: 0,
    failedRegions: 0,
    regionResults: []
  }

  async function run() {
    emitProgress(options.onProgress, traversal.length, 0, 0, null)

    for (const item of traversal) {
      if (context.cancelled) break

      emitProgress(options.onProgress, traversal.length, state.completedRegions, state.failedRegions, item)

      try {
        const operation = options.executeRegion({
          document: item.document,
          region: item.region,
          context
        })
        state.activeOperation = operation
        const value = await operation.promise
        state.activeOperation = null
        if (context.cancelled) break

        state.completedRegions += 1
        state.regionResults.push({
          documentId: item.document.id,
          regionId: item.region.id,
          status: REGION_STATUS.COMPLETED,
          value
        })
      } catch (reason) {
        state.activeOperation = null
        if (context.cancelled) break

        state.failedRegions += 1
        state.regionResults.push({
          documentId: item.document.id,
          regionId: item.region.id,
          status: REGION_STATUS.FAILED,
          reason
        })
      }

      emitProgress(options.onProgress, traversal.length, state.completedRegions, state.failedRegions, item)
    }

    const visitedRegions = state.completedRegions + state.failedRegions
    return deepFreeze({
      status: context.cancelled ? RUN_STATUS.CANCELLED : RUN_STATUS.COMPLETED,
      totalRegions: traversal.length,
      completedRegions: state.completedRegions,
      cancelledRegions: context.cancelled ? traversal.length - visitedRegions : 0,
      failedRegions: state.failedRegions,
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
