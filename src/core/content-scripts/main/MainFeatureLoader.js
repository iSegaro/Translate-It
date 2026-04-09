/**
 * MainFeatureLoader.js
 * Manages the prioritized and intelligent loading of extension features.
 */
export class MainFeatureLoader {
  constructor(contentScriptCore, initializeLogger) {
    this.contentScriptCore = contentScriptCore;
    this.initializeLogger = initializeLogger;
    this.featureLoadPromises = new Map();

    // Smart loading configuration
    this.LOAD_STRATEGIES = {
      CRITICAL: { delay: 0, priority: 'high' },
      ESSENTIAL: { delay: 500, priority: 'medium' },
      ON_DEMAND: { delay: 2000, priority: 'low' },
      INTERACTIVE: { delay: 0, priority: 'medium' }
    };

    // Feature categorization
    this.FEATURE_CATEGORIES = {
      CRITICAL: ['messaging', 'extensionContext'], // Core infrastructure
      ESSENTIAL: ['textSelection', 'contentMessageHandler', 'vue'], // Immediate UI (FAB) & Detection
      INTERACTIVE: ['windowsManager', 'selectElement', 'pageTranslation'], // On-demand heavy UI
      ON_DEMAND: ['shortcut', 'textFieldIcon'] // Optional features
    };
  }

  /**
   * Starts the multi-stage intelligent loading sequence.
   */
  async startIntelligentLoading() {
    // Stage 1: Critical features (immediate)
    await Promise.all(
      this.FEATURE_CATEGORIES.CRITICAL.map(feature =>
        this.loadFeature(feature, 'CRITICAL')
      )
    );

    // Stage 2: Essential features (short delay)
    setTimeout(() => {
      Promise.all(
        this.FEATURE_CATEGORIES.ESSENTIAL.map(feature =>
          this.loadFeature(feature, 'ESSENTIAL')
        )
      );
    }, this.LOAD_STRATEGIES.ESSENTIAL.delay);

    // Stage 3: On-demand preloading (longer delay)
    setTimeout(() => {
      // Logic for preloading optional features could go here
    }, this.LOAD_STRATEGIES.ON_DEMAND.delay);
  }

  /**
   * Loads a specific feature with a given strategy.
   * @param {string} featureName - Name of the feature to load.
   * @param {string} category - Category defining the loading strategy.
   */
  async loadFeature(featureName, category) {
    if (this.featureLoadPromises.has(featureName)) {
      return this.featureLoadPromises.get(featureName);
    }

    const strategy = this.LOAD_STRATEGIES[category] || { delay: 0 };
    
    const loadPromise = (async () => {
      try {
        // Apply strategic delay if necessary
        if (strategy.delay > 0 && category !== 'INTERACTIVE') {
          await new Promise(resolve => setTimeout(resolve, strategy.delay));
        }

        if (this.contentScriptCore && this.contentScriptCore.loadFeature) {
          await this.contentScriptCore.loadFeature(featureName);

          if (process.env.NODE_ENV === 'development') {
            const featureLogger = await this.initializeLogger();
            featureLogger.debug(`[MainFeatureLoader] Loaded feature: ${featureName} (${category})`);
          }
        }
      } catch (error) {
        await this.handleLoadingError(featureName, category, error);
      }
    })();

    this.featureLoadPromises.set(featureName, loadPromise);
    return loadPromise;
  }

  /**
   * Handles errors that occur during feature loading.
   */
  async handleLoadingError(featureName, category, error) {
    try {
      const { ErrorHandler } = await import('@/shared/error-management/ErrorHandler.js');
      if (ErrorHandler) {
        const errorHandler = ErrorHandler.getInstance();
        await errorHandler.handle(error, {
          context: `feature-loading-${featureName}`,
          isSilent: true,
          showToast: false
        });
      }
    } catch (e) {
      // Fallback if ErrorHandler itself is not available
    }

    const errorLogger = await this.initializeLogger();
    errorLogger.warn(`[MainFeatureLoader] Failed to load feature ${featureName}`, {
      error: error.message || error,
      category,
      stack: error.stack
    });
  }
}
