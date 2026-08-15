import { AUTO_DETECT_VALUE } from '@/shared/constants/core.js';
import {
  DETECTION_CONFIDENCE,
  DETECTION_PROVENANCE,
  LanguageDetectionService,
  sanitizeDetectionSample,
} from '@/shared/services/LanguageDetectionService.js';
import { LanguageSwappingService } from '@/features/translation/providers/LanguageSwappingService.js';
import { TranslationMode } from '@/shared/config/config.js';

const MAX_SAMPLE_ITEMS = 8;
const MAX_CHARS_PER_ITEM = 250;
const MAX_SAMPLE_CHARS = MAX_SAMPLE_ITEMS * MAX_CHARS_PER_ITEM;

export const SOURCE_RESOLUTION_BYPASS_REASONS = Object.freeze({
  EXPLICIT_SOURCE: 'EXPLICIT_SOURCE',
  HIGH_CONFIDENCE_STATISTICAL: 'HIGH_CONFIDENCE_STATISTICAL',
  LANGUAGE_SPECIFIC_DETERMINISTIC: 'LANGUAGE_SPECIFIC_DETERMINISTIC',
  UNKNOWN_LANGUAGE: 'UNKNOWN_LANGUAGE',
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',
  CONTEXTUAL_CACHE: 'CONTEXTUAL_CACHE',
  EXACT_CACHE_NOT_VERIFIED: 'EXACT_CACHE_NOT_VERIFIED',
  HEURISTIC_RESULT: 'HEURISTIC_RESULT',
  USER_LANGUAGE_RESULT: 'USER_LANGUAGE_RESULT',
  AMBIGUOUS_DETERMINISTIC: 'AMBIGUOUS_DETERMINISTIC',
  SWAP_UNRESOLVED: 'SWAP_UNRESOLVED',
  MIXED_LANGUAGE_RISK: 'MIXED_LANGUAGE_RISK',
  INSUFFICIENT_SAMPLE: 'INSUFFICIENT_SAMPLE',
  HISTORY_ORDERING_REQUIRED: 'HISTORY_ORDERING_REQUIRED',
});

// General Cyrillic currently maps to Russian, although script alone cannot
// distinguish Russian from several other Cyrillic languages.
const LANGUAGE_SPECIFIC_DETERMINISTIC_LANGUAGES = new Set([
  'ar', 'de', 'es', 'fa', 'fr', 'it', 'ja', 'ko', 'mr', 'no', 'ps', 'pt', 'tr', 'uk', 'ur',
  'zh-cn', 'zh-tw',
]);

const getItemText = (item) => {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return '';
  return item.t || item.text || '';
};

const noDetection = () => ({
  language: null,
  confidence: DETECTION_CONFIDENCE.UNKNOWN,
  provenance: DETECTION_PROVENANCE.UNKNOWN,
  reliable: false,
  percentage: null,
});

const pickRepresentativeItems = (items) => {
  if (items.length <= MAX_SAMPLE_ITEMS) return items;

  return Array.from({ length: MAX_SAMPLE_ITEMS }, (_, index) => {
    const sourceIndex = Math.round(index * (items.length - 1) / (MAX_SAMPLE_ITEMS - 1));
    return items[sourceIndex];
  });
};

/**
 * Build bounded operation text without mutating translation payloads.
 * Sampling across the operation avoids making the first tiny segment the
 * operation-wide authority. V3 markers are removed from the detection sample.
 */
export const buildOperationDetectionSample = (input) => {
  const items = Array.isArray(input) ? input : [input];
  const representativeItems = pickRepresentativeItems(items);
  const sample = representativeItems
    .map(getItemText)
    .filter(Boolean)
    .map((text) => text.slice(0, MAX_CHARS_PER_ITEM))
    .join(' ')
    .slice(0, MAX_SAMPLE_CHARS);

  return sanitizeDetectionSample(sample);
};

const getRepresentativeScriptFamilies = (input) => {
  const items = Array.isArray(input) ? input : [input];
  const families = new Set();

  for (const item of pickRepresentativeItems(items)) {
    const text = sanitizeDetectionSample(getItemText(item));
    if (!text) continue;
    const family = LanguageDetectionService.getScriptFamily(text);
    if (family !== 'other') families.add(family);
  }

  return families;
};

const getDetectionBypassDecision = (detection) => {
  if (!detection?.language) {
    return {
      canBypass: false,
      reason: SOURCE_RESOLUTION_BYPASS_REASONS.UNKNOWN_LANGUAGE,
    };
  }

  if (detection.provenance === DETECTION_PROVENANCE.STATISTICAL
      && detection.confidence === DETECTION_CONFIDENCE.HIGH
      && detection.reliable === true) {
    return {
      canBypass: true,
      reason: SOURCE_RESOLUTION_BYPASS_REASONS.HIGH_CONFIDENCE_STATISTICAL,
    };
  }

  if (detection.provenance === DETECTION_PROVENANCE.DETERMINISTIC_SCRIPT) {
    if (!LANGUAGE_SPECIFIC_DETERMINISTIC_LANGUAGES.has(detection.language)) {
      return {
        canBypass: false,
        reason: SOURCE_RESOLUTION_BYPASS_REASONS.AMBIGUOUS_DETERMINISTIC,
      };
    }

    if (detection.confidence === DETECTION_CONFIDENCE.HIGH && detection.reliable === true) {
      return {
        canBypass: true,
        reason: SOURCE_RESOLUTION_BYPASS_REASONS.LANGUAGE_SPECIFIC_DETERMINISTIC,
      };
    }
  }

  if (detection.provenance === DETECTION_PROVENANCE.EXACT_CACHE) {
    return {
      canBypass: false,
      reason: SOURCE_RESOLUTION_BYPASS_REASONS.EXACT_CACHE_NOT_VERIFIED,
    };
  }

  if (detection.provenance === DETECTION_PROVENANCE.CONTEXTUAL_CACHE) {
    return {
      canBypass: false,
      reason: SOURCE_RESOLUTION_BYPASS_REASONS.CONTEXTUAL_CACHE,
    };
  }

  if (detection.provenance === DETECTION_PROVENANCE.HEURISTIC) {
    return {
      canBypass: false,
      reason: SOURCE_RESOLUTION_BYPASS_REASONS.HEURISTIC_RESULT,
    };
  }

  if (detection.provenance === DETECTION_PROVENANCE.USER_LANGUAGE) {
    return {
      canBypass: false,
      reason: SOURCE_RESOLUTION_BYPASS_REASONS.USER_LANGUAGE_RESULT,
    };
  }

  return {
    canBypass: false,
    reason: SOURCE_RESOLUTION_BYPASS_REASONS.LOW_CONFIDENCE,
  };
};

