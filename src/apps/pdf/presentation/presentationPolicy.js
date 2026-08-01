export const PRESENTATION_SURFACE = Object.freeze({
  TOAST: 'toast',
  BANNER: 'banner',
  PROGRESS_BAR: 'progress-bar'
})

const SURFACE_MAP = Object.freeze({
  acknowledgement: PRESENTATION_SURFACE.TOAST,
  outcome: PRESENTATION_SURFACE.BANNER,
  activity: PRESENTATION_SURFACE.PROGRESS_BAR
})

/**
 * Maps a Presentation Intent to a Presentation Surface.
 * Pure mapping. Never receives Scope. Never sees input data.
 *
 * @param {string} intent — 'acknowledgement' | 'outcome' | 'activity'
 * @returns {string} Presentation Surface
 */
export function resolveSurface(intent) {
  return SURFACE_MAP[intent] ?? PRESENTATION_SURFACE.TOAST
}
