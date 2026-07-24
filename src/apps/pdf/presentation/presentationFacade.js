import { createPresentationDispatcher } from './presentationDispatcher.js'
import { present as createPresentationIntent } from './presentationPresenter.js'

/**
 * Presentation Facade — sole entry point from PDF features into presentation.
 *
 * Converts Domain Results to Presentation Intents, then dispatches them to the
 * configured surface adapters. Callers never orchestrate pipeline stages.
 *
 * @param {object} [options]
 * @param {object} [options.adapters] surface adapter registry
 * @param {(intent: object) => void} [options.onPresented] post-dispatch observer
 * @returns {{ present: (domainResult: object) => any }}
 */
export function createPresentationFacade({ adapters, onPresented } = {}) {
  const dispatcher = createPresentationDispatcher({ adapters })

  function present(domainResult) {
    const intent = createPresentationIntent(domainResult)
    if (!intent) return

    const result = dispatcher.dispatch(intent)
    onPresented?.(intent)
    return result
  }

  return Object.freeze({ present })
}
