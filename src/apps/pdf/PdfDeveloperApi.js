import { BenchmarkCoordinator } from './BenchmarkCoordinator.js'

export const PDF_DEVELOPER_CAPABILITY = Object.freeze({
  REGION_BENCHMARK: 'region-benchmark'
})

export class PdfDeveloperApi {
  constructor({ benchmarkCoordinator = new BenchmarkCoordinator(), capabilities = {} } = {}) {
    this.capabilities = new Map([
      [PDF_DEVELOPER_CAPABILITY.REGION_BENCHMARK, (request) => benchmarkCoordinator.coordinateRegionBenchmark(request)],
      ...Object.entries(capabilities)
    ])
  }

  getCapabilities() {
    return [...this.capabilities.keys()]
  }

  hasCapability(capability) {
    return this.capabilities.has(capability)
  }

  invokeCapability(capability, ...args) {
    const handler = this.capabilities.get(capability)
    if (!handler) throw new Error(`Unknown developer capability: ${capability}`)
    return handler(...args)
  }

  runRegionBenchmark(...args) {
    return this.invokeCapability(PDF_DEVELOPER_CAPABILITY.REGION_BENCHMARK, ...args)
  }
}
