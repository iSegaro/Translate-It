// src/core/content-scripts/IFrameContentScriptCore.js
// Lite infrastructure for iframe content scripts - No Vue/UI bloat

import { BaseContentScriptCore } from './BaseContentScriptCore.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';

/**
 * IFrameContentScriptCore - Specialized lite version for subframes.
 */
export function IFrameContentScriptCore() {
  const core = BaseContentScriptCore();

  core.registerCoreHandlers = function() {
    if (!this.messageHandler) return;

    this.messageHandler.registerHandler(MessageActions.SPA_NAVIGATION, async () => {
      const { FeatureManager } = await import('@/core/managers/content/FeatureManager.js');
      const featureManager = FeatureManager.getInstance();
      await featureManager.initialize();
      await featureManager.checkForUrlChange();
      return { success: true };
    });
  };

  // Iframe specific initialization
  core.initializeCritical = async function() {
    if (this.initialized) return true;
    if (this._criticalInitializationPromise) return this._criticalInitializationPromise;

    const initialization = (async () => {
      const success = await this.initializeBase();
      if (!success) return false;

      this.registerCoreHandlers();

      const { default: SettingsManager } = await import('@/shared/managers/SettingsManager.js');
      await SettingsManager.initialize();
      void SettingsManager.warmup();
      this.initialized = true;
      return true;
    })().catch(() => false);
    this._criticalInitializationPromise = initialization;
    return initialization.finally(() => {
      if (this._criticalInitializationPromise === initialization) {
        this._criticalInitializationPromise = null;
      }
    });
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
