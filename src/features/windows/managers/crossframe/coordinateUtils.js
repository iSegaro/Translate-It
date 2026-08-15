// src/features/windows/managers/crossframe/coordinateUtils.js
// Shared coordinate adjustment for cross-frame translation window routing.

/**
 * Adjust a position produced in a direct child iframe's viewport so it becomes
 * relative to the current frame's viewport.
 *
 * Matches the sender via WindowProxy equality (cross-origin safe), then adds the
 * child iframe's getBoundingClientRect() offset exactly once. Viewport-relative
 * semantics are preserved; the current frame's scroll is never added here.
 *
 * @param {Window} sourceWindow - The window that posted the message (event.source).
 * @param {Object} position - Viewport-relative position in the child frame.
 * @returns {Object|null} Adjusted position, or null when sourceWindow is not a
 *   direct child iframe of the current document.
 */
export function adjustForDirectChild(sourceWindow, position) {
  const frames = document.querySelectorAll('iframe');

  let matchedIframe = null;
  for (const frame of frames) {
    try {
      if (frame.contentWindow === sourceWindow) {
        matchedIframe = frame;
        break;
      }
    } catch {
      // Cross-origin: skip frames whose window cannot be compared.
    }
  }

  if (!matchedIframe) return null;

  const iframeRect = matchedIframe.getBoundingClientRect();

  return {
    ...position,
    x: position.x + iframeRect.left,
    y: position.y + iframeRect.top,
    _isViewportRelative: true,
    _isAbsolute: false
  };
}
