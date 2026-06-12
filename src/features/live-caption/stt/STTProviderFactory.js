import { getOpenAIApiKeyAsync, IsDebug } from '@/shared/config/config.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import {
  createSTTProviderError,
  STT_PROVIDER_ERROR_CODES
} from './BaseSTTProvider.js';
import {
  getDefaultSTTProviderId,
  getSTTProviderDefinition,
  getAvailableSTTProviders,
  isSTTProviderSupported
} from './STTProviderManifest.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'STTProviderFactory');

function shouldMemoize(options = {}) {
  return !options.requestImpl && !options.responseParser && !options.apiKey && !options.endpointUrl && !options.model && options.memoize !== false;
}

export class STTProviderFactory {
  constructor(options = {}) {
    this.providerInstances = new Map();
    this.loadingInstances = new Map();
    this.settingsLoader = options.settingsLoader || getOpenAIApiKeyAsync;
  }

  async getProvider(providerId = getDefaultSTTProviderId(), options = {}) {
    const resolvedProviderId = providerId || getDefaultSTTProviderId();
    const definition = getSTTProviderDefinition(resolvedProviderId);

    if (!definition || definition.supported === false) {
      throw createSTTProviderError(STT_PROVIDER_ERROR_CODES.PROVIDER_NOT_FOUND, `STT provider '${resolvedProviderId}' is not registered`, {
        providerId: resolvedProviderId,
        providerName: resolvedProviderId,
        stage: 'startup',
        retryable: false,
        type: ErrorTypes.API_CONFIG_INVALID
      });
    }

    if (definition.providerClass?.isSupported && !definition.providerClass.isSupported()) {
      throw createSTTProviderError(STT_PROVIDER_ERROR_CODES.PROVIDER_NOT_FOUND, `STT provider '${resolvedProviderId}' is not supported in this browser`, {
        providerId: resolvedProviderId,
        providerName: definition.displayName,
        stage: 'startup',
        retryable: false,
        type: ErrorTypes.API_CONFIG_INVALID
      });
    }

    // Defensive Check: Enforce Debug Mode for development-only providers
    const isDebug = await IsDebug();
    if (definition.developmentOnly && !isDebug) {
      throw createSTTProviderError(STT_PROVIDER_ERROR_CODES.PROVIDER_NOT_FOUND, `STT provider '${resolvedProviderId}' is restricted to debug mode`, {
        providerId: resolvedProviderId,
        providerName: definition.displayName,
        stage: 'startup',
        retryable: false,
        type: ErrorTypes.API_CONFIG_INVALID
      });
    }

    const cacheKey = shouldMemoize(options) ? resolvedProviderId : null;

    if (cacheKey && this.providerInstances.has(cacheKey)) {
      return this.providerInstances.get(cacheKey);
    }

    if (cacheKey && this.loadingInstances.has(cacheKey)) {
      return await this.loadingInstances.get(cacheKey);
    }

    const loadingPromise = this._createProviderInstance(resolvedProviderId, options, cacheKey);

    if (cacheKey) {
      this.loadingInstances.set(cacheKey, loadingPromise);
    }

    try {
      const provider = await loadingPromise;
      if (cacheKey) {
        this.loadingInstances.delete(cacheKey);
      }
      return provider;
    } catch (error) {
      if (cacheKey) {
        this.loadingInstances.delete(cacheKey);
      }
      throw error;
    }
  }

  async _createProviderInstance(providerId, options = {}, cacheKey = null) {
    const definition = getSTTProviderDefinition(providerId);
    if (!definition) {
      throw createSTTProviderError(STT_PROVIDER_ERROR_CODES.PROVIDER_NOT_FOUND, `STT provider '${providerId}' not found`, {
        providerId,
        providerName: providerId,
        stage: 'startup',
        retryable: false,
        type: ErrorTypes.API_CONFIG_INVALID
      });
    }

    logger.debug(`[STTProviderFactory] Creating provider`, {
      providerId,
      displayName: definition.displayName,
      mode: definition.mode
    });

    const ProviderClass = definition.providerClass;
    let providerOptions = { ...options };

    // Resolve API Key if required by manifest
    if (definition.needsApiKey) {
      const apiKey = typeof options.apiKey === 'string'
        ? options.apiKey.trim()
        : (await this.settingsLoader())?.trim?.() || '';

      if (!apiKey) {
        throw createSTTProviderError(STT_PROVIDER_ERROR_CODES.MISSING_API_KEY, `${definition.displayName} API key is required for live-caption transcription`, {
          providerId,
          providerName: definition.displayName,
          stage: 'startup',
          retryable: false,
          type: ErrorTypes.API_KEY_MISSING
        });
      }
      
      providerOptions.apiKey = apiKey;
    }

    const provider = new ProviderClass(providerOptions);

    if (cacheKey) {
      this.providerInstances.set(cacheKey, provider);
    }

    return provider;
  }

  getDefaultProviderId() {
    return getDefaultSTTProviderId();
  }

  getProviderDefinition(providerId) {
    return getSTTProviderDefinition(providerId);
  }

  getSupportedProviders() {
    return getAvailableSTTProviders();
  }

  isProviderSupported(providerId) {
    return isSTTProviderSupported(providerId);
  }

  resetProviders(providerId = null) {
    if (providerId) {
      this.providerInstances.delete(providerId);
      this.loadingInstances.delete(providerId);
      return;
    }

    this.providerInstances.clear();
    this.loadingInstances.clear();
  }

  async createProvider(providerId = null, options = {}) {
    return this.getProvider(providerId || this.getDefaultProviderId(), options);
  }
}

export default STTProviderFactory;
