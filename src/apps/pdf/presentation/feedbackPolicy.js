import { SEMANTIC_CATEGORY } from './semanticClassification.js'

export const PRESENTATION_SURFACE = Object.freeze({
  TOAST: 'toast',
  BANNER: 'banner',
  PROGRESS_BAR: 'progress-bar'
})

const SURFACE_MAP = Object.freeze({
  [SEMANTIC_CATEGORY.ACKNOWLEDGEMENT]: PRESENTATION_SURFACE.TOAST,
  [SEMANTIC_CATEGORY.PERSISTENT_INFORMATION]: PRESENTATION_SURFACE.BANNER,
  [SEMANTIC_CATEGORY.PROGRESS]: PRESENTATION_SURFACE.PROGRESS_BAR
})

/**
 * Maps a Semantic Category to a Presentation Surface.
 * Pure mapping. Never receives Scope. Never sees Operation Results.
 *
 * @param {string} category - from SEMANTIC_CATEGORY
 * @returns {string} Presentation Surface
 */
export function resolveSurface(category) {
  return SURFACE_MAP[category] ?? PRESENTATION_SURFACE.TOAST
}
