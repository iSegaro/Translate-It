// src/utils/localization.js

import browser from "webextension-polyfill";
import { languageList as languagesData } from "./languages.js";
import { app_localize } from "./i18n.js";
import { logME } from "./helpers.js";

/**
 * Initializes the language selection UI and handles dynamic localization.
 */
function initLocalizationUI() {
  const localizationContainer = document.querySelector(".localization");
  if (!localizationContainer) return;

  // Prepare language list
  const languages = Array.isArray(languagesData)
    ? languagesData
    : Object.values(languagesData);

  // 1. فیلتر کردن بر اساس وجود 'flagCode'
  const filtered = languages.filter((lang) => lang.flagCode);
  const ul = document.createElement("ul");
  ul.classList.add("language-list");

  filtered.forEach((lang) => {
    const li = document.createElement("li");
    li.dataset.locale = lang.locale;
    li.classList.add("language-list-item");

    // 2. ایجاد تگ <img> برای نمایش پرچم
    const img = document.createElement("img");
    img.className = "language-flag-image"; // استفاده از کلاسی که در CSS تعریف کردیم
    img.src = browser.runtime.getURL(`icons/flags/${lang.flagCode}.svg`);
    img.alt = `${lang.name} flag`; // برای دسترسی‌پذیری بهتر

    li.appendChild(img); // ابتدا تصویر پرچم اضافه می‌شود

    li.appendChild(document.createTextNode(lang.name));

    li.addEventListener("click", async () => {
      await setLanguage(lang.locale);
      // Visual feedback
      ul.querySelectorAll(".language-list-item").forEach((item) => {
        item.classList.remove("selected");
      });
      li.classList.add("selected");
      // Persist selection
      // ذخیره زبان انتخاب‌شده برای لوکالایز
      await browser.storage.local.set({ APPLICATION_LOCALIZE: lang.locale });
    });

    ul.appendChild(li);
  });

  localizationContainer.appendChild(ul);
}

// تابع تنظیم زبان (برای ادغام با سیستم i18n یا هر منطق دلخواه)
// این تابع زبان انتخاب‌شده را در استوریج ذخیره می‌کند
/**
 * Applies localization and notifies the background script to update UI elements like context menus.
 * @param {string} locale Two-letter locale code, e.g., 'en', 'fa'.
 */
async function setLanguage(locale) {
  try {
    logME("Changing language to:", locale);
    await app_localize(locale);

    // --- Send a message to the background script to refresh context menus ---
    logME(
      "[localization] Sending message to refresh context menus for locale:",
      locale,
    );
    browser.runtime
      .sendMessage({ action: "REFRESH_CONTEXT_MENUS" })
      .catch((err) =>
        logME("Error sending REFRESH_CONTEXT_MENUS message:", err.message),
      );
  } catch (err) {
    logME("[localization] setLanguage error:", err);
  }
}

// Initialize on load
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLocalizationUI, {
      once: true,
    });
  } else {
    initLocalizationUI();
  }
}

// Listen for storage changes to reapply localization if changed from another context
browser.storage.onChanged.addListener.call(
  browser.storage.onChanged,
  (changes, area) => {
    if (area === "local" && changes.APPLICATION_LOCALIZE) {
      const newLocale = changes.APPLICATION_LOCALIZE.newValue;
      // We call app_localize directly here instead of setLanguage to avoid a message loop
      app_localize(newLocale);
    }
  },
);
