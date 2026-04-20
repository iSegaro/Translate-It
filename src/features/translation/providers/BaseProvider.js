// src/providers/core/BaseTranslationProvider.js

import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { proxyManager } from "@/shared/proxy/ProxyManager.js";
import { ProviderRequestEngine } from "@/features/translation/providers/utils/ProviderRequestEngine.js";
import { TraditionalBatchProcessor } from "@/features/translation/providers/utils/TraditionalBatchProcessor.js";
import { providerCoordinator } from "@/features/translation/core/ProviderCoordinator.js";
import { getSettingsAsync } from "@/shared/config/config.js";

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'BaseProvider');

/**
 * Base class for all translation providers.
 * Provides a centralized translation workflow, error handling, and common utilities.
 */
export class BaseProvider {
  constructor(providerName) {
    this.providerName = providerName;
    this.sessionContext = null;
    this.providerSettingKey = null; // To be set by subclasses that use API keys
    this._initializeProxy();
  }

  /**
   * Initialize proxy configuration from settings
   * @private
   */
  async _initializeProxy() {
    try {
      const settings = await getSettingsAsync();

      proxyManager.setConfig({
        enabled: settings.PROXY_ENABLED || false,
        type: settings.PROXY_TYPE || 'http',
        host: settings.PROXY_HOST || '',
        port: settings.PROXY_PORT || 8080,
        auth: {
          username: settings.PROXY_USERNAME || '',
          password: settings.PROXY_PASSWORD || ''
        }
      });
    } catch (error) {
      logger.warn(`[${this.providerName}] Failed to initialize proxy:`, error);
    }
  }

  // Provider capabilities
  static reliableJsonMode = false;
  static supportsDictionary = false;

  /**
   * Entry point for translation.
   * Now delegated to ProviderCoordinator for better separation of concerns.
   */
  async translate(text, sourceLang, targetLang, options) {
    return providerCoordinator.execute(this, text, sourceLang, targetLang, options);
  }

  /**
   * Abstract methods to be implemented by subclasses.
   * Subclasses should implement either _batchTranslate or specialized single calls.
   */
  async _batchTranslate() { 
    throw new Error(`_batchTranslate method must be implemented by ${this.constructor.name}`); 
  }
  
  _getLangCode() { 
    throw new Error(`_getLangCode method must be implemented by ${this.constructor.name}`); 
  }

  /**
   * Helper to check JSON format
   */
  _isSpecificTextJsonFormat(obj) {
    return (
      Array.isArray(obj) &&
      obj.length > 0 &&
      obj.every(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          typeof item.text === "string"
      )
    );
  }

  /**
   * Abstract method for image translation
   */
  async translateImage() {
    throw new Error(`translateImage method not supported by ${this.constructor.name}`);
  }

  /**
   * UNIFIED API REQUEST HANDLER - Delegated to ProviderRequestEngine
   */
  async _executeRequest(params) {
    return ProviderRequestEngine.executeRequest(this, params);
  }

  /**
   * EXECUTE WITH RATE LIMITING - Throttles calls via RateLimitManager
   * @protected
   */
  async _executeWithRateLimit(task, context = "", priority = null, options = {}) {
    const { rateLimitManager, TranslationPriority } = await import("@/features/translation/core/RateLimitManager.js");
    const targetPriority = priority || TranslationPriority.NORMAL;
    
    // Pre-check
    if (options.abortController?.signal?.aborted) {
      throw new Error('Task aborted before execution');
    }

    const result = await rateLimitManager.executeWithRateLimit(
      this.providerName,
      task,
      context,
      targetPriority,
      options
    );

    // Post-check
    if (options.abortController?.signal?.aborted) {
      throw new Error('Task aborted during execution');
    }

    return result;
  }

  /**
   * API CALL EXECUTION - Delegated to ProviderRequestEngine
   */
  async _executeApiCall(params) {
    return ProviderRequestEngine.executeApiCall(this, params);
  }

  /**
   * Validates required configuration for the provider
   */
  _validateConfig(config, requiredFields, context) {
    for (const field of requiredFields) {
      if (!config[field]) {
        const errorType = field.toLowerCase().includes('key')
          ? ErrorTypes.API_KEY_MISSING
          : field.toLowerCase().includes('url')
          ? ErrorTypes.API_URL_MISSING
          : field.toLowerCase().includes('model')
          ? ErrorTypes.MODEL_MISSING
          : ErrorTypes.API;

        const err = new Error(errorType);
        err.type = errorType;
        err.context = context;
        err.providerName = this.providerName;
        throw err;
      }
    }
  }

  /**
   * Session context management
   */
  storeSessionContext(ctx) { this.sessionContext = { ...ctx, timestamp: Date.now() }; }
  resetSessionContext() { this.sessionContext = null; }
  shouldResetSession() { return this.sessionContext && Date.now() - this.sessionContext.lastUsed > 300000; }

  /**
   * Check if source and target languages are the same
   */
  _isSameLanguage(sourceLang, targetLang) { return sourceLang === targetLang; }

  /**
   * Test proxy connection
   */
  async testProxyConnection(testUrl) {
    try {
      await this._initializeProxy();
      return await proxyManager.testConnection(testUrl);
    } catch (error) {
      logger.error(`[${this.providerName}] Proxy test failed:`, error);
      return false;
    }
  }

  /**
   * Processes segments in batches - Delegated to TraditionalBatchProcessor
   */
  async _processInBatches(segments, translateChunk, limits, abortController = null, priority = null) {
    return TraditionalBatchProcessor.processInBatches(this, segments, translateChunk, limits, abortController, priority);
  }
}
