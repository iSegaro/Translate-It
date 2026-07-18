import { ProviderRegistry } from '@/core/provider-registry.js'

export class BenchmarkProviderResolver {
  constructor({ providerRegistry = ProviderRegistry } = {}) {
    this.providerRegistry = providerRegistry
  }

  resolve() {
    return Object.freeze([...this.providerRegistry.getAll()])
  }
}
