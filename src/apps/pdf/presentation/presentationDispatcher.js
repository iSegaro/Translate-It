import { PRESENTATION_SCOPE, resolvePresentationScope } from './presentationScope.js'
import { resolveSurface } from './presentationPolicy.js'

/**
 * Presentation Dispatcher — routes Presentation Intents to adapters.
 *
 * Reads the `intent` field from the Presentation Intent, maps it to
 * a surface via Presentation Policy, and routes to the correct adapter.
 *
 * Stateless. Framework-agnostic. No Vue, no components, no composables.
 *
 * @param {object} [options]
 * @param {object} [options.adapters] — registry of surface adapters, each exposing dispatch(intent)
 * @returns {{ dispatch: (intent: object) => any }}
 */
export function createPresentationDispatcher({ adapters = {} } = {}) {
  function dispatch(intent) {
    if (!intent || typeof intent !== 'object') return

    const scope = resolvePresentationScope(intent)

    if (scope !== PRESENTATION_SCOPE.GLOBAL) return

    const surface = resolveSurface(intent.intent)
    const adapter = adapters[surface]

    if (typeof adapter?.dispatch !== 'function') return

    return adapter.dispatch(intent)
  }

  return Object.freeze({ dispatch })
}
