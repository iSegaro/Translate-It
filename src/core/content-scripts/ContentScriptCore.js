// src/core/content-scripts/ContentScriptCore.js
// Main Frame Content Script Core - Includes Vue and full feature set

import { BaseContentScriptCore } from './BaseContentScriptCore.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';

export function ContentScriptCore() {
  // Inherit from Base Core
  const core = BaseContentScriptCore();

  // Add Main-frame specific properties
  core.vueLoaded = false;
  core.featuresLoaded = false;

  const originalInitializeMessaging = core.initializeMessaging;
  
  // Extend messaging to include core handlers
  core.initializeMessaging = async function() {
    await originalInitializeMessaging.call(this);
    if (this.messageHandler) {
      await this.registerCoreHandlers();
    }
  };

  core.registerCoreHandlers = async function() {
    this.messageHandler.registerHandler('contentScriptReady', async () => {
      return { ready: true, vueLoaded: this.vueLoaded, featuresLoaded: this.featuresLoaded };
    });

    this.messageHandler.registerHandler('loadVueApp', async () => {
      await this.loadVueApp();
      return { success: true };
    });

    this.messageHandler.registerHandler('loadFeatures', async () => {
      await this.loadFeatures();
      return { success: true };
    });

    this.messageHandler.registerHandler(MessageActions.SPA_NAVIGATION, async () => {
      const { FeatureManager } = await import('@/core/managers/content/FeatureManager.js');
      const featureManager = FeatureManager.getInstance();
      await featureManager.initialize();
      await featureManager.checkForUrlChange();
      return { success: true };
    });
  };

  /**
   * CRITICAL: Initialize method for Main Frame
   */
  core.initializeCritical = async function() {
    if (this.initialized) return true;
    if (this._criticalInitializationPromise) return this._criticalInitializationPromise;

    const initialization = (async () => {
      const success = await this.initializeBase();
      if (!success) return false;

      // Pre-warm settings and DebugMode (Main frame specific)
      const { default: SettingsManager } = await import('@/shared/managers/SettingsManager.js');
      await SettingsManager.initialize();
      void SettingsManager.warmup();

      const { debugModeBridge } = await import('@/shared/logging/DebugModeBridge.js');
      await debugModeBridge.initialize();

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

  // --- VUE LOADING (Heavy) ---
  core.loadVueApp = async function() {
    if (this.vueLoaded) return;
    try {
      const { loadVueApp } = await import('./chunks/lazy-vue-app.js');
      await loadVueApp(this);
      this.vueLoaded = true;
      this.dispatchEvent(new CustomEvent('vue-loaded'));
    } catch {
      // Fallback
      const { initializeLegacyHandlers } = await import('./legacy-handlers.js');
      await initializeLegacyHandlers(this);
    }
  };

  core.loadFeatures = async function() {
    if (this.featuresLoaded) return;
    try {
      const { loadCoreFeatures } = await import('./chunks/lazy-features.js');
      await loadCoreFeatures();
      
      // We don't mark as fully loaded here to allow other features 
      // to continue loading on-demand via InteractionCoordinator
      this.featuresLoaded = true;
      this.dispatchEvent(new CustomEvent('features-loaded'));
    } catch {
      const { FeatureManager } = await import('@/core/managers/content/FeatureManager.js');
      await FeatureManager.getInstance().initialize();
    }
  };

  core.loadFeature = async function(featureName) {
    const { loadFeatureOnDemand } = await import('./chunks/lazy-features.js');
    return await loadFeatureOnDemand(featureName);
  };

  core.injectMainDOMStyles = function(css, id = 'translate-it-main-dom-styles') {
    this.injectStyles(css, id);
  };

  // Compatibility
  core.initialize = core.initializeCritical;

  return core;
}

export default ContentScriptCore;
