import { shallowRef } from 'vue'
import { toast } from 'vue-sonner'

import { createBannerAdapter } from './adapters/bannerAdapter.js'
import { createProgressAdapter } from './adapters/progressAdapter.js'
import { createToastAdapter } from './adapters/toastAdapter.js'
import { createPresentationFacade } from './presentationFacade.js'

/**
 * Presentation Host — PDF presentation subsystem bootstrap.
 *
 * Owns surface adapters, facade wiring, and reactive adapter snapshots. PDF
 * features only emit Domain Results through `present` and read exposed state.
 *
 * @returns {{ present: (domainResult: object) => any, bannerState: import('vue').ShallowRef, progressState: import('vue').ShallowRef }}
 */
export function createPresentationHost() {
  const progressAdapter = createProgressAdapter()
  const bannerAdapter = createBannerAdapter()
  const progressState = shallowRef(progressAdapter.getState())
  const bannerState = shallowRef(bannerAdapter.getState())
  let progressVersion = progressState.value.version
  let bannerVersion = bannerState.value.version

  function synchronize(intent) {
    if (intent.intent === 'activity') {
      const state = progressAdapter.getState()
      if (state.version === progressVersion) return
      progressVersion = state.version
      progressState.value = state
      return
    }

    if (intent.intent === 'outcome') {
      const state = bannerAdapter.getState()
      if (state.version === bannerVersion) return
      bannerVersion = state.version
      bannerState.value = state
    }
  }

  const facade = createPresentationFacade({
    adapters: {
      toast: createToastAdapter({ toast }),
      banner: bannerAdapter,
      'progress-bar': progressAdapter
    },
    onPresented: synchronize
  })

  return Object.freeze({
    present: facade.present,
    bannerState,
    progressState
  })
}
