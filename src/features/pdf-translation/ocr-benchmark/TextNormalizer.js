export class TextNormalizer {
  normalize(text) {
    if (typeof text !== 'string') {
      throw new TypeError('TextNormalizer requires a string input')
    }

    return text.normalize('NFC').replace(/\r\n?/g, '\n')
  }
}
