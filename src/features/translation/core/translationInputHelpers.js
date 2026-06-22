/**
 * Translation input helpers.
 *
 * The translation system accepts two input shapes:
 *   - string: normal text modes (popup, selection, sidepanel, etc.)
 *   - array:  structured batch modes (PDF, Select_Element with rawJsonPayload)
 *
 * These helpers provide safe, consistent operations across both shapes
 * without assuming one or the other.
 */

/**
 * Check if translation input is empty.
 * @param {*} input - string or array
 * @returns {boolean}
 */
export function isEmptyTranslationInput(input) {
  if (!input) return true
  if (typeof input === 'string') return input.trim().length === 0
  if (Array.isArray(input)) return input.length === 0
  return true
}

/**
 * Get a short string preview of translation input for logging/IDs.
 * @param {*} input - string or array
 * @param {number} [maxLength=50] - max preview length
 * @returns {string}
 */
export function getTranslationInputPreview(input, maxLength = 50) {
  if (typeof input === 'string') return input.substring(0, maxLength)
  if (Array.isArray(input)) return `[batch:${input.length}]`
  return ''
}

/**
 * Get the "size" of translation input.
 * For strings: character count.
 * For arrays: item count.
 * @param {*} input - string or array
 * @returns {number}
 */
export function getTranslationInputLength(input) {
  if (typeof input === 'string') return input.length
  if (Array.isArray(input)) return input.length
  return 0
}

/**
 * Check if input is a structured batch (array).
 * @param {*} input
 * @returns {boolean}
 */
export function isStructuredBatchInput(input) {
  return Array.isArray(input)
}
