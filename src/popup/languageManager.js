// src/popup/languageManager.js
import elements from "./domElements.js";
import * as uiManager from "./uiManager.js";
import { languageList } from "../utils/languages.js";
import { getTargetLanguageAsync } from "../config.js";
import { AUTO_DETECT_VALUE, getLanguageCode } from "../utils/tts.js"; // getLanguageCode might be needed
import { logME } from "../utils/helpers.js";

/** Gets the language promptName from a display name/identifier. */
function getLanguagePromptName(langIdentifier) {
  if (!langIdentifier) return null;
  const trimmedIdentifier = langIdentifier.trim();
  if (trimmedIdentifier === AUTO_DETECT_VALUE) return "auto";
  const lang = languageList.find(
    (l) => l.name === trimmedIdentifier || l.promptName === trimmedIdentifier
  );
  return lang ? lang.promptName || lang.name : null;
}

/** Gets the display value (promptName or name) for a language identifier. */
export function getLanguageDisplayValue(langIdentifier) {
  if (!langIdentifier || langIdentifier === "auto") return AUTO_DETECT_VALUE;
  const lang = languageList.find(
    (l) =>
      l.code === langIdentifier ||
      l.name === langIdentifier ||
      l.promptName === langIdentifier
  );
  return lang ? lang.promptName || lang.name : "";
}

function populateLists() {
  languageList.forEach((lang) => {
    const optionSource = document.createElement("option");
    optionSource.value = lang.promptName || lang.name;
    elements.sourceLanguagesList?.appendChild(optionSource);

    if (lang.code !== "auto") {
      const optionTarget = document.createElement("option");
      optionTarget.value = lang.promptName || lang.name;
      elements.targetLanguagesList?.appendChild(optionTarget);
    }
  });

  if (
    !languageList.some(
      (l) => l.name === AUTO_DETECT_VALUE || l.promptName === AUTO_DETECT_VALUE
    )
  ) {
    const autoOption = document.createElement("option");
    autoOption.value = AUTO_DETECT_VALUE;
    elements.sourceLanguagesList?.prepend(autoOption);
  }
}

async function setInitialValues() {
  elements.sourceLanguageInput.value = AUTO_DETECT_VALUE;
  uiManager.toggleClearButtonVisibility(
    elements.sourceLanguageInput,
    elements.clearSourceLanguage
  );

  try {
    const storedTargetLang = await getTargetLanguageAsync();
    elements.targetLanguageInput.value =
      getLanguageDisplayValue(storedTargetLang) ||
      getLanguageDisplayValue("en");
  } catch (err) {
    logME("[LangManager]: Error getting target language:", err);
    elements.targetLanguageInput.value = getLanguageDisplayValue("en");
  } finally {
    uiManager.toggleClearButtonVisibility(
      elements.targetLanguageInput,
      elements.clearTargetLanguage
    );
  }
}

function handleLanguageInputClick(inputElement) {
  inputElement?.focus();
}

function setupEventListeners() {
  elements.sourceLanguageInput?.addEventListener("click", () =>
    handleLanguageInputClick(elements.sourceLanguageInput)
  );
  elements.targetLanguageInput?.addEventListener("click", () =>
    handleLanguageInputClick(elements.targetLanguageInput)
  );

  elements.clearSourceLanguage?.addEventListener("click", () => {
    elements.sourceLanguageInput.value = "";
    uiManager.toggleClearButtonVisibility(
      elements.sourceLanguageInput,
      elements.clearSourceLanguage
    );
    elements.sourceLanguageInput.focus();
  });

  elements.clearTargetLanguage?.addEventListener("click", () => {
    elements.targetLanguageInput.value = "";
    uiManager.toggleClearButtonVisibility(
      elements.targetLanguageInput,
      elements.clearTargetLanguage
    );
    elements.targetLanguageInput.focus();
  });

  elements.sourceLanguageInput?.addEventListener("input", () =>
    uiManager.toggleClearButtonVisibility(
      elements.sourceLanguageInput,
      elements.clearSourceLanguage
    )
  );
  elements.targetLanguageInput?.addEventListener("input", () =>
    uiManager.toggleClearButtonVisibility(
      elements.targetLanguageInput,
      elements.clearTargetLanguage
    )
  );

  elements.swapLanguagesBtn?.addEventListener("click", () => {
    const sourceVal = elements.sourceLanguageInput.value;
    const targetVal = elements.targetLanguageInput.value;
    const sourceCode = getLanguageCode(sourceVal);
    const targetCode = getLanguageCode(targetVal);

    if (
      sourceCode &&
      sourceCode !== "auto" &&
      targetCode &&
      targetCode !== "auto"
    ) {
      elements.sourceLanguageInput.value = targetVal;
      elements.targetLanguageInput.value = sourceVal;
      uiManager.toggleClearButtonVisibility(
        elements.sourceLanguageInput,
        elements.clearSourceLanguage
      );
      uiManager.toggleClearButtonVisibility(
        elements.targetLanguageInput,
        elements.clearTargetLanguage
      );

      const sourceContent = elements.sourceText.value;
      const targetContent = elements.translationResult.textContent;
      if (targetContent && targetContent !== "در حال ترجمه...") {
        elements.sourceText.value = targetContent;
        elements.translationResult.textContent = sourceContent;
        uiManager.toggleInlineToolbarVisibility(elements.sourceText);
        uiManager.toggleInlineToolbarVisibility(elements.translationResult);
        // Notify clipboard manager to re-check paste button visibility
        document.dispatchEvent(new CustomEvent("translationSwapped"));
      }
    } else {
      logME("[LangManager]: Cannot swap - invalid language selection.", {
        sourceCode,
        targetCode,
      });
      if (elements.swapLanguagesBtn) {
        uiManager.showVisualFeedback(elements.swapLanguagesBtn, "error", 500); // Example feedback
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
