export class CERCalculator {
  calculate(referenceText, recognizedText) {
    if (typeof referenceText !== 'string' || typeof recognizedText !== 'string') {
      throw new TypeError('CERCalculator requires string inputs')
    }

    const reference = Array.from(referenceText)
    if (reference.length === 0) {
      throw new RangeError('CERCalculator requires non-empty reference text')
    }

    const recognized = Array.from(recognizedText)
    let previous = Array.from({ length: recognized.length + 1 }, (_, index) => index)

    for (let referenceIndex = 1; referenceIndex <= reference.length; referenceIndex++) {
      const current = [referenceIndex]

      for (let recognizedIndex = 1; recognizedIndex <= recognized.length; recognizedIndex++) {
        current[recognizedIndex] = Math.min(
          current[recognizedIndex - 1] + 1,
          previous[recognizedIndex] + 1,
          previous[recognizedIndex - 1] + (reference[referenceIndex - 1] === recognized[recognizedIndex - 1] ? 0 : 1)
        )
      }

      previous = current
    }

    const editDistance = previous[recognized.length]
    return Object.freeze({
      editDistance,
      referenceCharacterCount: reference.length,
      characterErrorRate: editDistance / reference.length
    })
  }
}
