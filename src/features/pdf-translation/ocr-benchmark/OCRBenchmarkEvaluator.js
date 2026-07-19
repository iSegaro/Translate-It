import { CERCalculator } from './CERCalculator.js'
import { OCROutputNormalizer } from './OCROutputNormalizer.js'
import { TextNormalizer } from './TextNormalizer.js'

export class OCRBenchmarkEvaluator {
  constructor({
    outputNormalizer = new OCROutputNormalizer(),
    textNormalizer = new TextNormalizer(),
    cerCalculator = new CERCalculator()
  } = {}) {
    this.outputNormalizer = outputNormalizer
    this.textNormalizer = textNormalizer
    this.cerCalculator = cerCalculator
  }

  evaluate(results, { referenceText } = {}) {
    const normalizedReferenceText = this.textNormalizer.normalize(referenceText)

    return Object.freeze(results.map(benchmarkResult => {
      const normalizedOutput = this.outputNormalizer.normalize(benchmarkResult.output)
      const normalizedRecognizedText = this.textNormalizer.normalize(normalizedOutput.text)

      return Object.freeze({
        providerId: benchmarkResult.providerId,
        benchmarkResult,
        normalizedOutput,
        metrics: Object.freeze({
          characterErrorRate: this.cerCalculator.calculate(normalizedReferenceText, normalizedRecognizedText)
        })
      })
    }))
  }
}
