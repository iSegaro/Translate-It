import { LOCAL_RESULTS } from './operationResults.js'

export const PRESENTATION_SCOPE = Object.freeze({
  GLOBAL: 'global',
  COMPONENT: 'component',
  ELEMENT: 'element'
})

/**
 * Result types that carry element-specific identifiers (pageNumber, blockId).
 * Scope is resolved to ELEMENT only if the type IS in this set AND the
 * identifiers are present. This prevents accidental extra fields on global
 * result types from silently changing scope.
 */
const ELEMENT_SCOPED_TYPES = Object.freeze(new Set([
  LOCAL_RESULTS.BLOCK_LOADING,
  LOCAL_RESULTS.BLOCK_ERROR,
  LOCAL_RESULTS.PAGE_OCR_COMPLETE
]))

const COMPONENT_SCOPED_TYPES = Object.freeze(new Set([
  LOCAL_RESULTS.PANE_EMPTY
]))

function hasElementIdentifier(result) {
  return Number.isFinite(result?.pageNumber) || typeof result?.blockId === 'string'
}

function isElementScoped(result) {
  return ELEMENT_SCOPED_TYPES.has(result?.type) && hasElementIdentifier(result)
}

function isComponentScoped(result) {
  return COMPONENT_SCOPED_TYPES.has(result?.type)
}

/**
 * Resolves where a result is meaningful.
 * Scope is independent of Semantic Classification.
 *
 * @param {object} result - Operation Result
 * @returns {string} Presentation Scope
 */
export function resolvePresentationScope(result) {
  if (isElementScoped(result)) return PRESENTATION_SCOPE.ELEMENT
  if (isComponentScoped(result)) return PRESENTATION_SCOPE.COMPONENT

  return PRESENTATION_SCOPE.GLOBAL
}
