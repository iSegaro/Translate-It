// src/utils/localization.js

import Browser from "webextension-polyfill";
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
  const languages =
    Array.isArray(languagesData) ? languagesData : Object.values(languagesData);
  // فقط زبان‌هایی که flag دارند را انتخاب می‌کنیم
  const filtered = languages.filter((lang) => lang.flag);

  const ul = document.createElement("ul");
  ul.classList.add("language-list");
  Object.assign(ul.style, {
    listStyle: "none",
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    padding: "0",
  });

  filtered.forEach((lang) => {
    const li = document.createElement("li");
    li.dataset.locale = lang.locale;
    Object.assign(li.style, {
      cursor: "pointer",
      padding: "5px 10px",
      border: "1px solid #ccc",
      borderRadius: "4px",
      display: "flex",
      alignItems: "center",
      background: "#fff",
    });
    li.innerHTML = `<span style=\"margin-right:5px;\">${lang.flag}</span>${lang.name}`;

    li.addEventListener("click", async () => {
      await setLanguage(lang.locale);
      // Visual feedback
      ul.querySelectorAll("li").forEach(
        (item) => (item.style.background = "#fff")
      );
      li.style.background = "#e2e6ea";
      // Persist selection
      // ذخیره زبان انتخاب‌شده برای لوکالایز
      await Browser.storage.local.set({ APPLICATION_LOCALIZE: lang.locale });
    });

    ul.appendChild(li);
  });

  localizationContainer.appendChild(ul);
}

// تابع تنظیم زبان (برای ادغام با سیستم i18n یا هر منطق دلخواه)
// این تابع زبان انتخاب‌شده را در استوریج ذخیره می‌کند
/**
 * Applies localization to the page based on the given locale code.
 * @param {string} locale Two-letter locale code, e.g., 'en', 'fa'.
 */
async function setLanguage(locale) {
  try {
    logME("Changing language to:", locale);
    await app_localize(locale);
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

// Listen for storage changes to APPLICATION_LOCALIZE and reapply localization
Browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.APPLICATION_LOCALIZE) {
    const newLocale = changes.APPLICATION_LOCALIZE.newValue;
    setLanguage(newLocale);
  }
});
