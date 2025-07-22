// src/utils/providerHtmlGenerator.js
import { ProviderRegistry } from "../providers/index.js";
import { logME } from "./helpers.js";

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
    const availableProviders = providers || ProviderRegistry.getAvailableProviders();
    logME(`[ProviderHtmlGenerator] Generating options HTML for ${availableProviders.length} providers`);
    
    return availableProviders.map(provider => {
      const title = provider.requirements.browsers.length < 4 
        ? `${provider.displayName} (${provider.requirements.browsers.join(', ')})`
        : provider.displayName;
      
      return `<option value="${provider.id}" title="${provider.description}">${title}</option>`;
    }).join('\n                  ');
  }

  /**
   * Generate dropdown HTML for popup/sidepanel
   * @param {Array} [providers] - Provider list (defaults to available providers)
   * @returns {string} HTML string for dropdown items
   */
  static generateDropdownHtml(providers = null) {
    const availableProviders = providers || ProviderRegistry.getAvailableProviders();
    logME(`[ProviderHtmlGenerator] Generating dropdown HTML for ${availableProviders.length} providers`);
    
    return availableProviders.map(provider => {
      const statusClass = this._getProviderStatusClass(provider);
      const statusIcon = this._getProviderStatusIcon(provider);
      
      return `
        <div class="dropdown-item ${statusClass}" data-provider="${provider.id}" title="${provider.description}">
          <img src="../icons/${provider.icon}" alt="${provider.name}" class="provider-icon">
          <span class="provider-name">${provider.displayName}</span>
          ${statusIcon}
        </div>`.trim();
    }).join('\n        ');
  }

  /**
   * Generate provider array for JavaScript use
   * @param {Array} [providers] - Provider list (defaults to available providers)
   * @returns {Array} Provider objects for JavaScript use
   */
  static generateProviderArray(providers = null) {
    const availableProviders = providers || ProviderRegistry.getAvailableProviders();
    
    return availableProviders.map(provider => ({
      id: provider.id,
      name: provider.displayName,
      icon: provider.icon,
      description: provider.description,
      needsApiKey: provider.needsApiKey,
      needsUrl: provider.needsUrl,
      category: provider.category
    }));
  }

  /**
   * Generate API settings section HTML for options page
   * @param {string} providerId - Provider ID
   * @returns {string} HTML string for provider settings section
   */
  static generateProviderSettingsHtml(providerId) {
    const provider = ProviderRegistry.getProvider(providerId);
    if (!provider) {
      return '';
    }

    switch (providerId) {
      case 'google':
        return this._generateGoogleSettingsHtml(provider);
      case 'browserapi':
        return this._generateBrowserApiSettingsHtml(provider);
      case 'gemini':
        return this._generateGeminiSettingsHtml(provider);
      case 'openai':
        return this._generateOpenAISettingsHtml(provider);
      case 'openrouter':
        return this._generateOpenRouterSettingsHtml(provider);
      case 'deepseek':
        return this._generateDeepSeekSettingsHtml(provider);
      case 'webai':
        return this._generateWebAISettingsHtml(provider);
      case 'custom':
        return this._generateCustomSettingsHtml(provider);
      default:
        return '';
    }
  }

  /**
   * Get provider status class for styling
   * @private
   * @param {Object} provider - Provider object
   * @returns {string} CSS class name
   */
  static _getProviderStatusClass(provider) {
    if (provider.requirements.features.length > 0) {
      // Check if Chrome-specific features are available
      const hasFeatures = ProviderRegistry._checkBrowserFeatures(provider.requirements.features);
      return hasFeatures ? 'provider-available' : 'provider-limited';
    }
    return 'provider-available';
  }

  /**
   * Get provider status icon
   * @private  
   * @param {Object} provider - Provider object
   * @returns {string} HTML for status icon
   */
  static _getProviderStatusIcon(provider) {
    if (provider.id === 'browserapi') {
      const isAvailable = ProviderRegistry.isProviderAvailable(provider.id);
      if (!isAvailable) {
        return '<span class="provider-status" title="Requires Chrome 138+">⚠️</span>';
      }
    }
    
    if (provider.category === 'free') {
      return '<span class="provider-status" title="Free service">🆓</span>';
    } else if (provider.needsApiKey) {
      return '<span class="provider-status" title="Requires API key">🔑</span>';
    }
    
    return '';
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
   * Generate Browser API settings HTML
   * @private
   */
  static _generateBrowserApiSettingsHtml(provider) {
    return `
      <div id="browserApiSettingsInfo" style="display: none">
        <h3 data-i18n="browser_api_settings_title">Chrome Translation API</h3>
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
  static _generateGeminiSettingsHtml(_provider) {
    // Return existing Gemini settings HTML structure
    return `<div id="geminiApiSettings"><!-- Existing Gemini HTML --></div>`;
  }

  static _generateOpenAISettingsHtml(_provider) {
    return `<div id="openAIApiSettings"><!-- Existing OpenAI HTML --></div>`;
  }

  static _generateOpenRouterSettingsHtml(_provider) {
    return `<div id="openRouterApiSettings"><!-- Existing OpenRouter HTML --></div>`;
  }

  static _generateDeepSeekSettingsHtml(_provider) {
    return `<div id="deepseekApiSettings"><!-- Existing DeepSeek HTML --></div>`;
  }

  static _generateWebAISettingsHtml(_provider) {
    return `<div id="webAIApiSettings"><!-- Existing WebAI HTML --></div>`;
  }

  static _generateCustomSettingsHtml(_provider) {
    return `<div id="customApiSettings"><!-- Existing Custom HTML --></div>`;
  }

  /**
   * Generate provider validation JavaScript object
   * @param {string} providerId - Provider ID
   * @returns {Object} Validation configuration
   */
  static generateProviderValidation(providerId) {
    return ProviderRegistry.getProviderValidation(providerId);
  }

  /**
   * Generate compatibility warning for unavailable providers
   * @param {string} providerId - Provider ID
   * @returns {string} Warning message or empty string
   */
  static generateCompatibilityWarning(providerId) {
    const provider = ProviderRegistry.getProvider(providerId);
    if (!provider) {
      return '';
    }

    const isAvailable = ProviderRegistry.isProviderAvailable(providerId);
    if (!isAvailable) {
      if (provider.id === 'browserapi') {
        return `⚠️ ${provider.displayName} is not available. Requires Chrome ${provider.requirements.minVersion}+ with translation features enabled.`;
      }
      
      return `⚠️ ${provider.displayName} is not available in your current browser.`;
    }

    return '';
  }

  /**
   * Generate provider comparison data for UI
   * @returns {Object} Categorized provider data
   */
  static generateProviderComparison() {
    const allProviders = ProviderRegistry.getAllProviders();
    
    return {
      free: allProviders.filter(p => p.category === 'free'),
      ai: allProviders.filter(p => p.category === 'ai'), 
      local: allProviders.filter(p => p.category === 'local'),
      custom: allProviders.filter(p => p.category === 'custom'),
      available: ProviderRegistry.getAvailableProviders(),
      unavailable: allProviders.filter(p => !ProviderRegistry.isProviderAvailable(p.id))
    };
  }
}