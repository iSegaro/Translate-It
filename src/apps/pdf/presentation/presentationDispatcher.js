import { classify } from './semanticClassification.js'
import { PRESENTATION_SCOPE, resolvePresentationScope } from './presentationScope.js'
import { resolveSurface } from './feedbackPolicy.js'

/**
 * Presentation Dispatcher — orchestrates the ADR-011 feedback pipeline.
 *
 * Composes three independent pure analyses (classify, resolveScope, resolveSurface)
 * and routes Global-scoped results to the appropriate adapter.
 *
 * Stateless. Framework-agnostic. No Vue, no components, no composables.
 *
 * @param {object} [options]
 * @param {object} [options.adapters] — registry of surface adapters, each exposing dispatch(result)
 * @returns {{ dispatch: (result: object) => any }}
 */
export function createPresentationDispatcher({ adapters = {} } = {}) {
  function dispatch(result) {
    const category = classify(result)
    const scope = resolvePresentationScope(result)

    if (scope !== PRESENTATION_SCOPE.GLOBAL) return

    const surface = resolveSurface(category)
    const adapter = adapters[surface]

    if (typeof adapter?.dispatch !== 'function') return

    return adapter.dispatch(result)
  }

  return Object.freeze({ dispatch })
}
