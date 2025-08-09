import { createLogger } from '@/utils/core/logger.js';

const logger = createLogger('Core', 'ProviderRegistry');
class ProviderRegistry {
  constructor() {
    this.providers = new Map();
  }

  register(id, providerClass) {
    if (this.providers.has(id)) {
      logger.warn(`Provider with ID '${id}' already registered. Overwriting.`);
    }
    this.providers.set(id, providerClass);
  }

  get(id) {
    if (!this.providers.has(id)) {
      throw new Error(`Provider with ID '${id}' not found.`);
    }
    return this.providers.get(id);
  }

  getAll() {
    return Array.from(this.providers.values());
  }
}

export const providerRegistry = new ProviderRegistry();