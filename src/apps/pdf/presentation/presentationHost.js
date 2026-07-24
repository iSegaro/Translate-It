import { shallowRef } from 'vue'

import { createPresentationFacade } from './presentationFacade.js'

/**
 * Presentation Host — PDF presentation subsystem bootstrap.
 *
 * Owns facade wiring and reactive surface snapshots. PDF features only emit
 * Domain Results through `present` and read exposed state.
 *
 * @returns {{ present: (domainResult: object) => any, bannerState: import('vue').ShallowRef, progressState: import('vue').ShallowRef }}
 */
export function createPresentationHost({ surfaces } = {}) {
  const progressState = shallowRef(surfaces.progress.getState())
  const bannerState = shallowRef(surfaces.banner.getState())
  let progressVersion = progressState.value.version
  let bannerVersion = bannerState.value.version

  function synchronize(intent) {
    if (intent.intent === 'activity') {
      const state = surfaces.progress.getState()
      if (state.version === progressVersion) return
      progressVersion = state.version
      progressState.value = state
      return
    }

    if (intent.intent === 'outcome') {
      const state = surfaces.banner.getState()
      if (state.version === bannerVersion) return
      bannerVersion = state.version
      bannerState.value = state
    }
  }

  const facade = createPresentationFacade({
    adapters: surfaces.adapters,
    onPresented: synchronize
  })

  return Object.freeze({
    present: facade.present,
    bannerState,
    progressState
  })
}
