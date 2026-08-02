/**
 * Internal parser DTO. It shallowly snapshots parser-normalized candidates for
 * immediate contract validation and must not leave parser/validator execution.
 */

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function createUnit(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return Object.freeze({
      hasResponseId: false,
      responseId: null,
      hasTranslatedText: true,
      translatedText: item,
    })
  }

  const idKey = hasOwn(item, 'i') ? 'i' : (hasOwn(item, 'id') ? 'id' : null)
  const textKey = hasOwn(item, 't') ? 't' : (hasOwn(item, 'text') ? 'text' : (hasOwn(item, 'translation') ? 'translation' : null))

  return Object.freeze({
    hasResponseId: idKey !== null,
    responseId: idKey ? item[idKey] : null,
    hasTranslatedText: textKey !== null,
    translatedText: textKey ? item[textKey] : null,
  })
}

/**
 * Creates a shallowly immutable parser snapshot without mapping candidates to
 * source units or repairing semantic content. Nested provider values remain
 * opaque references because validator only observes them.
 */
export function createParserSnapshot(items, { repaired = false } = {}) {
  return Object.freeze({
    units: Object.freeze((Array.isArray(items) ? items : []).map(createUnit)),
    parserEvidence: Object.freeze({ repaired }),
  })
}
