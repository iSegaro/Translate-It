// src/popup/languageManager.js
import elements from "./domElements.js";
import * as uiManager from "./uiManager.js";
import { languageList } from "../utils/languages.js";
import { getTargetLanguageAsync, getSourceLanguageAsync } from "../config.js";
import { AUTO_DETECT_VALUE, getLanguageCode } from "tts-utils"; // getLanguageCode might be needed
import { logME } from "../utils/helpers.js";
import { getTranslationString } from "../utils/i18n.js";

/** Gets the language promptName from a display name/identifier. */
function getLanguagePromptName(langIdentifier) {
  if (!langIdentifier) return null;
  const trimmedIdentifier = langIdentifier.trim();
  if (trimmedIdentifier === AUTO_DETECT_VALUE) return AUTO_DETECT_VALUE;
  const lang = languageList.find(
    (l) => l.name === trimmedIdentifier || l.promptName === trimmedIdentifier
  );
  return lang ? lang.promptName || lang.name : null;
}

/** Gets the display value (promptName or name) for a language identifier. */
export function getLanguageDisplayValue(langIdentifier) {
  if (!langIdentifier || langIdentifier === AUTO_DETECT_VALUE)
    return AUTO_DETECT_VALUE;
  const lang = languageList.find(
    (l) =>
      l.code === langIdentifier ||
      l.name === langIdentifier ||
      l.promptName === langIdentifier
  );
  return lang ? lang.promptName || lang.name : "";
}

function populateLists() {
  // Populate source language select (includes auto-detect)
  languageList.forEach((lang) => {
    const optionSource = document.createElement("option");
    optionSource.value = lang.promptName || lang.name;
    optionSource.textContent = lang.promptName || lang.name;
    elements.sourceLanguageInput?.appendChild(optionSource);
  });

  // Populate target language select (excludes auto-detect)
  languageList.forEach((lang) => {
    if (lang.code !== AUTO_DETECT_VALUE) {
      const optionTarget = document.createElement("option");
      optionTarget.value = lang.promptName || lang.name;
      optionTarget.textContent = lang.promptName || lang.name;
      elements.targetLanguageInput?.appendChild(optionTarget);
    }
  });

  // Add auto-detect option to source if not present
  if (
    !languageList.some(
      (l) => l.name === AUTO_DETECT_VALUE || l.promptName === AUTO_DETECT_VALUE
    )
  ) {
    const autoOption = document.createElement("option");
    autoOption.value = AUTO_DETECT_VALUE;
    autoOption.textContent = AUTO_DETECT_VALUE;
    elements.sourceLanguageInput?.prepend(autoOption);
  }
}

async function setInitialValues() {
  elements.sourceLanguageInput.value = AUTO_DETECT_VALUE;

  try {
    const storedTargetLang = await getTargetLanguageAsync();
    elements.targetLanguageInput.value =
      getLanguageDisplayValue(storedTargetLang) ||
      getLanguageDisplayValue("en");
  } catch (err) {
    logME("[LangManager]: Error getting target language:", err);
    elements.targetLanguageInput.value = getLanguageDisplayValue("en");
  }
}

function setupEventListeners() {

  elements.swapLanguagesBtn?.addEventListener("click", async () => {
    let sourceVal = elements.sourceLanguageInput.value;
    let targetVal = elements.targetLanguageInput.value;

    let sourceCode = getLanguageCode(sourceVal);
    let targetCode = getLanguageCode(targetVal);

    let resolvedSourceCode = sourceCode;
    let resolvedTargetCode = targetCode;

    if (sourceCode === AUTO_DETECT_VALUE) {
      try {
        resolvedSourceCode = await getSourceLanguageAsync();
      } catch (err) {
        logME(
          "[LangManager]: Failed to load source language from settings",
          err
        );
      }
    }

    if (targetCode === AUTO_DETECT_VALUE) {
      try {
        resolvedTargetCode = await getTargetLanguageAsync();
      } catch (err) {
        logME(
          "[LangManager]: Failed to load target language from settings",
          err
        );
      }
    }

    if (resolvedSourceCode && resolvedTargetCode) {
      const sourceDisplay = getLanguageDisplayValue(resolvedTargetCode); // وارد Source میشه
      const targetDisplay = getLanguageDisplayValue(resolvedSourceCode); // وارد Target میشه

      elements.sourceLanguageInput.value = sourceDisplay || targetVal;
      elements.targetLanguageInput.value = targetDisplay || sourceVal;

      // const sourceContent = elements.sourceText.value;
      const targetContent = elements.translationResult.textContent;

      if (
        targetContent &&
        targetContent !==
          (await getTranslationString("popup_string_during_translate"))
      ) {
      //   elements.sourceText.value = targetContent;
      //   elements.translationResult.textContent = sourceContent;

      //   correctTextDirection(elements.sourceText, targetContent);
      //   correctTextDirection(elements.translationResult, sourceContent);

        // uiManager.toggleInlineToolbarVisibility(elements.sourceText);
        // uiManager.toggleInlineToolbarVisibility(elements.translationResult);

        // document.dispatchEvent(new CustomEvent("translationSwapped"));
      }
    } else {
      logME("[LangManager]: Cannot swap - invalid language selection.", {
        sourceCode,
        targetCode,
      });
      if (elements.swapLanguagesBtn) {
        uiManager.showVisualFeedback(elements.swapLanguagesBtn, "error", 500);
      }
    }
  });
}

export async function init() {
  populateLists();
  await setInitialValues();
  setupEventListeners();
  logME("[LangManager]: Initialized.");
}

// Export lookup function if needed by other modules (like translationManager)
export { getLanguagePromptName };
