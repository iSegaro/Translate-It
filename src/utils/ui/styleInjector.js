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
export function injectStylesToShadowRoot(stylesData, styleId) {
  if (!stylesData) return;

  try {
    let css = '';
    
    // Support both single strings and Vite glob objects
    if (typeof stylesData === 'string') {
      css = stylesData;
    } else {
      // Support glob imports (either object of modules or array of strings/modules)
      const values = Array.isArray(stylesData) ? stylesData : Object.values(stylesData);
      css = values.map(val => (typeof val === 'string' ? val : val.default || '')).join('\n');
    }

    if (!css.trim()) return;

    const isTopFrame = window === window.top;
    const hostId = isTopFrame ? 'translate-it-host-main' : 'translate-it-host-iframe';
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
