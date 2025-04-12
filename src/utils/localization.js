// src/utils/localization.js

import Browser from "webextension-polyfill";
import { languageList as languagesData } from "./languages.js";
import { app_localize } from "./i18n.js";
import { logME } from "./helpers.js";

document.addEventListener("DOMContentLoaded", () => {
  const localizationContainer = document.querySelector(".localization");

  if (localizationContainer) {
    // اگر languagesData یک آرایه نباشد، آن را به آرایه تبدیل می‌کنیم
    const languages =
      Array.isArray(languagesData) ? languagesData : (
        Object.values(languagesData)
      );
    // فقط زبان‌هایی که flag دارند را انتخاب می‌کنیم
    const filteredLanguages = languages.filter((lang) => lang.flag);

    const ul = document.createElement("ul");
    ul.classList.add("language-list");
    ul.style.listStyle = "none";
    ul.style.display = "flex";
    ul.style.flexWrap = "wrap";
    ul.style.gap = "10px";
    ul.style.padding = "0";

    filteredLanguages.forEach((lang) => {
      const li = document.createElement("li");
      li.dataset.locale = lang.locale;
      li.style.cursor = "pointer";
      li.style.padding = "5px 10px";
      li.style.border = "1px solid #ccc";
      li.style.borderRadius = "4px";
      li.style.display = "flex";
      li.style.alignItems = "center";
      li.style.background = "#fff";
      li.innerHTML = `<span style="margin-right: 5px;">${lang.flag}</span> ${lang.name}`;

      li.addEventListener("click", async () => {
        await setLanguage(lang.locale);
        // تنظیم رنگ پس‌زمینه برای انتخاب بصری
        document.querySelectorAll(".language-list li").forEach((item) => {
          item.style.background = "#fff";
        });
        li.style.background = "#e2e6ea";

        // ذخیره زبان انتخاب‌شده برای لوکالایز
        await Browser.storage.local.set({
          APPLICATION_LOCALIZE: lang.locale,
        });
      });

      ul.appendChild(li);
    });

    localizationContainer.appendChild(ul);
  }
});

// تابع تنظیم زبان (برای ادغام با سیستم i18n یا هر منطق دلخواه)
async function setLanguage(locale) {
  logME("تغییر زبان به:", locale);
  await app_localize(locale);
}
