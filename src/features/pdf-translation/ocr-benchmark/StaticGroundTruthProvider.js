import { GroundTruthProvider } from './GroundTruthProvider.js'

export class StaticGroundTruthProvider extends GroundTruthProvider {
  constructor(referenceText) {
    super()

    if (typeof referenceText !== 'string') {
      throw new TypeError('StaticGroundTruthProvider requires a string reference text')
    }

    this.referenceText = referenceText
  }

  getReferenceText() {
    return this.referenceText
  }
}
