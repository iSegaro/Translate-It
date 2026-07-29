import { CONTENT_VIEW } from '../composables/usePdfViewerMode.js'
import { PANE_OWNER } from './paneOwner.js'

/**
 * Resolves which pane is the authoritative navigation target.
 *
 * Pure function — no refs, no DOM, no injected dependencies.
 *
 * @param {string} contentView — current content view value
 * @param {string} [explicitOwner] — optional explicit owner override
 * @returns {string} PANE_OWNER.ORIGINAL or PANE_OWNER.TRANSLATED
 */
export function resolveNavigationOwner(contentView, explicitOwner) {
  if (explicitOwner === PANE_OWNER.ORIGINAL || explicitOwner === PANE_OWNER.TRANSLATED) {
    return explicitOwner
  }

  return contentView === CONTENT_VIEW.TRANSLATION
    ? PANE_OWNER.TRANSLATED
    : PANE_OWNER.ORIGINAL
}
