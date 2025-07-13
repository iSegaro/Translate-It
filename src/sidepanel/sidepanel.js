// src/sidepanel/sidepanel.js
import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";
import { CONFIG, getSettingsAsync } from "../config.js";
import DOMPurify from "dompurify";
import { marked } from "marked";

// Import utilities
import { app_localize_popup } from "../utils/i18n.js";
import { applyTheme } from "../utils/theme.js";
import { openOptionsPage } from "../utils/helpers.js";
import {
  getLanguagePromptName,
  getLanguageDisplayValue,
} from "../popup/languageManager.js";
import { languageList } from "../utils/languages.js";
import { getTargetLanguageAsync } from "../config.js";
import { getLanguageCode, AUTO_DETECT_VALUE } from "../utils/tts.js";
import {
  correctTextDirection,
  applyElementDirection,
} from "../utils/textDetection.js";
import { TranslationMode } from "../config.js";
import { getTranslationString, parseBoolean } from "../utils/i18n.js";
import { getErrorMessageByKey } from "../services/ErrorMessages.js";
import { determineTranslationMode } from "../utils/translationModeHelper.js";

// DOM Elements
const elements = {
  sourceLanguageInput: null,
  targetLanguageInput: null,
  sourceLanguagesList: null,
  targetLanguagesList: null,
  swapLanguagesBtn: null,
  sourceText: null,
  translationResult: null,
  translateBtn: null,
  selectElementBtn: null,
  revertActionBtn: null,
  clearFieldsBtn: null,
  settingsBtn: null,
  translationForm: null,
};

/**
 * Sends a message to the background script to deactivate the element selection mode.
 */
async function deactivateSelectElementMode() {
  try {
    await Browser.runtime.sendMessage({
      action: "activateSelectElementMode",
      data: false,
    });
  } catch (error) {
    logME("[SidePanel] Failed to send deactivation message:", error);
  }
}

/**
 * Initializes all DOM element references.
 */
function initializeElements() {
  elements.sourceLanguageInput = document.getElementById("sourceLanguageInput");
  elements.targetLanguageInput = document.getElementById("targetLanguageInput");
  elements.sourceLanguagesList = document.getElementById("sourceLanguagesList");
  elements.targetLanguagesList = document.getElementById("targetLanguagesList");
  elements.swapLanguagesBtn = document.getElementById("swapLanguagesBtn");
  elements.sourceText = document.getElementById("sourceText");
  elements.translationResult = document.getElementById("translationResult");
  elements.translateBtn = document.getElementById("translateBtn");
  elements.selectElementBtn = document.getElementById("selectElementBtn");
  elements.revertActionBtn = document.getElementById("revertActionBtn");
  elements.clearFieldsBtn = document.getElementById("clearFieldsBtn");
  elements.settingsBtn = document.getElementById("settingsBtn");
  elements.translationForm = document.getElementById("translationForm");
}

/**
 * Populates language datalists and sets initial values.
 */
async function initializeLanguages() {
  try {
    if (elements.sourceLanguagesList && elements.targetLanguagesList) {
      elements.sourceLanguagesList.innerHTML = "";
      elements.targetLanguagesList.innerHTML = "";

      const autoOption = document.createElement("option");
      autoOption.value = AUTO_DETECT_VALUE;
      elements.sourceLanguagesList.appendChild(autoOption);

      languageList.forEach((lang) => {
        const sourceOption = document.createElement("option");
        sourceOption.value = lang.promptName || lang.name;
        elements.sourceLanguagesList.appendChild(sourceOption);

        if (lang.code !== AUTO_DETECT_VALUE) {
          const targetOption = document.createElement("option");
          targetOption.value = lang.promptName || lang.name;
          elements.targetLanguagesList.appendChild(targetOption);
        }
      });
    }

    const settings = await getSettingsAsync();
    elements.sourceLanguageInput.value = AUTO_DETECT_VALUE;
    elements.targetLanguageInput.value =
      getLanguageDisplayValue(settings.TARGET_LANGUAGE) || "English";
  } catch (error) {
    logME("[SidePanel] Error initializing languages:", error);
  }
}

function extractErrorMessage(err) {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (err._originalMessage && typeof err._originalMessage === "string")
    return err._originalMessage;
  if (typeof err.message === "string") return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return "";
  }
}

