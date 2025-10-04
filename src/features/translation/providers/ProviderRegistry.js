import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'ProviderRegistry');
class ProviderRegistry {
  constructor() {
    this.providers = new Map();
    this.providerImports = new Map();
    this.loadingPromises = new Map();
    this._pendingRegistrations = [];
    this._registrationTimeout = null;
  }

  register(id, providerClass) {
    if (this.providers.has(id)) {
      logger.warn(`Provider with ID '${id}' already registered. Overwriting.`);
    }
    this.providers.set(id, providerClass);
  }

  registerLazy(id, importFunction, metadata = {}) {
    if (this.providerImports.has(id)) {
      logger.warn(`Lazy provider with ID '${id}' already registered. Overwriting.`);
    }
    this.providerImports.set(id, { importFunction, metadata });

    // Collect registrations for batched logging
    this._pendingRegistrations.push(id);

    // Schedule batched logging
    if (!this._registrationTimeout) {
      this._registrationTimeout = setTimeout(() => {
        const count = this._pendingRegistrations.length;
        if (count > 1) {
          logger.debug(`🔧 Registered ${count} lazy providers: ${this._pendingRegistrations.join(', ')}`);
        } else {
          logger.debug(`Lazy provider '${this._pendingRegistrations[0]}' registered`);
        }
        this._pendingRegistrations = [];
        this._registrationTimeout = null;
      }, 50); // Batch within 50ms
    }
  }

  async get(id) {
    if (this.providers.has(id)) {
      return this.providers.get(id);
    }

    if (this.providerImports.has(id)) {
      if (this.loadingPromises.has(id)) {
        await this.loadingPromises.get(id);
        return this.providers.get(id);
      }

      const loadingPromise = this._loadProvider(id);
      this.loadingPromises.set(id, loadingPromise);

      try {
        await loadingPromise;
        this.loadingPromises.delete(id);
        return this.providers.get(id);
      } catch (error) {
        this.loadingPromises.delete(id);
        throw error;
      }
    }

    throw new Error(`Provider with ID '${id}' not found.`);
  }

  async _loadProvider(id) {
    const providerInfo = this.providerImports.get(id);
    if (!providerInfo) {
      throw new Error(`Provider import info for '${id}' not found`);
    }

    try {
      logger.debug(`Loading provider '${id}'...`);
      const module = await providerInfo.importFunction();
      const ProviderClass = module.default || module[Object.keys(module)[0]];

      if (!ProviderClass) {
        throw new Error(`Provider class not found in module for '${id}'`);
      }

      this.providers.set(id, ProviderClass);
      logger.info(`Provider '${id}' loaded successfully`);
    } catch (error) {
      logger.error(`Failed to load provider '${id}':`, error);
      throw new Error(`Failed to load provider '${id}': ${error.message}`);
    }
  }

  getAll() {
    return Array.from(this.providers.values());
  }

  getAllAvailable() {
    // Only return lazy providers with metadata for UI purposes
    // Loaded provider classes should not be used directly in UI components
    const lazyProviders = Array.from(this.providerImports.entries()).map(([id, info]) => ({
      id,
      ...info.metadata,
      isLazy: true
    }));

    return lazyProviders;
  }

  isProviderLoaded(id) {
    return this.providers.has(id);
  }

  isProviderAvailable(id) {
    return this.providers.has(id) || this.providerImports.has(id);
  }
}

export const providerRegistry = new ProviderRegistry();