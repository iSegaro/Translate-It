// src/utils/promptBuilder.js
import {
  getPromptAsync,
  getPromptBASESelectAsync,
  getPromptPopupTranslateAsync,
  getPromptBASEFieldAsync,
  getEnableDictionaryAsync,
  getPromptDictionaryAsync,
  TranslationMode,
} from "../config.js";
import { logME } from "./helpers.js";

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
        typeof item.text === "string"
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
 * @returns {Promise<string>} - پرامت نهایی ساخته شده.
 */
export async function buildPrompt(
  text,
  sourceLang,
  targetLang,
  translateMode = TranslationMode.Field
) {
  // دریافت پرامت تنظیم‌شده توسط کاربر
  const promptTemplate = await getPromptAsync();
  let textForTranslation = text;
  let isJsonMode = false;

  try {
    const parsedText = JSON.parse(text);
    if (isSpecificTextJsonFormat(parsedText)) {
      isJsonMode = true;
      textForTranslation = text;
    }
  } catch {
    // در صورت عدم امکان پارس، متن اصلی استفاده می‌شود
    textForTranslation = text;
  }

  // انتخاب قالب اصلی بر مبنای نوع ورودی و حالت ترجمه
  let promptBase;
  if (isJsonMode) {
    promptBase = await getPromptBASESelectAsync();
  } else {
    if (translateMode === TranslationMode.Popup_Translate) {
      promptBase = await getPromptPopupTranslateAsync();
    } else if ((await getEnableDictionaryAsync()) === true) {
      if (translateMode === TranslationMode.Dictionary_Translation) {
        promptBase = await getPromptDictionaryAsync();
      } else {
        promptBase = await getPromptBASEFieldAsync();
      }
    } else {
      promptBase = await getPromptBASEFieldAsync();
    }
  }

  // جایگزینی مقادیر متغیرهای کاربر
  const userRules = promptTemplate
    .replace(/\$_{SOURCE}/g, sourceLang)
    .replace(/\$_{TARGET}/g, targetLang);

  const baseClean = promptBase
    .replace(/\$_{SOURCE}/g, sourceLang)
    .replace(/\$_{TARGET}/g, targetLang);

  const finalPromptWithUserRules = baseClean.replace(
    /\$_{USER_RULES}/g,
    userRules
  );

  logME("Prompt : ", finalPromptWithUserRules);

  // اگر قالب نهایی شامل کلید $_{TEXT} باشد، تنها یک‌بار جایگذاری می‌کند.
  // در غیر این صورت، متن ترجمه‌شده به انتهای پرامت اضافه می‌شود.
  let finalPrompt;
  if (finalPromptWithUserRules.includes("$_{TEXT}")) {
    finalPrompt = finalPromptWithUserRules.replace(
      /\$_{TEXT}/g,
      textForTranslation
    );
  } else {
    finalPrompt = `${finalPromptWithUserRules}\n\n \`\`\` ${textForTranslation}  \`\`\` \n\n`;
  }

  return finalPrompt;
}
