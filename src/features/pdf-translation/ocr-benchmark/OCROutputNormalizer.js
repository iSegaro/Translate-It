export class OCROutputNormalizer {
  normalize(providerOutput) {
    const text = typeof providerOutput === 'string' ? providerOutput : providerOutput?.text

    if (typeof text !== 'string') {
      throw new TypeError('OCR provider output must contain text')
    }

    return Object.freeze({ text })
  }
}
