// src/core/content-scripts/IFrameContentScriptCore.js
// Lite infrastructure for iframe content scripts - No Vue/UI bloat

import { BaseContentScriptCore } from './BaseContentScriptCore.js';

/**
 * IFrameContentScriptCore - Specialized lite version for subframes.
 */
export function IFrameContentScriptCore() {
  const core = BaseContentScriptCore();

  // Iframe specific initialization
  core.initializeCritical = async function() {
    const success = await this.initializeBase();
    if (!success) return false;

    try {
      const { default: SettingsManager } = await import('@/shared/managers/SettingsManager.js');
      await SettingsManager.initialize();
      void SettingsManager.warmup();
      return true;
    } catch {
      return false;
    }
  };

  core.loadFeature = async function(featureName) {
    // Dynamically load feature only when requested
    const { loadFeatureOnDemand } = await import('./chunks/lazy-features.js');
    return await loadFeatureOnDemand(featureName);
  };

  core.injectMainDOMStyles = function(css, id = 'translate-it-main-dom-styles') {
    if (css && id) {
      this.injectStyles(css, id);
      return;
    }
    
    // Fallback for default lite styles
    const liteCss = `
      :root { --translate-highlight-color: #ff8800; }
      .translate-it-element-highlighted { outline: 3px solid var(--translate-highlight-color) !important; }
    `;
    this.injectStyles(liteCss, 'translate-it-main-dom-styles');
  };

  // Compatibility
  core.initialize = core.initializeCritical;
  core.vueLoaded = false;

  return core;
}

export default IFrameContentScriptCore;
