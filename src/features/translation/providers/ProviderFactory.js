import { providerRegistry } from "./ProviderRegistry.js";

export class ProviderFactory {
  constructor() {
    this.providerInstances = new Map();
    this.loadingInstances = new Map();
  }

  async getProvider(providerId) {
    if (this.providerInstances.has(providerId)) {
      return this.providerInstances.get(providerId);
    }

    if (this.loadingInstances.has(providerId)) {
      return await this.loadingInstances.get(providerId);
    }

    const loadingPromise = this._createProviderInstance(providerId);
    this.loadingInstances.set(providerId, loadingPromise);

    try {
      const provider = await loadingPromise;
      this.loadingInstances.delete(providerId);
      return provider;
    } catch (error) {
      this.loadingInstances.delete(providerId);
      throw error;
    }
  }

  async _createProviderInstance(providerId) {
    try {
      const ProviderClass = await providerRegistry.get(providerId);
      const provider = new ProviderClass();
      this.providerInstances.set(providerId, provider);
      return provider;
    } catch (error) {
      throw new Error(`Failed to create provider instance for '${providerId}': ${error.message}`);
    }
  }

  getSupportedProviders() {
    return providerRegistry.getAllAvailable().map(p => ({
      id: p.id,
      name: p.name,
      isLazy: p.isLazy || false
    }));
  }

  isProviderSupported(providerId) {
    return providerRegistry.isProviderAvailable(providerId);
  }

  resetProviders(providerId = null) {
    if (providerId) {
      this.providerInstances.delete(providerId);
    } else {
      this.providerInstances.clear();
    }
  }

  resetSessionContext(providerId = null) {
    if (providerId && this.providerInstances.has(providerId)) {
      this.providerInstances.get(providerId).resetSessionContext();
    } else {
      for (const provider of this.providerInstances.values()) {
        if (typeof provider.resetSessionContext === 'function') {
          provider.resetSessionContext();
        }
      }
    }
  }
}
