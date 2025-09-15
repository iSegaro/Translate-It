// src/utils/providerHtmlGenerator.js
import { getSupportedProviders } from "../core/provider-registry.js";

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.UTILS, 'providerHtmlGenerator');


// Helper function to get provider by ID
const getProviderById = (providerId) => {
  const providers = getSupportedProviders();
  return providers.find((provider) => provider.id === providerId);
};

/**
 * Utility class for generating HTML elements for translation providers
 */
export class ProviderHtmlGenerator {
  /**
   * Generate options HTML for settings page
   * @param {Array} [providers] - Provider list (defaults to available providers)
   * @returns {string} HTML string for option elements
   */
  static generateOptionsHtml(providers = null) {
    const availableProviders = providers || getSupportedProviders();
  logger.debug(`Generating options HTML for ${availableProviders.length} providers`);

    return availableProviders
      .map((provider) => {
        const title = provider.requirements
          ? provider.requirements.browsers.length < 4
            ? `${provider.name} (${provider.requirements.browsers.join(", ")})`
            : provider.name
          : provider.name;

        return `<option value="${provider.id}" title="${provider.description}">${title}</option>`;
      })
      .join("\n                  ");
  }

  /**
   * Generate dropdown HTML for popup/sidepanel
   * @param {Array} [providers] - Provider list (defaults to available providers)
   * @returns {string} HTML string for dropdown items
   */
  static generateDropdownHtml(providers = null) {
    const availableProviders = providers || getSupportedProviders();
  logger.debug(`Generating dropdown HTML for ${availableProviders.length} providers`);

    return availableProviders
      .map((provider) => {
        const statusClass = this._getProviderStatusClass(provider);
        const statusIcon = this._getProviderStatusIcon(provider);

        return `
        <div class="dropdown-item ${statusClass}" data-provider="${provider.id}" title="${provider.description}">
          <img src="@/icons/${provider.icon}" alt="${provider.name}" class="provider-icon">
          <span class="provider-name">${provider.name}</span>
          ${statusIcon}
        </div>`.trim();
      })
      .join("\n        ");
  }

  /**
   * Generate provider array for JavaScript use
   * @param {Array} [providers] - Provider list (defaults to available providers)
   * @returns {Array} Provider objects for JavaScript use
   */
  static generateProviderArray(providers = null) {
    const availableProviders = providers || getSupportedProviders();

    return availableProviders.map((provider) => ({
      id: provider.id,
      name: provider.name,
      icon: provider.icon,
      description: provider.description,
      needsApiKey: provider.needsApiKey,
      category: provider.category,
    }));
  }

  /**
   * Generate API settings section HTML for options page
   * @param {string} providerId - Provider ID
   * @returns {string} HTML string for provider settings section
   */
  static generateProviderSettingsHtml(providerId) {
    const provider = getProviderById(providerId);
    if (!provider) {
      return "";
    }

    switch (providerId) {
      case "google":
        return this._generateGoogleSettingsHtml(provider);
      case "bing":
        return this._generateBingSettingsHtml(provider);
      case "yandex":
        return this._generateYandexSettingsHtml(provider);
      case "browserapi":
        return this._generatebrowserApiSettingsHtml(provider);
      case "gemini":
        return this._generateGeminiSettingsHtml(provider);
      case "openai":
        return this._generateOpenAISettingsHtml(provider);
      case "openrouter":
        return this._generateOpenRouterSettingsHtml(provider);
      case "deepseek":
        return this._generateDeepSeekSettingsHtml(provider);
      case "webai":
        return this._generateWebAISettingsHtml(provider);
      case "custom":
        return this._generateCustomSettingsHtml(provider);
      default:
        return "";
    }
  }

  /**
   * Get provider status class for styling
   * @private
   * @param {Object} provider - Provider object
   * @returns {string} CSS class name
   */
  static _getProviderStatusClass(provider) {
    if (provider.features && provider.features.length > 0) {
      // For browser provider, check if available
      if (provider.id === "browser") {
        return "provider-limited"; // Simplified check
      }
      return "provider-available";
    }
    return "provider-available";
  }

  /**
   * Get provider status icon
   * @private
   * @param {Object} provider - Provider object
   * @returns {string} HTML for status icon
   */
  static _getProviderStatusIcon(provider) {
    if (provider.id === "browser") {
      // Simplified availability check for browser provider
      return '<span class="provider-status" title="Requires Chrome 138+">⚠️</span>';
    }

    if (provider.category === "free") {
      return '<span class="provider-status" title="Free service">🆓</span>';
    } else if (provider.needsApiKey) {
      return '<span class="provider-status" title="Requires API key">🔑</span>';
    }

    return "";
  }

