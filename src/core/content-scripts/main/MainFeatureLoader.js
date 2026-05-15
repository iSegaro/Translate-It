/**
 * MainFeatureLoader.js
 * Manages the prioritized and intelligent loading of extension features.
 */
export class MainFeatureLoader {
  constructor(contentScriptCore, initializeLogger) {
    this.contentScriptCore = contentScriptCore;
    this.initializeLogger = initializeLogger;
    this.featureLoadPromises = new Map();
    this.logger = null;

    // Smart loading configuration
    this.LOAD_STRATEGIES = {
      CRITICAL: { delay: 0, priority: 'high' },
      ESSENTIAL: { delay: 400, priority: 'medium' },
      LAZY_UI: { delay: 2500, priority: 'low' },
      ON_DEMAND: { delay: 4000, priority: 'low' },
      INTERACTIVE: { delay: 0, priority: 'high' }
    };

    // Feature categorization
    this.FEATURE_CATEGORIES = {
      CRITICAL: ['messaging', 'extensionContext'], // Core infrastructure
      ESSENTIAL: ['contentMessageHandler'], // Essential communication
      LAZY_UI: ['vue', 'textSelection', 'mouseHover'], // UI & Selection (can be promoted)
      INTERACTIVE: ['windowsManager', 'selectElement', 'pageTranslation', 'screenCapture'], // On-demand heavy UI
      ON_DEMAND: ['shortcut', 'textFieldIcon'] // Optional features
    };
  }

  /**
   * Lazy load the logger instance.
   * Note: This logger uses the 'Content' component level (LOG_COMPONENTS.CONTENT).
   * To see these logs, ensure the 'Content' log level is set to INFO (2) or higher in Options.
   */
  async getLogger() {
    if (this.logger) return this.logger;
    try {
      this.logger = await this.initializeLogger('MainFeatureLoader');
      return this.logger;
    } catch {
      return console;
    }
  }

  /**
   * Promotes a feature to load immediately.
   */
  async promoteFeature(featureName) {
    if (process.env.NODE_ENV === 'development') {
      const logger = await this.getLogger();
      logger.debug(`Promoting feature: ${featureName}`);
    }
    return this.loadFeature(featureName, 'INTERACTIVE');
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

    // Stage 3: Lazy UI & Stage 4: On-demand (Using Idle Deadline)
    const scheduleIdleTask = (category, delay) => {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(() => {
          Promise.all(
            this.FEATURE_CATEGORIES[category].map(feature =>
              this.loadFeature(feature, category)
            )
          );
        }, { timeout: delay + 2000 }); // Backup timeout
      } else {
        setTimeout(() => {
          Promise.all(
            this.FEATURE_CATEGORIES[category].map(feature =>
              this.loadFeature(feature, category)
            )
          );
        }, delay);
      }
    };

    scheduleIdleTask('LAZY_UI', this.LOAD_STRATEGIES.LAZY_UI.delay);
    scheduleIdleTask('ON_DEMAND', this.LOAD_STRATEGIES.ON_DEMAND.delay);
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
          const logger = await this.getLogger();
          logger.info(`Loading feature: ${featureName} (${category})`);
          await this.contentScriptCore.loadFeature(featureName);

          if (process.env.NODE_ENV === 'development') {
            logger.debug(`Loaded feature: ${featureName} (${category})`);
          }
          logger.info(`Successfully loaded feature: ${featureName}`);
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
    } catch { /* ignore */ }

    const errorLogger = await this.getLogger();
    errorLogger.warn(`Failed to load feature ${featureName}`, {
      error: error.message || error,
      category,
      stack: error.stack
    });
  }
}
