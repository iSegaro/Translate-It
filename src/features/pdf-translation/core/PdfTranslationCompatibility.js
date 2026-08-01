/**
 * Translation compatibility predicate.
 *
 * Determines whether a cached translation entry matches the current
 * translation intent (block identity, provider configuration,
 * and language pair).
 *
 * This is a pure domain predicate — it owns only compatibility
 * evaluation and has no dependency on cache, restore, scheduling,
 * storage, or UI.
 */

export function isCompatibleEntry(entry, block, settings) {
  return !!entry &&
    entry.sourceTextHash === block.sourceTextHash &&
    entry.translationSettingsHash === settings.translationSettingsHash &&
    entry.provider === settings.provider &&
    entry.sourceLanguage === settings.sourceLanguage &&
    entry.targetLanguage === settings.targetLanguage
}