  /**
   * Generate Google Translate settings HTML
   * @private
   */
  static _generateGoogleSettingsHtml(provider) {
    return `
      <div id="googleApiSettingsInfo" style="display: none">
        <h3 data-i18n="google_translate_settings_title">Google Translate</h3>
        <div class="setting-group api-key-info">
          <span class="setting-description" data-i18n="google_translate_description">
            ${provider.description}
          </span>
        </div>
      </div>`;
  }

  /**
   * Generate Bing Translate settings HTML
   * @private
   */
  static _generateBingSettingsHtml(provider) {
    return `
      <div id="bingApiSettingsInfo" style="display: none">
        <h3 data-i18n="bing_translate_settings_title">Microsoft Bing Translate</h3>
        <div class="setting-group api-key-info">
          <span class="setting-description" data-i18n="bing_translate_description">
            ${provider.description}
          </span>
        </div>
      </div>`;
  }

  /**
   * Generate Yandex Translate settings HTML
   * @private
   */
  static _generateYandexSettingsHtml(provider) {
    return `
      <div id="yandexApiSettingsInfo" style="display: none">
        <h3 data-i18n="yandex_translate_settings_title">Yandex Translate</h3>
        <div class="setting-group api-key-info">
          <span class="setting-description" data-i18n="yandex_translate_description">
            ${provider.description}
          </span>
        </div>
      </div>`;
  }

  /**
   * Generate browser API settings HTML
   * @private
   */
  static _generatebrowserApiSettingsHtml(provider) {
    return `
      <div id="browserApiSettingsInfo" style="display: none">
        <h3 data-i18n="browser_api_settings_title">browser Translation API</h3>
        <div class="setting-group api-key-info">
          <span class="setting-description" data-i18n="browser_api_description">
            ${provider.description}
          </span>
          <div class="browser-api-requirements">
            <p><strong data-i18n="browser_api_requirements">Requirements:</strong></p>
            <ul>
              <li data-i18n="browser_api_requirements_chrome">Chrome ${provider.requirements.minVersion}+ (Desktop only)</li>
              <li data-i18n="browser_api_requirements_gpu">GPU with 4GB+ VRAM</li>
              <li data-i18n="browser_api_requirements_storage">22GB free storage space</li>
              <li data-i18n="browser_api_requirements_internet">Unmetered network connection for initial download</li>
            </ul>
          </div>
        </div>
      </div>`;
  }

  /**
   * Generate other provider settings HTML (keeping existing structure)
   * @private
   */
  static _generateGeminiSettingsHtml() {
    // Return existing Gemini settings HTML structure
    return `<div id="geminiApiSettings"><!-- Existing Gemini HTML --></div>`;
  }

  static _generateOpenAISettingsHtml() {
    return `<div id="openAIApiSettings"><!-- Existing OpenAI HTML --></div>`;
  }

  static _generateOpenRouterSettingsHtml() {
    return `<div id="openRouterApiSettings"><!-- Existing OpenRouter HTML --></div>`;
  }

  static _generateDeepSeekSettingsHtml() {
    return `<div id="deepseekApiSettings"><!-- Existing DeepSeek HTML --></div>`;
  }

  static _generateWebAISettingsHtml() {
    return `<div id="webAIApiSettings"><!-- Existing WebAI HTML --></div>`;
  }

  static _generateCustomSettingsHtml() {
    return `<div id="customApiSettings"><!-- Existing Custom HTML --></div>`;
  }

  /**
   * Generate provider validation JavaScript object
   * @param {string} providerId - Provider ID
   * @returns {Object} Validation configuration
   */
  static generateProviderValidation(providerId) {
    const provider = getProviderById(providerId);
    return provider ? { required: provider.needsApiKey } : null;
  }

  /**
   * Generate compatibility warning for unavailable providers
   * @param {string} providerId - Provider ID
   * @returns {string} Warning message or empty string
   */
  static generateCompatibilityWarning(providerId) {
    const provider = getProviderById(providerId);
    if (!provider) {
      return "";
    }

    // Simplified compatibility check
    if (provider.id === "browser") {
      return `⚠️ ${provider.name} is not available. Requires Chrome 138+ with translation features enabled.`;
    }

    return "";
  }

  /**
   * Generate provider comparison data for UI
   * @returns {Object} Categorized provider data
   */
  static generateProviderComparison() {
    const allProviders = getSupportedProviders();

    return {
      free: allProviders.filter((p) => p.category === "free"),
      ai: allProviders.filter((p) => p.category === "ai"),
      local: allProviders.filter((p) => p.category === "local"),
      custom: allProviders.filter((p) => p.category === "custom"),
      available: allProviders,
      unavailable: [], // Simplified - all supported providers are available
    };
  }
}
