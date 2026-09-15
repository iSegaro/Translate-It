import { GenericHtmlMediaStrategy } from './GenericHtmlMediaStrategy.js';
import { MEDIA_SOURCE_ERRORS } from './mediaConstants.js';
import { createMediaSourceFailure } from './mediaContracts.js';

/**
 * Runs a deliberately small, ordered list of source strategies. A strategy
 * that finds an ambiguous source stops resolution; later strategies must not
 * hide an unsafe source choice.
 */
export class MediaSourceResolver {
  constructor({ documentRef = globalThis.document, strategies } = {}) {
    this.documentRef = documentRef;
    this.strategies = strategies === undefined
      ? [new GenericHtmlMediaStrategy({ documentRef })]
      : Array.isArray(strategies)
        ? strategies.filter(strategy => typeof strategy?.resolve === 'function')
        : [];
  }

  resolve(documentRef = this.documentRef) {
    for (const strategy of this.strategies) {
      let result;
      try {
        result = strategy.resolve(documentRef);
      } catch {
        continue;
      }

      if (result?.success === true && result.source) return result;
      if (result?.error === MEDIA_SOURCE_ERRORS.AMBIGUOUS) {
        return createMediaSourceFailure(MEDIA_SOURCE_ERRORS.AMBIGUOUS);
      }
    }

    return createMediaSourceFailure(MEDIA_SOURCE_ERRORS.NOT_FOUND);
  }
}
