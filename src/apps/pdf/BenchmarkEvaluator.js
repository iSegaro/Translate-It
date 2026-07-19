import { CERCalculator } from '@/features/pdf-translation/ocr-benchmark/CERCalculator.js'
import { OCROutputNormalizer } from '@/features/pdf-translation/ocr-benchmark/OCROutputNormalizer.js'
import { TextNormalizer } from '@/features/pdf-translation/ocr-benchmark/TextNormalizer.js'

export class BenchmarkEvaluator {
  constructor({
    outputNormalizer = new OCROutputNormalizer(),
    textNormalizer = new TextNormalizer(),
    cerCalculator = new CERCalculator()
  } = {}) {
    this.outputNormalizer = outputNormalizer
    this.textNormalizer = textNormalizer
    this.cerCalculator = cerCalculator
  }

  evaluate(results, { groundTruth } = {}) {
    if (typeof groundTruth !== 'string') return results

    const normalizedGroundTruth = this.textNormalizer.normalize(groundTruth)
    return Object.freeze(results.map(result => {
      const output = this.outputNormalizer.normalize(result.output?.data ?? result.output)
      const normalizedOutput = this.textNormalizer.normalize(output.text)
      const evaluation = Object.freeze({
        cer: this.cerCalculator.calculate(normalizedGroundTruth, normalizedOutput),
        normalizedGroundTruth,
        normalizedOutput
      })

      return Object.freeze({ ...result, evaluation })
    }))
  }
}
