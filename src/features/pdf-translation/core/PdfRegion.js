/**
 * Create an immutable region in canonical PDF user space.
 *
 * @param {object} params
 * @param {number} params.pageNumber
 * @param {number} params.left
 * @param {number} params.top
 * @param {number} params.right
 * @param {number} params.bottom
 * @returns {Readonly<object>|null}
 */
export function createPdfRegion({ pageNumber, left, top, right, bottom } = {}) {
  if (!Number.isInteger(pageNumber) || pageNumber <= 0) return null
  if (![left, top, right, bottom].every(Number.isFinite)) return null
  if (left >= right || bottom >= top) return null

  return Object.freeze({ pageNumber, left, top, right, bottom })
}
