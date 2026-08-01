import { toast } from 'vue-sonner'

import { createBannerAdapter } from './adapters/bannerAdapter.js'
import { createProgressAdapter } from './adapters/progressAdapter.js'
import { createToastAdapter } from './adapters/toastAdapter.js'

/**
 * Creates PDF presentation surfaces and their Dispatcher registry.
 *
 * This is the only bootstrap point coupled to concrete adapters and toast UI.
 *
 * @returns {{ adapters: object, banner: object, progress: object }}
 */
export function createPresentationSurfaces() {
  const progress = createProgressAdapter()
  const banner = createBannerAdapter()

  return Object.freeze({
    adapters: Object.freeze({
      toast: createToastAdapter({ toast }),
      banner,
      'progress-bar': progress
    }),
    banner,
    progress
  })
}
