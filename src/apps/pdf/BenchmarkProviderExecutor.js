export class BenchmarkProviderExecutor {
  constructor({ executeProvider } = {}) {
    this.executeProvider = executeProvider
  }

  async execute({ request, provider, step }) {
    if (typeof this.executeProvider !== 'function') {
      throw new TypeError('BenchmarkProviderExecutor requires an executeProvider callback')
    }

    const output = await this.executeProvider({ request, provider, step })
    return Object.freeze({ providerId: step.providerId, status: 'completed', output })
  }
}
