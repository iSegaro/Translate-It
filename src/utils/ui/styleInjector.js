// src/utils/ui/styleInjector.js
/**
 * Utility to lazily inject styles into the extension's Shadow Root.
 * Used by features like FAB and Mobile Sheet to manage their own CSS lifecycle.
 */

/**
 * Injects a string of CSS into the UI Host's Shadow Root.
 * @param {string} css - The CSS content to inject.
 * @param {string} styleId - Unique ID for the style tag to prevent duplicates.
 */
export function injectStylesToShadowRoot(css, styleId) {
  if (!css) return;

  try {
    const isTopFrame = window === window.top;
    const hostId = isTopFrame ? 'translate-it-ui-main' : 'translate-it-ui-iframe';
    const host = document.getElementById(hostId);
    
    if (host?.shadowRoot && !host.shadowRoot.getElementById(styleId)) {
      const styleElement = document.createElement('style');
      styleElement.id = styleId;
      styleElement.textContent = css;
      host.shadowRoot.appendChild(styleElement);
      return true;
    }
  } catch (error) {
    console.warn(`[StyleInjector] Failed to inject ${styleId}:`, error);
  }
  return false;
}