async function handleTranslationResponse(
  response,
  textToTranslate,
  sourceLangIdentifier,
  targetLangIdentifier
) {
  if (Browser.runtime.lastError) {
    elements.translationResult.textContent = Browser.runtime.lastError.message;
    return;
  }

  if (response?.success && response.data?.translatedText) {
    const translated = response.data.translatedText;
    const rawHtml = marked.parse(translated);
    const sanitized = DOMPurify.sanitize(rawHtml, {
      RETURN_TRUSTED_TYPE: true,
    });
    const parser = new DOMParser();
    const doc = parser.parseFromString(sanitized.toString(), "text/html");

    elements.translationResult.textContent = "";
    Array.from(doc.body.childNodes).forEach((node) =>
      elements.translationResult.appendChild(node)
    );
    correctTextDirection(elements.translationResult, translated);

    const sourceLangCode = getLanguageCode(sourceLangIdentifier);
    const targetLangCode = getLanguageCode(targetLangIdentifier);

    Browser.storage.local
      .set({
        lastTranslation: {
          sourceText: textToTranslate,
          translatedText: translated,
          sourceLanguage: sourceLangCode || AUTO_DETECT_VALUE,
          targetLanguage: targetLangCode,
        },
      })
      .catch((error) => logME("[SidePanel] Error saving translation:", error));

    if (
      response.data.detectedSourceLang &&
      (!sourceLangCode || sourceLangCode === AUTO_DETECT_VALUE)
    ) {
      const detectedDisplay = getLanguageDisplayValue(
        response.data.detectedSourceLang
      );
      if (detectedDisplay) elements.sourceLanguageInput.value = detectedDisplay;
    }
  } else {
    const fallback =
      (await getTranslationString("popup_string_translate_error_response")) ||
      "(⚠️ An error occurred during translation.)";
    let msg = extractErrorMessage(response?.error) || fallback;
    const error_msg = getErrorMessageByKey(msg);
    if (error_msg) msg = error_msg;
    elements.translationResult.textContent = msg;
    correctTextDirection(elements.translationResult, msg);
  }
}

async function triggerTranslation() {
  const textToTranslate = elements.sourceText.value.trim();
  const targetLangIdentifier = elements.targetLanguageInput.value.trim();
  const sourceLangIdentifier = elements.sourceLanguageInput.value.trim();

  if (!textToTranslate) return elements.sourceText.focus();
  if (!targetLangIdentifier) return elements.targetLanguageInput.focus();

  const targetLangCodeCheck = getLanguagePromptName(targetLangIdentifier);
  if (!targetLangCodeCheck || targetLangCodeCheck === AUTO_DETECT_VALUE)
    return elements.targetLanguageInput.focus();

  let sourceLangCheck = getLanguagePromptName(sourceLangIdentifier);
  if (!sourceLangCheck || sourceLangCheck === AUTO_DETECT_VALUE)
    sourceLangCheck = null;

  elements.translationResult.textContent = "Translating...";
  correctTextDirection(elements.sourceText, textToTranslate);
  applyElementDirection(
    elements.translationResult,
    parseBoolean(await getTranslationString("IsRTL"))
  );

  const translateMode = determineTranslationMode(
    textToTranslate,
    TranslationMode.Popup_Translate
  );

  try {
    const response = await Browser.runtime.sendMessage({
      action: "fetchTranslation",
      payload: {
        promptText: textToTranslate,
        sourceLanguage: sourceLangCheck,
        targetLanguage: targetLangCodeCheck,
        translateMode,
      },
    });
    await handleTranslationResponse(
      response,
      textToTranslate,
      sourceLangIdentifier,
      targetLangIdentifier
    );
  } catch (error) {
    const fallback =
      (await getTranslationString("popup_string_translate_error_trigger")) ||
      "(⚠️ An error occurred.)";
    const errMsg = extractErrorMessage(error) || fallback;
    elements.translationResult.textContent = errMsg;
    correctTextDirection(elements.translationResult, errMsg);
  }
}

let selectElementDebounceTimer = null;

/**
 * Sets up all event listeners for the side panel.
 */
