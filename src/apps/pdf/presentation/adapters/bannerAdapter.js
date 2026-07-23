import { COMPARISON_RESULTS, TRANSLATION_RESULTS } from '../operationResults.js'
import { createRegionComparisonNotificationViewModel } from '../../components/notifications/RegionComparisonNotificationMapper.js'
import { PDF_NOTIFICATION_BODY_TYPE } from '../../notifications/PdfNotificationBodyType.js'

function buildSuccessNotification(result) {
  const summary = result.summary
  const details = []

  if (summary?.winner?.candidateId) {
    details.push(`Winner: ${summary.winner.candidateId}.`)
  }
  if (Number.isFinite(summary?.latency?.fastestMs)) {
    details.push(`Fastest: ${summary.latency.fastestMs}ms.`)
  }

  const body = result.result
    ? Object.freeze({
      type: PDF_NOTIFICATION_BODY_TYPE.REGION_COMPARISON_RESULTS,
      payload: Object.freeze(createRegionComparisonNotificationViewModel({
        analysis: summary,
        results: result.result.results,
        totalElapsedMs: result.result.summary?.totalElapsedMs
      }))
    })
    : undefined

  return {
    id: result.id,
    variant: 'success',
    title: 'Region Comparison complete',
    message: details.join(' ') || 'Region Comparison completed.',
    body
  }
}

function buildFailureNotification(result) {
  return {
    id: result.id,
    variant: 'error',
    title: 'Region Comparison failed',
    message: result.error || 'Region Comparison failed. Please try again.'
  }
}

function notificationChanged(a, b) {
  if (!a || !b) return a !== b
  return a.id !== b.id
    || a.variant !== b.variant
    || a.title !== b.title
    || a.message !== b.message
    || a.body !== b.body
}

/**
 * Banner Adapter — converts Operation Results to banner presentation state.
 *
 * Stateful by nature: the banner accumulates results over time
 * (unlike Toast, which is fire-and-forget per dispatch).
 *
 * The adapter is framework-agnostic. The `version` field in state
 * is an opaque invalidation token — consumers use it to detect
 * state changes without callbacks or framework coupling.
 *
 * version changes if and only if observable adapter state changes.
 *
 * @returns {{ dispatch: (result: object) => void, getState: () => object, reset: () => void }}
 */
export function createBannerAdapter() {
  const state = {
    version: 0,
    developerNotification: null,
    translationStatus: 'idle',
    translationOccurrenceId: 0
  }

  function dispatch(result) {
    const type = result?.type

    if (type === COMPARISON_RESULTS.COMPLETED) {
      const notification = buildSuccessNotification(result)
      if (!notificationChanged(state.developerNotification, notification)) return
      state.developerNotification = notification
      state.version++
      return
    }

    if (type === COMPARISON_RESULTS.FAILED) {
      const notification = buildFailureNotification(result)
      if (!notificationChanged(state.developerNotification, notification)) return
      state.developerNotification = notification
      state.version++
      return
    }

    if (type === TRANSLATION_RESULTS.PARTIAL) {
      if (
        state.translationStatus === 'partial' &&
        state.translationOccurrenceId === result.occurrenceId
      ) return
      state.translationStatus = 'partial'
      state.translationOccurrenceId = result.occurrenceId
      state.version++
      return
    }
  }

  function getState() {
    return Object.freeze({ ...state })
  }

  function reset() {
    if (
      state.developerNotification === null &&
      state.translationStatus === 'idle' &&
      state.translationOccurrenceId === 0
    ) return
    state.developerNotification = null
    state.translationStatus = 'idle'
    state.translationOccurrenceId = 0
    state.version++
  }

  return Object.freeze({ dispatch, getState, reset })
}