/**
 * Resolve one operation's candidate source/target pair without scheduling it.
 * This is intentionally not wired into ProviderCoordinator or batch handlers.
 */
export const resolveOperationSourceLanguage = async ({
  text,
  items,
  sourceLanguage = AUTO_DETECT_VALUE,
  targetLanguage,
  originalSourceLanguage = sourceLanguage,
  mode = TranslationMode.Selection,
  originalMode,
  providerName = 'OperationSourceLanguageResolver',
  supportsBilingual = true,
  historyEnabled = false,
  url,
  tabId,
} = {}) => {
  const requestedSourceLanguage = sourceLanguage || AUTO_DETECT_VALUE;
  const operationInput = items ?? text;

  if (requestedSourceLanguage !== AUTO_DETECT_VALUE) {
    return {
      requestedSourceLanguage,
      detectedSourceLanguage: null,
      effectiveSourceLanguage: requestedSourceLanguage,
      effectiveTargetLanguage: targetLanguage,
      detection: noDetection(),
      swapApplied: false,
      canBypassSequentialGate: !historyEnabled,
      bypassReason: historyEnabled
        ? SOURCE_RESOLUTION_BYPASS_REASONS.HISTORY_ORDERING_REQUIRED
        : SOURCE_RESOLUTION_BYPASS_REASONS.EXPLICIT_SOURCE,
      fallbackReason: historyEnabled ? SOURCE_RESOLUTION_BYPASS_REASONS.HISTORY_ORDERING_REQUIRED : null,
      sample: null,
      mixedLanguageRisk: false,
      historyEnabled,
    };
  }

  const sample = buildOperationDetectionSample(operationInput);
  if (sample.length < 2) {
    return {
      requestedSourceLanguage,
      detectedSourceLanguage: null,
      effectiveSourceLanguage: AUTO_DETECT_VALUE,
      effectiveTargetLanguage: targetLanguage,
      detection: await LanguageDetectionService.detectDetailed(sample, { url, tabId }),
      swapApplied: false,
      canBypassSequentialGate: false,
      bypassReason: SOURCE_RESOLUTION_BYPASS_REASONS.INSUFFICIENT_SAMPLE,
      fallbackReason: SOURCE_RESOLUTION_BYPASS_REASONS.INSUFFICIENT_SAMPLE,
      sample,
      mixedLanguageRisk: false,
      historyEnabled,
    };
  }

  const detection = await LanguageDetectionService.detectDetailed(sample, { url, tabId });
  const swapResult = supportsBilingual
    ? await LanguageSwappingService.applyLanguageSwapping(
      sample,
      requestedSourceLanguage,
      targetLanguage,
      originalSourceLanguage,
      {
        providerName,
        mode,
        originalMode,
        detectedLanguage: detection.language,
      },
    )
    : [requestedSourceLanguage, targetLanguage];

  let [effectiveSourceLanguage, effectiveTargetLanguage] = swapResult;
  if (effectiveSourceLanguage === AUTO_DETECT_VALUE && detection.language) {
    const sameLanguageStructuredMode = [
      TranslationMode.Page,
      TranslationMode.Select_Element,
      TranslationMode.PDF,
    ].includes(mode) && detection.language === effectiveTargetLanguage;

    if (!sameLanguageStructuredMode) effectiveSourceLanguage = detection.language;
  }

  const mixedLanguageRisk = getRepresentativeScriptFamilies(operationInput).size > 1;
  const detectionDecision = getDetectionBypassDecision(detection);
  let canBypassSequentialGate = detectionDecision.canBypass;
  let bypassReason = detectionDecision.reason;

  if (mixedLanguageRisk) {
    canBypassSequentialGate = false;
    bypassReason = SOURCE_RESOLUTION_BYPASS_REASONS.MIXED_LANGUAGE_RISK;
  } else if (effectiveSourceLanguage === AUTO_DETECT_VALUE && detection.language) {
    canBypassSequentialGate = false;
    bypassReason = SOURCE_RESOLUTION_BYPASS_REASONS.SWAP_UNRESOLVED;
  }

  if (historyEnabled) {
    canBypassSequentialGate = false;
    bypassReason = SOURCE_RESOLUTION_BYPASS_REASONS.HISTORY_ORDERING_REQUIRED;
  }

  return {
    requestedSourceLanguage,
    detectedSourceLanguage: detection.language,
    effectiveSourceLanguage,
    effectiveTargetLanguage,
    detection,
    swapApplied: effectiveTargetLanguage !== targetLanguage,
    canBypassSequentialGate,
    bypassReason,
    fallbackReason: canBypassSequentialGate ? null : bypassReason,
    sample,
    mixedLanguageRisk,
    historyEnabled,
  };
};

export const canBypassSequentialGate = (resolution) => resolution?.canBypassSequentialGate === true;