function setupEventListeners() {
  document.addEventListener("click", (event) => {
    if (event.target.closest("#selectElementBtn")) {
      return;
    }
    deactivateSelectElementMode();
  });

  elements.translationForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    triggerTranslation();
  });

  elements.sourceText?.addEventListener("keydown", (event) => {
    const isModifierPressed = event.ctrlKey || event.metaKey;
    const isEnterKey = event.key === "Enter";
    const isSlashKey = event.key === "/";
    if (isModifierPressed && (isEnterKey || isSlashKey)) {
      event.preventDefault();
      triggerTranslation();
    }
  });

  elements.swapLanguagesBtn?.addEventListener("click", async () => {
    const currentSource = elements.sourceLanguageInput.value;
    const currentTarget = elements.targetLanguageInput.value;
    if (currentSource === AUTO_DETECT_VALUE) return;
    elements.sourceLanguageInput.value = currentTarget;
    elements.targetLanguageInput.value = currentSource;
    const targetLangCode = getLanguageCode(currentSource);
    if (targetLangCode) {
      await Browser.storage.local.set({ targetLanguage: targetLangCode });
    }
    if (elements.translationResult.textContent && elements.sourceText.value) {
      const tempText = elements.sourceText.value;
      elements.sourceText.value = elements.translationResult.textContent;
      elements.translationResult.textContent = tempText;
    }
  });

  elements.selectElementBtn?.addEventListener("click", async () => {
    if (selectElementDebounceTimer) return;
    logME(
      "[SidePanel] Select element button clicked, sending activation message."
    );
    selectElementDebounceTimer = setTimeout(() => {
      selectElementDebounceTimer = null;
    }, 500);
    try {
      await Browser.runtime.sendMessage({
        action: "activateSelectElementMode",
        data: true,
      });
    } catch (error) {
      logME(
        "[SidePanel] Error sending activateSelectElementMode message:",
        error
      );
    }
  });

  elements.revertActionBtn?.addEventListener("click", () => {
    Browser.runtime
      .sendMessage({ action: "revertTranslation" })
      .catch((err) => logME("[SidePanel] Could not send revert message:", err));
  });

  elements.clearFieldsBtn?.addEventListener("click", () => {
    Browser.storage.local
      .remove("lastTranslation")
      .then(async () => {
        elements.sourceText.value = "";
        elements.translationResult.textContent = "";
        elements.sourceLanguageInput.value = AUTO_DETECT_VALUE;
        try {
          const settings = await getSettingsAsync();
          elements.targetLanguageInput.value = getLanguageDisplayValue(
            settings.TARGET_LANGUAGE
          );
        } catch {
          elements.targetLanguageInput.value = getLanguageDisplayValue("en");
        }
        elements.sourceText.focus();
      })
      .catch((error) => logME("[SidePanel] Error clearing fields:", error));
  });

  elements.settingsBtn?.addEventListener("click", () => {
    openOptionsPage();
  });

  Browser.runtime.onMessage.addListener((message) => {
    if (message.action === "selectedTextForSidePanel") {
      elements.sourceText.value = message.text;
      triggerTranslation();
    }
  });
}

/**
 * Loads the last translation from storage.
 */
async function loadLastTranslation() {
  try {
    const result = await Browser.storage.local.get("lastTranslation");
    if (result.lastTranslation) {
      const { sourceText, translatedText, sourceLanguage, targetLanguage } =
        result.lastTranslation;
      if (sourceText) {
        elements.sourceText.value = sourceText;
        correctTextDirection(elements.sourceText, sourceText);
      }
      if (translatedText) {
        const rawHtml = marked.parse(translatedText);
        const sanitized = DOMPurify.sanitize(rawHtml, {
          RETURN_TRUSTED_TYPE: true,
        });
        const parser = new DOMParser();
        const doc = parser.parseFromString(sanitized.toString(), "text/html");
        elements.translationResult.textContent = "";
        Array.from(doc.body.childNodes).forEach((node) =>
          elements.translationResult.appendChild(node)
        );
        correctTextDirection(elements.translationResult, translatedText);
      }
      if (sourceLanguage) {
        const sourceLangDisplay = getLanguageDisplayValue(sourceLanguage);
        if (sourceLangDisplay)
          elements.sourceLanguageInput.value = sourceLangDisplay;
      }
      if (targetLanguage) {
        const targetLangDisplay = getLanguageDisplayValue(targetLanguage);
        if (targetLangDisplay)
          elements.targetLanguageInput.value = targetLangDisplay;
      }
    }
  } catch (error) {
    logME("[SidePanel] Error loading last translation:", error);
  }
}

// Main initialization
document.addEventListener("DOMContentLoaded", async () => {
  logME("[SidePanel] ✅ Side Panel loaded.");

  await deactivateSelectElementMode();

  try {
    initializeElements();
    await initializeLanguages();
    setupEventListeners();
    await loadLastTranslation();

    // Apply initial theme and localization
    const settings = await getSettingsAsync();
    applyTheme(settings.THEME);
    app_localize_popup(settings.APPLICATION_LOCALIZE);

    logME("[SidePanel] Initialization complete");
  } catch (error) {
    logME("[SidePanel] Error during initialization:", error);
    const safeHtml = DOMPurify.sanitize(
      `<div style="padding: 10px; color: red;">Failed to initialize side panel. Please try reloading.</div>`,
      { RETURN_TRUSTED_TYPE: true }
    );
    const parser = new DOMParser();
    const doc = parser.parseFromString(safeHtml.toString(), "text/html");
    document.body.textContent = "";
    Array.from(doc.body.childNodes).forEach((node) =>
      document.body.appendChild(node)
    );
  }
});

// --- Listen for settings changes from other parts of the extension ---
Browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  // Check for theme changes
  if (changes.THEME) {
    const newTheme = changes.THEME.newValue;
    logME(`[SidePanel] Theme changed to: ${newTheme}. Applying...`);
    applyTheme(newTheme);
  }

  // Check for localization changes
  if (changes.APPLICATION_LOCALIZE) {
    const newLocale = changes.APPLICATION_LOCALIZE.newValue;
    logME(`[SidePanel] Localization changed to: ${newLocale}. Applying...`);
    app_localize_popup(newLocale);
  }
});
