import {
  MEDIA_ELEMENT_SELECTORS,
  MEDIA_READY_STATES,
  MEDIA_SOURCE_ERRORS,
} from './mediaConstants.js';
import { createMediaSourceFailure } from './mediaContracts.js';

function isCandidate(media) {
  try {
    return Boolean(media)
      && media.isConnected === true
      && media.paused === false
      && media.ended === false
      && Number.isFinite(media.readyState)
      && media.readyState >= MEDIA_READY_STATES.HAVE_CURRENT_DATA;
  } catch {
    return false;
  }
}

function iterableToArray(value) {
  try {
    return value && typeof value[Symbol.iterator] === 'function' ? [...value] : [];
  } catch {
    return [];
  }
}

/**
 * Resolves the one eligible media element in the current document.
 * Only connected, playing, non-ended HTML video/audio elements with current
 * data are candidates; this strategy never mutates the elements it inspects.
 */
export class GenericHtmlMediaStrategy {
  constructor({ documentRef = globalThis.document } = {}) {
    this.documentRef = documentRef;
  }

  findCandidates(documentRef = this.documentRef) {
    const candidates = [];
    const seen = new Set();

    for (const selector of MEDIA_ELEMENT_SELECTORS) {
      let elements;
      try {
        elements = documentRef?.querySelectorAll?.(selector);
      } catch {
        continue;
      }

      for (const element of iterableToArray(elements)) {
        if (!seen.has(element) && isCandidate(element)) {
          seen.add(element);
          candidates.push(element);
        }
      }
    }

    return candidates;
  }

  resolve(documentRef = this.documentRef) {
    const candidates = this.findCandidates(documentRef);
    if (candidates.length === 0) return createMediaSourceFailure(MEDIA_SOURCE_ERRORS.NOT_FOUND);
    if (candidates.length > 1) return createMediaSourceFailure(MEDIA_SOURCE_ERRORS.AMBIGUOUS);
    return { success: true, source: candidates[0] };
  }
}
