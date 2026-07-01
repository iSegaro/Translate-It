/**
 * Navigation type definitions for PDF internal navigation.
 *
 * Defines the data models used across the navigation pipeline:
 *   Feature Layer (resolution) → Application Layer (scroll execution).
 *
 * This module is pure data — no business logic, no DOM access, no side effects.
 * All objects are frozen to prevent accidental mutation.
 */

// ===== Navigation Target Types (Discriminators) =====

/**
 * Discriminated union type for navigation targets.
 *
 * Each target kind represents a different PDF link action:
 *   - 'page':           Internal GoTo link (most common)
 *   - 'uri':            External URL link
 *   - 'external-file':  GoToR link (open another PDF)
 *   - 'action':         Named action (NextPage, PrevPage, etc.)
 *   - 'unsupported':    Unhandled action type
 *
 * @readonly
 * @enum {string}
 */
export const NavigationTargetType = Object.freeze({
  PAGE: 'page',
  URI: 'uri',
  EXTERNAL_FILE: 'external-file',
  ACTION: 'action',
  UNSUPPORTED: 'unsupported'
})

// ===== Named Action Types =====

/**
 * Built-in PDF named actions.
 *
 * These correspond to PDF specification named actions that
 * pdf.js exposes via annotation.action.
 *
 * @readonly
 * @enum {string}
 */
export const NamedActionType = Object.freeze({
  NEXT_PAGE: 'NextPage',
  PREV_PAGE: 'PrevPage',
  FIRST_PAGE: 'FirstPage',
  LAST_PAGE: 'LastPage'
})

// ===== Navigation Options =====

/**
 * Default navigation options.
 * @readonly
 */
export const DEFAULT_NAVIGATION_OPTIONS = Object.freeze({
  behavior: 'smooth',
  block: 'start'
})

// ===== Factory Functions =====

/**
 * Create a page navigation target (internal GoTo link).
 *
 * @param {object} params
 * @param {number} params.pageNumber - 1-based page number
 * @param {number} [params.top] - Y offset in PDF points from top of page
 * @param {number} [params.left] - X offset in PDF points from left of page
 * @param {number} [params.zoom] - Target zoom factor (null to preserve current)
 * @returns {PageTarget}
 */
export function createPageTarget({ pageNumber, top = null, left = null, zoom = null }) {
  return Object.freeze({
    type: NavigationTargetType.PAGE,
    pageNumber: Number(pageNumber) || 1,
    top: Number.isFinite(top) ? Number(top) : null,
    left: Number.isFinite(left) ? Number(left) : null,
    zoom: Number.isFinite(zoom) ? Number(zoom) : null
  })
}

/**
 * Create a URI navigation target (external URL link).
 *
 * @param {object} params
 * @param {string} params.url - The target URL
 * @param {boolean} [params.newWindow=true] - Open in new browser tab
 * @returns {UriTarget}
 */
export function createUriTarget({ url, newWindow = true }) {
  return Object.freeze({
    type: NavigationTargetType.URI,
    url: String(url || ''),
    newWindow: Boolean(newWindow)
  })
}

/**
 * Create an external file navigation target (GoToR link).
 *
 * @param {object} params
 * @param {string} params.fileName - Target PDF filename
 * @param {string|Array|null} [params.dest] - Destination within the target PDF
 * @param {number} [params.pageNumber] - Resolved page if same document
 * @returns {ExternalFileTarget}
 */
export function createExternalFileTarget({ fileName, dest = null, pageNumber = null }) {
  return Object.freeze({
    type: NavigationTargetType.EXTERNAL_FILE,
    fileName: String(fileName || ''),
    dest: dest || null,
    pageNumber: Number.isFinite(pageNumber) ? Number(pageNumber) : null
  })
}

/**
 * Create a named action navigation target.
 *
 * @param {object} params
 * @param {string} params.action - One of NamedActionType values
 * @returns {NamedActionTarget}
 */
export function createActionTarget({ action }) {
  return Object.freeze({
    type: NavigationTargetType.ACTION,
    action: String(action || '')
  })
}

/**
 * Create an unsupported navigation target.
 *
 * Used when a link action type is recognized but not yet handled.
 * Preserves the original data for future implementation.
 *
 * @param {object} params
 * @param {string} params.reason - Human-readable reason (e.g., 'javascript', 'launch')
 * @param {*} [params.originalDest] - Raw destination data from pdf.js
 * @returns {UnsupportedTarget}
 */
export function createUnsupportedTarget({ reason, originalDest = null }) {
  return Object.freeze({
    type: NavigationTargetType.UNSUPPORTED,
    reason: String(reason || 'unknown'),
    originalDest: originalDest ?? null
  })
}

// ===== Outline Node =====

/**
 * Create an outline node from pdf.js getOutline() data.
 *
 * @param {object} rawNode - Raw outline node from pdf.js
 * @returns {OutlineNode}
 */
export function createOutlineNode(rawNode) {
  if (!rawNode) return null

  return Object.freeze({
    title: String(rawNode.title || ''),
    bold: Boolean(rawNode.bold),
    italic: Boolean(rawNode.italic),
    color: rawNode.color instanceof Uint8ClampedArray
      ? rawNode.color
      : new Uint8ClampedArray(3),
    dest: rawNode.dest || null,
    url: rawNode.url || null,
    items: Array.isArray(rawNode.items)
      ? rawNode.items.map(createOutlineNode).filter(Boolean)
      : []
  })
}

// ===== Link Annotation =====

/**
 * Create a normalized link annotation from pdf.js getAnnotations() data.
 *
 * @param {object} rawAnnotation - Raw annotation data from pdf.js
 * @returns {LinkAnnotation}
 */
export function createLinkAnnotation(rawAnnotation) {
  if (!rawAnnotation) return null

  const rect = rawAnnotation.rect || [0, 0, 0, 0]

  return Object.freeze({
    id: String(rawAnnotation.id || ''),
    type: Number(rawAnnotation.annotationType) || 0,
    rect: Object.freeze({
      x: Number(rect[0]) || 0,
      y: Number(rect[1]) || 0,
      width: Number(rect[2] - rect[0]) || 0,
      height: Number(rect[3] - rect[1]) || 0
    }),
    dest: rawAnnotation.dest || null,
    url: rawAnnotation.url || null,
    unsafeUrl: rawAnnotation.unsafeUrl || null,
    action: rawAnnotation.action || null,
    newWindow: rawAnnotation.newWindow || false
  })
}

// ===== Destination Key Utility ================================

/**
 * Generate a stable string key for a navigation destination.
 *
 * PDF destinations may be strings (named destinations) or arrays
 * (explicit [page, ...] destinations). This function normalizes
 * either form into a unique string suitable for use as a Map key
 * or Set member.
 *
 * @param {string|Array|null} dest - The navigation destination
 * @returns {string} A stable string key
 */
export function destKey(dest) {
  if (!dest) return ''
  return typeof dest === 'string' ? dest : JSON.stringify(dest)
}
