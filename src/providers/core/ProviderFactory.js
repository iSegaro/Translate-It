import { providerRegistry } from "./ProviderRegistry.js";

export class ProviderFactory {
  constructor() {
    this.providerInstances = new Map();
  }

  getProvider(providerId) {
    if (this.providerInstances.has(providerId)) {
      return this.providerInstances.get(providerId);
    }

    const ProviderClass = providerRegistry.get(providerId);
    const provider = new ProviderClass();
    this.providerInstances.set(providerId, provider);
    return provider;
  }

  getSupportedProviders() {
    return providerRegistry.getAll().map(p => ({ id: p.id, name: p.name }));
  }

  isProviderSupported(providerId) {
    return providerRegistry.getAll().some(p => p.id === providerId);
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
