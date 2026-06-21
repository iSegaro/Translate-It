// src/features/translation/utils/translationModeHelper.js

import { TranslationMode, getEnableDictionaryAsync } from "@/shared/config/config.js";
import { isSingleWordOrShortPhrase } from "@/shared/utils/text/textAnalysis.js";
import { findProviderByName } from "@/features/translation/providers/ProviderManifest.js";
import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'TranslationModeHelper');

/**
 * Whitelist of modes eligible for dictionary upgrade.
 */
export const ELIGIBLE_DICTIONARY_MODES = [
  TranslationMode.Selection,
  TranslationMode.MouseHover,
  TranslationMode.Popup_Translate,
  TranslationMode.Sidepanel_Translate,
  TranslationMode.Mobile_Translate
];

/**
 * Structural/Bulk modes that MUST NOT be upgraded to dictionary.
 */
export const STRUCTURAL_MODES = [
  TranslationMode.PDF,
  TranslationMode.Select_Element,
  TranslationMode.Page,
  TranslationMode.Field
];

/**
 * Determine if a provider (either by name string or class constructor) supports dictionary mode.
 * @param {string|object} provider - Provider name string or provider class constructor
 * @returns {boolean} True if the provider supports dictionary mode
 */
export function checkProviderSupportsDictionary(provider) {
  if (!provider) return false;
  if (typeof provider === 'string') {
    const manifest = findProviderByName(provider);
    return manifest?.features?.includes('dictionary') || false;
  }
  return !!provider.supportsDictionary;
}

/**
 * Check if the text and mode are eligible for upgrading to dictionary translation,
 * ignoring provider capability.
 * 
 * @param {string} text - Text to check
 * @param {string} mode - Current translation mode
 * @param {object} [data={}] - Additional data for local checks (options, enableDictionary)
 * @returns {Promise<boolean>} True if eligible
 */
export async function isEligibleForDictionaryUpgrade(text, mode, data = {}) {
  if (typeof text !== 'string') return false;

  // 1. Explicitly check if dictionary is disabled globally or locally
  const isDictionaryForbidden = data.enableDictionary === false || 
                               (data.options && data.options.enableDictionary === false);
  if (isDictionaryForbidden) return false;

  if (STRUCTURAL_MODES.includes(mode)) return false;

  if (!ELIGIBLE_DICTIONARY_MODES.includes(mode)) return false;

  const isDictionaryEnabled = await getEnableDictionaryAsync();
  if (!isDictionaryEnabled) return false;

  return isSingleWordOrShortPhrase(text);
}

/**
 * Resolve the actual translation mode based on eligibility and provider capability.
 * Handles both upgrades (Selection -> Dictionary) and downgrades (Dictionary -> Selection).
 * 
 * @param {object} data - The translation request data object (containing mode, text, options)
 * @param {string|object} provider - The provider name or class constructor
 * @returns {Promise<string>} The effective translation mode
 */
export async function resolveTranslationMode(data, provider) {
  const { mode } = data;

  // 1. Downgrade if explicit dictionary mode is requested but not supported
  if (mode === TranslationMode.Dictionary_Translation) {
    if (!checkProviderSupportsDictionary(provider)) {
      logger.debug(`[TranslationModeHelper] Provider does not support dictionary mode. Downgrading to selection mode.`);
      return TranslationMode.Selection;
    }
    return mode;
  }

  // 2. Perform upgrade check
  const isEligible = await isEligibleForDictionaryUpgrade(data.text, mode, data);
  if (isEligible) {
    if (checkProviderSupportsDictionary(provider)) {
      logger.debug(`[TranslationModeHelper] Upgrading ${mode} to dictionary mode for single word.`);
      return TranslationMode.Dictionary_Translation;
    } else {
      logger.debug(`[TranslationModeHelper] Single word detected, but provider does not support dictionary. Staying in ${mode}.`);
    }
  }

  return mode;
}
