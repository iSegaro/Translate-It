/**
 * Select Element-only Shadow DOM helpers.
 * These helpers intentionally do not alter global event or DOM traversal APIs.
 */

const isElement = (value) => value?.nodeType === Node.ELEMENT_NODE;

// Phase 1 keeps shadow translation disabled until mutation/revert support lands.
export const SELECT_ELEMENT_SHADOW_DOM_ENABLED = false;

/**
 * Return composed-path elements from deepest to shallowest.
 * @param {Event|null} event
 * @returns {Element[]}
 */
export function getSelectEventElements(event) {
  const path = typeof event?.composedPath === 'function'
    ? event.composedPath()
    : [event?.target];

  return path.filter(isElement);
}

/**
 * Resolve the deepest page element visible through an event's composed path.
 * Closed roots naturally expose only their retargeted host.
 * @param {Event|null} event
 * @param {(element: Element) => boolean} [isExcluded]
 * @param {Object} [options]
 * @param {boolean} [options.allowShadowDom=true]
 * @returns {Element|null}
 */
export function resolveSelectInteractionElement(event, isExcluded = () => false, options = {}) {
  const elements = getSelectEventElements(event);
  if (elements.some(isExcluded)) return null;
  if (options.allowShadowDom === false) {
    return isElement(event?.target) && !isExcluded(event.target) ? event.target : null;
  }
  if (elements.length > 0) return elements[0];
  return isElement(event?.target) && !isExcluded(event.target) ? event.target : null;
}

/**
 * Iterate element ancestry while crossing available open ShadowRoot boundaries.
 * @param {Node|null} start
 * @returns {Generator<Element>}
 */
export function* iterateSelectElementAncestors(start) {
  const seen = new Set();
  let current = isElement(start) ? start : start?.parentElement || null;

  while (current && !seen.has(current)) {
    seen.add(current);
    yield current;

    if (current.parentElement) {
      current = current.parentElement;
      continue;
    }

    const root = current.getRootNode?.();
    current = root?.host || null;
  }
}

/**
 * Return true when node belongs to a ShadowRoot rather than document light DOM.
 * @param {Node|null} node
 * @returns {boolean}
 */
export function isSelectShadowNode(node) {
  return Boolean(node?.getRootNode?.()?.host);
}
