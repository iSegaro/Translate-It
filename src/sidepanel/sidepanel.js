// src/sidepanel/sidepanel.js
import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";
import { getSettingsAsync, getSourceLanguageAsync } from "../config.js";
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

import {
  toggleInlineToolbarVisibility,
  showVisualFeedback,
} from "./uiManager.js";
import { initClipboard } from "./clipboardManager.js";
import { initTts } from "./ttsManager.js";

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
  copySourceBtn: null,
  pasteSourceBtn: null,
  voiceSourceIcon: null,
  copyTargetBtn: null,
  voiceTargetIcon: null,
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
 * بخش نتیجه را پاک کرده و یک انیمیشن اسپینر در آن نمایش می‌دهد.
 */
function showSpinner() {
  if (!elements.translationResult) return;
  elements.translationResult.classList.remove('fade-in'); // حذف انیمیشن قبلی
  elements.translationResult.innerHTML = `
    <div class="spinner-center">
        <div class="spinner"></div>
    </div>
  `;
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
  elements.copySourceBtn = document.getElementById("copySourceBtn");
  elements.pasteSourceBtn = document.getElementById("pasteSourceBtn");
  elements.voiceSourceIcon = document.getElementById("voiceSourceIcon");
  elements.copyTargetBtn = document.getElementById("copyTargetBtn");
  elements.voiceTargetIcon = document.getElementById("voiceTargetIcon");
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

  elements.translationResult.innerHTML = '';

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

    // elements.translationResult.textContent = "";
    Array.from(doc.body.childNodes).forEach((node) =>
      elements.translationResult.appendChild(node)
    );
    elements.translationResult.classList.add('fade-in');
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

  elements.translationResult.textContent = "";
  showSpinner();
  correctTextDirection(elements.sourceText, textToTranslate);
  applyElementDirection(
    elements.translationResult,
    parseBoolean(await getTranslationString("IsRTL"))
  );

  const translateMode = determineTranslationMode(
    textToTranslate,
    TranslationMode.Sidepanel_Translate
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
    elements.translationResult.innerHTML = '';
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

  const sourceContainer = elements.sourceText.parentElement;
  const resultContainer = elements.translationResult.parentElement;

  elements.sourceText.addEventListener("input", () => {
    toggleInlineToolbarVisibility(sourceContainer);
  });

  const observer = new MutationObserver(() => {
    toggleInlineToolbarVisibility(resultContainer);
  });
  observer.observe(elements.translationResult, {
    childList: true,
    characterData: true,
    subtree: true,
  });

  initClipboard(elements);
  initTts(elements);

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
    let sourceVal = elements.sourceLanguageInput.value;
    let targetVal = elements.targetLanguageInput.value;

    let sourceCode = getLanguageCode(sourceVal);
    let targetCode = getLanguageCode(targetVal);

    let resolvedSourceCode = sourceCode;
    let resolvedTargetCode = targetCode;

    // اگر زبان مبدأ "Auto-Detect" باشد، سعی می‌کنیم آن را از تنظیمات ذخیره‌شده‌ی کاربر بخوانیم
    if (sourceCode === AUTO_DETECT_VALUE) {
      try {
        // getSourceLanguageAsync از فایل config.js باید import شده باشد
        resolvedSourceCode = await getSourceLanguageAsync();
      } catch (err) {
        logME("[SidePanel]: Failed to load source language from settings", err);
        resolvedSourceCode = null; // در صورت خطا، آن را ناموفق علامت‌گذاری می‌کنیم
      }
    }

    // این بخش برای اطمینان از استحکام کد است، هرچند "Auto-Detect" نباید در لیست زبان‌های مقصد باشد
    if (targetCode === AUTO_DETECT_VALUE) {
      try {
        // getTargetLanguageAsync از فایل config.js باید import شده باشد
        resolvedTargetCode = await getTargetLanguageAsync();
      } catch (err) {
        logME("[SidePanel]: Failed to load target language from settings", err);
        resolvedTargetCode = null;
      }
    }
    
    // تنها در صورتی که هر دو زبان مبدأ و مقصد مشخص و معتبر باشند، عملیات را ادامه می‌دهیم
    if (
      resolvedSourceCode &&
      resolvedTargetCode &&
      resolvedSourceCode !== AUTO_DETECT_VALUE
    ) {
      // نام نمایشی زبان‌ها را برای مقادیر جدید دریافت می‌کنیم
      const newSourceDisplay = getLanguageDisplayValue(resolvedTargetCode); // زبان مبدأ جدید، همان زبان مقصد قبلی است
      const newTargetDisplay = getLanguageDisplayValue(resolvedSourceCode); // زبان مقصد جدید، همان زبان مبدأ قبلی است

      // مقادیر input ها را با نام‌های نمایشی جدید تنظیم می‌کنیم
      elements.sourceLanguageInput.value = newSourceDisplay || targetVal;
      elements.targetLanguageInput.value = newTargetDisplay || sourceVal;

      // // --- شروع بخش جابجایی محتوا و بروزرسانی UI ---
      // const sourceContent = elements.sourceText.value;
      // const targetContent = elements.translationResult.textContent;

      // if (targetContent && targetContent.trim() !== "") {
      //   // 1. جابجایی محتوای متنی
      //   elements.sourceText.value = targetContent;
      //   elements.translationResult.textContent = sourceContent;

      //   // 2. اصلاح جهت نوشتار (ltr/rtl)
      //   correctTextDirection(elements.sourceText, targetContent);
      //   correctTextDirection(elements.translationResult, sourceContent);

      //   // 3. بروزرسانی نمایش نوار ابزار داخلی
      //   toggleInlineToolbarVisibility(elements.sourceText.parentElement);
      //   toggleInlineToolbarVisibility(elements.translationResult.parentElement);
      // }
    } else {
      // اگر زبان‌ها به درستی مشخص نشده باشند، یک بازخورد خطا به کاربر نمایش می‌دهیم
      logME("[SidePanel] Cannot swap - invalid language selection.", {
        resolvedSourceCode,
        resolvedTargetCode,
      });
      if (elements.swapLanguagesBtn) {
        showVisualFeedback(elements.swapLanguagesBtn, "error", 800);
      }
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
        // بروزرسانی نوار ابزارها پس از پاک کردن
        toggleInlineToolbarVisibility(sourceContainer);
        toggleInlineToolbarVisibility(resultContainer);
      })
      .catch((error) => logME("[SidePanel] Error clearing fields:", error));
  });

  elements.settingsBtn?.addEventListener("click", () => {
    openOptionsPage();
  });

  Browser.runtime.onMessage.addListener((message) => {
    if (message.action === "selectedTextForSidePanel") {
      elements.sourceText.value = message.text;
      toggleInlineToolbarVisibility(sourceContainer); // بروزرسانی پس از دریافت متن
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

      // After loading, update toolbars visibility
      toggleInlineToolbarVisibility(elements.sourceText.parentElement);
      toggleInlineToolbarVisibility(elements.translationResult.parentElement);
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
    // await loadLastTranslation();

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
