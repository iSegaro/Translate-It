// src/popup.js
import { logME } from "./utils/helpers.js";
import { Active_SelectElement } from "./utils/helpers.popup.js";
import { languageList } from "./utils/languages.js";
import { getTargetLanguageAsync } from "./config.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("translationForm");
  const sourceText = document.getElementById("sourceText");
  const translationResult = document.getElementById("translationResult");
  const targetLanguageSelect = document.getElementById("targetLanguage");
  const voiceSourceIcon = document.getElementById("voiceSourceIcon");
  const voiceTargetIcon = document.getElementById("voiceTargetIcon");
  const translatePageIcon = document.getElementById("translatePageIcon");
  const selectElementIcon = document.getElementById("selectElementIcon");
  const clearIcon = document.getElementById("clearStorageBtn");
  const allLanguagesDatalist = document.getElementById("allLanguages");

  /** لود کردن آخرین ترجمه ذخیره شده */
  chrome.storage.local.get(["lastTranslation"], async (result) => {
    if (result.lastTranslation) {
      sourceText.value = result.lastTranslation.sourceText || "";
      translationResult.textContent =
        result.lastTranslation.translatedText || "";
      targetLanguageSelect.value =
        result.lastTranslation.targetLanguage ||
        (await getTargetLanguageAsync());
    } else {
      targetLanguageSelect.value = await getTargetLanguageAsync();
    }
  });

  /** کمبوباکس زبان */
  // ایجاد گزینه‌های datalist زبان به صورت پویا
  languageList.forEach((language) => {
    const option = document.createElement("option");
    option.value = language;
    allLanguagesDatalist.appendChild(option);
  });

  allLanguagesDatalist.addEventListener("change", (e) => {
    translationResult.textContent = e.target.value;
    targetLanguageSelect.value = e.target.value;
  });

  /**
   * مکانیزم مربوط به مخفی شدن و یا ظاهر شدن popup
   */
  const popupContainer = document.body;

  let popupMouseLeaveTimer;
  let popupInteractionTimer;

  // وقتی موس وارد popup می‌شود، تایمر بسته شدن لغو شود
  popupContainer.addEventListener("mouseenter", () => {
    clearTimeout(popupMouseLeaveTimer);
    // اگر نیاز به تغییر وضعیت انتخاب المنت بعد از مدت زمان معین دارید، می‌توانید اینجا اجرا کنید
  });

  // وقتی موس از داخل popup خارج شود، در صورتی که حالت انتخاب فعال باشد، بعد از 2 ثانیه popup بسته شود
  popupContainer.addEventListener("mouseleave", async () => {
    clearTimeout(popupMouseLeaveTimer);
    const result = await chrome.storage.local.get(["selectElementState"]);
    if (result.selectElementState) {
      popupMouseLeaveTimer = setTimeout(() => {
        window.close();
      }, 2000);
    }
  });

  // اگر موس روی popup بماند یا کلیک شود، حالت انتخاب المنت غیرفعال شود
  popupContainer.addEventListener("mouseover", () => {
    clearTimeout(popupInteractionTimer);
    popupInteractionTimer = setTimeout(() => {
      Active_SelectElement(false);
    }, 3000);
  });

  popupContainer.addEventListener("click", () => {
    clearTimeout(popupInteractionTimer);
    Active_SelectElement(false);
  });
  /** پایان مکانیزم مخفی شدن و یا نمایش دادن Popup */

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = sourceText.value.trim();
    if (!text) return;
    translationResult.textContent = "در حال ترجمه...";
    chrome.runtime.sendMessage(
      {
        action: "fetchTranslation",
        payload: {
          promptText: text,
          targetLanguage: targetLanguageSelect.value,
        },
      },
      (response) => {
        if (response?.data) {
          translationResult.textContent = response.data.translatedText;
        } else {
          translationResult.textContent = response?.error || "خطا در ترجمه";
        }
      }
    );
  });

  Active_SelectElement(true); // فعالسازی حالت انتخاب المنت در بارگذاری افزونه

  // دکمه فعالسازی حالت انتخاب المنت
  selectElementIcon.addEventListener("click", () => {
    Active_SelectElement(true);
    window.close(); // بستن Popup
  });

  // دکمه حذف داده‌ها از Storage - Clear Fields
  clearIcon.addEventListener("click", () => {
    chrome.storage.local.remove("lastTranslation", () => {
      sourceText.value = "";
      translationResult.textContent = "";
    });
  });

  translatePageIcon.addEventListener("click", () => {
    chrome.runtime.sendMessage(
      { action: "translateEntirePage" },
      (response) => {
        logME("ترجمه کل صفحه اجرا شد", response);
      }
    );
    window.close(); // بستن Popup
  });

  // استفاده از آیکون‌های صوتی با Web Speech API
  voiceSourceIcon.addEventListener("click", () => {
    const utterance = new SpeechSynthesisUtterance(sourceText.value);
    utterance.lang = "en-US"; // تنظیم زبان مبدا
    speechSynthesis.speak(utterance);
  });

  voiceTargetIcon.addEventListener("click", () => {
    const resultText = translationResult.textContent;
    const utterance = new SpeechSynthesisUtterance(resultText);
    utterance.lang = targetLanguageSelect.value === "fa" ? "fa-IR" : "en-US";
    speechSynthesis.speak(utterance);
  });
});
