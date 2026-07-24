import { createRegionComparisonNotificationViewModel } from '../../components/notifications/RegionComparisonNotificationMapper.js'
import { PDF_NOTIFICATION_BODY_TYPE } from '../../notifications/PdfNotificationBodyType.js'

function buildComparisonBody(comparison) {
  if (!comparison) return undefined
  return Object.freeze({
    type: PDF_NOTIFICATION_BODY_TYPE.REGION_COMPARISON_RESULTS,
    payload: Object.freeze(createRegionComparisonNotificationViewModel(comparison))
  })
}

function buildNotification(notification, comparison) {
  return {
    ...notification,
    body: buildComparisonBody(comparison)
  }
}

/**
 * Banner Adapter — stores outcome presentation state.
 *
 * Receives { intent: 'outcome', notification?, comparison?, translationOutcome? }
 * from Presentation Dispatcher. Builds Banner-specific comparison bodies and
 * stores latest outcome state for each field.
 *
 * Framework-agnostic. Pure JavaScript. No Vue, no composables.
 *
 * version changes if and only if observable adapter state changes.
 *
 * @returns {{ dispatch: (intent: object) => void, getState: () => object, reset: () => void }}
 */
export function createBannerAdapter() {
  const state = {
    version: 0,
    developerNotification: null,
    translationNotification: null
  }

  function notificationChanged(a, b) {
    if (!a || !b) return a !== b
    return a.id !== b.id
      || a.variant !== b.variant
      || a.title !== b.title
      || a.message !== b.message
      || a.body !== b.body
  }

  function dispatch(intent) {
    if (!intent || intent.intent !== 'outcome') return

    if (intent.notification) {
      const notification = buildNotification(intent.notification, intent.comparison)
      if (!notificationChanged(state.developerNotification, notification)) return
      state.developerNotification = notification
      state.version++
      return
    }

    if (intent.translationOutcome) {
      if (notificationChanged(state.translationNotification, intent.translationOutcome)) {
        state.translationNotification = intent.translationOutcome
      } else {
        return
      }
      state.version++
      return
    }

    if (intent.clearTranslationOutcome && state.translationNotification !== null) {
      state.translationNotification = null
      state.version++
    }
  }

  function getState() {
    return Object.freeze({ ...state })
  }

  function reset() {
    if (
      state.developerNotification === null &&
      state.translationNotification === null
    ) return
    state.developerNotification = null
    state.translationNotification = null
    state.version++
  }

  return Object.freeze({ dispatch, getState, reset })
}
