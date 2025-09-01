// src/utils/promptBuilder.js
import {
  getPromptAsync,
  getPromptBASESelectAsync,
  getPromptPopupTranslateAsync,
  getPromptBASEFieldAsync,
  getPromptBASESubtitleAsync,
  getEnableDictionaryAsync,
  getPromptDictionaryAsync,
  getPromptBASEBatchAsync, // Import the new getter
  TranslationMode,
} from "@/shared/config/config.js";

import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'promptBuilder');


/**
 * بررسی می‌کند که آیا آبجکت ورودی مطابق با فرمت JSON خاص است
 * (آرایه‌ای از آبجکت‌ها که هر کدام دارای ویژگی text به‌صورت رشته هستند).
 *
 * @param {any} obj - آبجکت مورد بررسی.
 * @returns {boolean}
 */
function isSpecificTextJsonFormat(obj) {
  return (
    Array.isArray(obj) &&
    obj.length > 0 &&
    obj.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof item.text === "string",
    )
  );
}

/**
 * ساخت پرامت نهایی بر اساس ورودی، زبان‌ها و حالت ترجمه.
 *
 * @param {string} text - متنی که باید ترجمه شود.
 * @param {string} sourceLang - زبان مبدا.
 * @param {string} targetLang - زبان مقصد.
 * @param {string} [translateMode=TranslationMode.Field] - حالت ترجمه (مانند Popup_Translate، Dictionary_Translation، و غیره).
 * @param {string} [providerType='translate'] - The type of the provider ('ai' or 'translate').
 * @returns {Promise<string>} - پرامت نهایی ساخته شده.
 */
export async function buildPrompt(
  text,
  sourceLang,
  targetLang,
  translateMode = TranslationMode.Field
) {
  let isJsonMode = false;
  try {
    const parsedText = JSON.parse(text);
    if (isSpecificTextJsonFormat(parsedText)) {
      isJsonMode = true;
    }
  } catch {
    // Not JSON
  }

  // If mode is Select_Element and text is NOT JSON,
  // it means it's a pre-processed batch of texts. Use the batch prompt.
  if (translateMode === TranslationMode.Select_Element && !isJsonMode) {
    logger.debug('AI provider in Select Element mode (batch). Using batch prompt.');
    const batchPromptTemplate = await getPromptBASEBatchAsync();
    return batchPromptTemplate
      .replace(/\$_{TARGET}/g, targetLang)
      .replace(/\$_{TEXT}/g, text);
  }

  // For other cases, select the base prompt accordingly.
  let promptBase;
  if (isJsonMode) {
    // This handles reliable AI providers in Select_Element mode, as they get raw JSON.
    promptBase = await getPromptBASESelectAsync();
  } else if (translateMode === TranslationMode.Subtitle) {
    promptBase = await getPromptBASESubtitleAsync();
  } else if (
    translateMode === TranslationMode.Popup_Translate ||
    translateMode === TranslationMode.Sidepanel_Translate
  ) {
    promptBase = await getPromptPopupTranslateAsync();
  } else if (await getEnableDictionaryAsync() && translateMode === TranslationMode.Dictionary_Translation) {
    promptBase = await getPromptDictionaryAsync();
  } else {
    // Fallback for simple field translation or other modes.
    promptBase = await getPromptBASEFieldAsync();
  }

  // Now, build the final prompt by injecting languages and user rules.
  const promptTemplate = await getPromptAsync();
  
  // IMPORTANT: The placeholder format is $_{VAR}, not ${\\_\_VAR}.
  const userRules = promptTemplate
    .replace(/\$_{SOURCE}/g, sourceLang)
    .replace(/\$_{TARGET}/g, targetLang);

  let finalPromptWithUserRules = promptBase
    .replace(/\$_{SOURCE}/g, sourceLang)
    .replace(/\$_{TARGET}/g, targetLang)
    .replace(/\$_{USER_RULES}/g, userRules);

  // Inject the actual text to be translated.
  let finalPrompt;
  if (finalPromptWithUserRules.includes("$_{TEXT}")) {
    finalPrompt = finalPromptWithUserRules.replace(
      /\$_{TEXT}/g,
      text,
    );
    logger.debug('Final prompt with TEXT replacement:', finalPrompt);
  } else {
    finalPrompt = `${finalPromptWithUserRules}\n\n${text}\n\n`;
    logger.debug('Final prompt with appended text:', finalPrompt);
  }

  return finalPrompt;
}
