// src/providers/core/BaseTranslationProvider.js

import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { LanguageSwappingService } from "@/features/translation/providers/LanguageSwappingService.js";
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
import { TranslationMode } from "@/shared/config/config.js";
import { proxyManager } from "@/shared/proxy/ProxyManager.js";
import { ProviderRequestEngine } from "@/features/translation/providers/utils/ProviderRequestEngine.js";
import { TraditionalBatchProcessor } from "@/features/translation/providers/utils/TraditionalBatchProcessor.js";

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
      const { getSettingsAsync } = await import("@/shared/config/config.js");
      const settings = await getSettingsAsync();

      // Always set config - enabled or disabled
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

  // By default providers are considered "not reliably returning JSON-mode"
  static reliableJsonMode = false;
  static supportsDictionary = false;

  /**
   * Orchestrates the entire translation process.
   */
  async translate(text, sourceLang, targetLang, options) {
    const {
      mode: translateMode,
      originalSourceLang,
      originalTargetLang,
      messageId,
      engine,
    } = typeof options === 'object' && options !== null ? options : { mode: options };

    const abortController = (messageId && engine) ? engine.getAbortController(messageId) : null;

    if (this._isSameLanguage(sourceLang, targetLang)) return null;

    // 1. Set Field/Subtitle mode BEFORE language swapping
    if (translateMode === TranslationMode.Field || translateMode === TranslationMode.Subtitle) {
      sourceLang = AUTO_DETECT_VALUE;
    }

    // 2. Language swapping and normalization
    [sourceLang, targetLang] = await LanguageSwappingService.applyLanguageSwapping(
      text, sourceLang, targetLang, originalSourceLang, originalTargetLang,
      { providerName: this.providerName, useRegexFallback: true }
    );

    // 3. Convert to provider-specific language codes
    const sl = this._getLangCode(sourceLang);
    const tl = this._getLangCode(targetLang);

    if (sl === tl) return text;

    // 4. JSON Mode Detection
    let isJsonMode = false;
    let originalJsonStruct;
    let textsToTranslate = [text];

    try {
      const parsed = JSON.parse(text);
      if (this._isSpecificTextJsonFormat(parsed)) {
        isJsonMode = true;
        originalJsonStruct = parsed;
        textsToTranslate = originalJsonStruct.map((item) => item.text || '');
        logger.debug(`[${this.providerName}] JSON mode detected with ${textsToTranslate.length} segments.`);
      }
    } catch { /* Not JSON */ }

    // 5. Perform batch translation
    const priority = options?.priority || (await import("@/features/translation/core/RateLimitManager.js")).TranslationPriority.NORMAL;
    const translatedSegments = await this._batchTranslate(textsToTranslate, sl, tl, translateMode, engine, messageId, abortController, priority);

    // 6. Reconstruct the final output
    if (isJsonMode) {
      if (translatedSegments.length !== originalJsonStruct.length) {
        logger.error(`[${this.providerName}] JSON reconstruction failed due to segment mismatch.`);
        return translatedSegments.join('\n');
      }
      const translatedJson = originalJsonStruct.map((item, index) => ({
        ...item,
        text: translatedSegments[index] || "",
      }));
      return JSON.stringify(translatedJson, null, 2);
    } else {
      return translatedSegments[0];
    }
  }

  /**
   * Abstract methods to be implemented by subclasses
   */
  async _batchTranslate() { throw new Error(`_batchTranslate method must be implemented by ${this.constructor.name}`); }
  _getLangCode() { throw new Error(`_getLangCode method must be implemented by ${this.constructor.name}`); }

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
