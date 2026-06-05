import {
  getBilingualTranslationEnabledAsync,
  getBilingualTranslationModesAsync,
  TranslationMode,
} from "@/shared/config/config.js";

/**
 * Determines whether bilingual auto-prompt behavior is enabled for the current mode.
 * This is used to guard prompt templates that contain reverse-translation semantics.
 *
 * @param {string} translateMode - Current translation mode.
 * @returns {Promise<boolean>}
 */
export async function isBilingualAutoPromptEnabledAsync(translateMode) {
  const [bilingualEnabled, bilingualModes] = await Promise.all([
    getBilingualTranslationEnabledAsync(),
    getBilingualTranslationModesAsync(),
  ]);

  if (!bilingualEnabled) return false;

  if (!translateMode) return true;

  let isModeEnabled = bilingualModes?.[translateMode] === true;

  // Backward compatibility: keep honoring the legacy field key if present.
  if (!isModeEnabled && translateMode === TranslationMode.Field && bilingualModes?.field === true) {
    isModeEnabled = true;
  }

  return isModeEnabled;
}

/**
 * Returns true only when the request is using auto source language
 * and bilingual behavior is allowed for the current mode.
 *
 * @param {string} sourceLang - Current source language code.
 * @param {string} translateMode - Current translation mode.
 * @returns {Promise<boolean>}
 */
export async function shouldUseAutoPromptAsync(sourceLang, translateMode) {
  if (sourceLang !== "auto") return false;
  return await isBilingualAutoPromptEnabledAsync(translateMode);
}
