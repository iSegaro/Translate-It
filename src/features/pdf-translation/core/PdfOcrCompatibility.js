/**
 * OCR cache compatibility identity.
 *
 * This module owns the identity fields used to determine whether
 * a cached OCR entry matches the current OCR engine version.
 *
 * It is the OCR counterpart of PdfTranslationCompatibility.
 */

export const OCR_ENGINE_VERSION = '7.0.0'

export function isCompatibleCachedOcrEntry(entry) {
  return !!entry &&
    typeof entry === 'object' &&
    Array.isArray(entry.ocrBlocks) &&
    typeof entry.ocrLanguage === 'string' &&
    entry.ocrLanguage.length > 0 &&
    entry.ocrEngineVersion === OCR_ENGINE_VERSION
}
