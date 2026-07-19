import { RegionComparisonCoordinator } from './RegionComparisonCoordinator.js'

export const PDF_DEVELOPER_CAPABILITY = Object.freeze({
  REGION_COMPARISON: 'region-comparison',
  CORPUS_BENCHMARK: 'corpus-benchmark'
})

export class PdfDeveloperApi {
  constructor({ regionComparisonCoordinator, regionExecutionDispatcher, corpusBenchmarkCoordinator, capabilities = {} } = {}) {
    const coordinator = regionComparisonCoordinator || new RegionComparisonCoordinator({ regionExecutionDispatcher })

    this.capabilities = new Map([
      [PDF_DEVELOPER_CAPABILITY.REGION_COMPARISON, (request) => coordinator.coordinateRegionComparison(request)],
      [PDF_DEVELOPER_CAPABILITY.CORPUS_BENCHMARK, (options) => corpusBenchmarkCoordinator?.run(options)],
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

  runRegionComparison(...args) {
    return this.invokeCapability(PDF_DEVELOPER_CAPABILITY.REGION_COMPARISON, ...args)
  }

  runCorpusBenchmark(...args) {
    return this.invokeCapability(PDF_DEVELOPER_CAPABILITY.CORPUS_BENCHMARK, ...args)
  }
}
