/**
 * Toast Adapter — renders acknowledgement intents as toasts.
 *
 * Receives { intent: 'acknowledgement', severity, message } from the
 * Presentation Dispatcher. Invokes vue-sonner directly.
 *
 * Framework-agnostic. No feature knowledge. No handler map.
 *
 * @param {object} options
 * @param {object} options.toast — vue-sonner toast API { success, error, warning, info }
 * @returns {{ dispatch: (intent: object) => void }}
 */
export function createToastAdapter({ toast } = {}) {
  if (!toast) {
    throw new TypeError('Toast adapter requires a toast API')
  }

  function dispatch(intent) {
    if (!intent || intent.intent !== 'acknowledgement') return

    const { severity, message } = intent
    if (!severity || !message) return

    const fn = toast[severity]
    if (typeof fn !== 'function') return

    fn(message)
  }

  return Object.freeze({ dispatch })
}
