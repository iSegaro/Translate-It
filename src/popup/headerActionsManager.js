// src/popup/headerActionsManager.js
import elements from "./domElements.js";
import { Active_SelectElement } from "../utils/select_element.js";
import { AUTO_DETECT_VALUE, getLanguageCode } from "../utils/tts.js";
import { getTargetLanguageAsync } from "../config.js";
import { getLanguageDisplayValue } from "./languageManager.js";
import * as uiManager from "./uiManager.js";
import * as clipboardManager from "./clipboardManager.js"; // To update paste button
import { logME, openOptionsPage } from "../utils/helpers.js";

// Keep flags related to header actions local if possible
let selectElementIconClicked = false;

function setupEventListeners() {
  elements.clearStorageBtn?.addEventListener("click", () => {
    chrome.storage.local.remove("lastTranslation", async () => {
      elements.sourceText.value = "";
      elements.translationResult.textContent = "";
      uiManager.toggleInlineToolbarVisibility(elements.sourceText);
      uiManager.toggleInlineToolbarVisibility(elements.translationResult);

      // Reset languages
      elements.sourceLanguageInput.value = AUTO_DETECT_VALUE;
      try {
        const lang = await getTargetLanguageAsync();
        elements.targetLanguageInput.value =
          getLanguageDisplayValue(lang) || getLanguageDisplayValue("en");
      } catch {
        elements.targetLanguageInput.value = getLanguageDisplayValue("en");
      } finally {
        uiManager.toggleClearButtonVisibility(
          elements.targetLanguageInput,
          elements.clearTargetLanguage
        );
      }
      uiManager.toggleClearButtonVisibility(
        elements.sourceLanguageInput,
        elements.clearSourceLanguage
      );

      elements.sourceText.focus();
      logME("[HeaderActions]: Translation history and fields cleared.");
      clipboardManager.updatePasteButtonVisibility(); // Re-check clipboard
    });
  });

  elements.translatePageLink?.addEventListener("click", () => {
    logME(
      "[HeaderActions]: Translate page icon clicked - using Google Translate tab."
    );

    // 1. دریافت زبان مقصد از Input مربوطه در Popup
    const targetLangIdentifier = elements.targetLanguageInput.value;
    let targetLangCode = getLanguageCode(targetLangIdentifier); // تبدیل نام نمایشی به کد زبان (مثلاً 'fa')

    // 2. اعتبارسنجی زبان مقصد
    if (!targetLangCode || targetLangCode === "auto") {
      logME(
        `[HeaderActions]: Invalid target language for page translation: '${targetLangIdentifier}'. Defaulting to 'en'.`
      );
      targetLangCode = "en"; // اگر زبان مقصد نامعتبر یا 'auto' بود، به انگلیسی پیش‌فرض برمی‌گردیم
      // می‌توانید به کاربر فیدبک دهید که زبان پیش‌فرض استفاده شد
      // uiManager.showVisualFeedback(elements.targetLanguageInput.parentElement, 'warning', 1500);
    }

    // 3. دریافت URL تب فعال فعلی
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      // بررسی خطای احتمالی در دریافت اطلاعات تب
      if (chrome.runtime.lastError) {
        logME(
          "[HeaderActions]: Error querying active tab:",
          chrome.runtime.lastError.message
        );
        // بستن پاپ‌آپ در صورت خطا
        window.close();
        return;
      }

      // بررسی وجود تب فعال و URL معتبر
      if (tabs.length > 0 && tabs[0]?.url) {
        const currentTabUrl = tabs[0].url;

        // بررسی اینکه آیا URL قابل ترجمه است (نباید chrome://, file:// و ... باشد)
        if (!currentTabUrl.startsWith("http")) {
          logME(
            `[HeaderActions]: Cannot translate non-HTTP(S) URL: ${currentTabUrl}`
          );
          // می‌توانید به کاربر اطلاع دهید که این صفحه قابل ترجمه نیست
          // alert("This page protocol cannot be translated by Google Translate.");
          window.close();
          return;
        }

        // 4. ساخت URL گوگل ترنسلیت برای ترجمه صفحه
        // فرمت: https://translate.google.com/translate?sl=auto&tl=<target_lang>&u=<original_page_url>
        const encodedUrl = encodeURIComponent(currentTabUrl); // حتماً URL اصلی را encode کنید
        const googleTranslateUrl = `https://translate.google.com/translate?sl=auto&tl=${targetLangCode}&u=${encodedUrl}`;

        logME(
          `[HeaderActions]: Opening Google Translate for page: ${googleTranslateUrl}`
        );

        // 5. باز کردن URL ساخته شده در یک تب جدید
        chrome.tabs.create({ url: googleTranslateUrl });

        // 6. بستن پنجره Popup
        window.close();
      } else {
        logME("[HeaderActions]: No active tab found or URL is missing.");
        // بستن پاپ‌آپ حتی اگر تبی پیدا نشد
        window.close();
      }
    });
  });

  // Event listener برای باز کردن صفحه Options
  elements.settingsIcon?.addEventListener("click", () => {
    logME("[Popup]: Opening options page.");
    openOptionsPage();
  });

  elements.selectElementIcon?.addEventListener("click", () => {
    selectElementIconClicked = true; // Set flag for interaction manager
    logME("[HeaderActions]: Select element icon clicked.");
    Active_SelectElement(true, true); // Activate selection mode and close popup
    // Active_SelectElement should handle closing the window implicitly
  });
}

export function init() {
  setupEventListeners();
  logME("[HeaderActions]: Initialized.");
}

// Export flag if popupInteractionManager needs to read it directly (though events might be better)
// This approach is simpler for now:
export function wasSelectElementIconClicked() {
  const wasClicked = selectElementIconClicked;
  // Optionally reset flag after checking if needed by the logic
  // selectElementIconClicked = false;
  return wasClicked;
}
