// src/popup.js
import { logME } from "./utils/helpers.js";
import { Active_SelectElement } from "./utils/helpers.popup.js";
import { languageList } from "./utils/languages.js";
import { getTargetLanguageAsync } from "./config.js";

document.addEventListener("DOMContentLoaded", () => {
  const MOUSE_OVER_TIMEOUT = 1000; // زمان تاخیر برای غیرفعال کردن حالت انتخاب
  const MOUSE_LEAVE_TIMEOUT = 800; // زمان تاخیر برای بستن popup
  const form = document.getElementById("translationForm");
  const sourceText = document.getElementById("sourceText");
  const translationResult = document.getElementById("translationResult");
  const targetLanguageInput = document.getElementById("targetLanguage");
  const allLanguagesDatalist = document.getElementById("allLanguages");
  const voiceSourceIcon = document.getElementById("voiceSourceIcon");
  const voiceTargetIcon = document.getElementById("voiceTargetIcon");
  const translatePageIcon = document.getElementById("translatePageIcon");
  const selectElementIcon = document.getElementById("selectElementIcon");
  const clearIcon = document.getElementById("clearStorageBtn");
  const clearTargetLanguageBtn = document.getElementById("clearTargetLanguage"); // دریافت دکمه ضربدر

  /** لود کردن آخرین ترجمه ذخیره شده */
  const loadLastTranslation = async () => {
    chrome.storage.local.get(["lastTranslation"], async (result) => {
      if (result.lastTranslation) {
        sourceText.value = result.lastTranslation.sourceText || "";
        translationResult.textContent =
          result.lastTranslation.translatedText || "";
        targetLanguageInput.value =
          result.lastTranslation.targetLanguage ||
          (await getTargetLanguageAsync());
      } else {
        targetLanguageInput.value = await getTargetLanguageAsync();
      }
    });
  };

  // بررسی متن انتخاب شده و نمایش آن در صورت وجود
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: "getSelectedText" },
        (response) => {
          if (response && response.selectedText) {
            sourceText.value = response.selectedText;
            translationResult.textContent = ""; // پاک کردن ترجمه قبلی
            targetLanguageInput.value = ""; // پاک کردن زبان هدف قبلی (اختیاری)
            getTargetLanguageAsync().then((lang) => {
              if (!targetLanguageInput.value) {
                targetLanguageInput.value = lang;
              }
            });
          } else {
            loadLastTranslation();
          }
        }
      );
    } else {
      loadLastTranslation();
    }
  });

  /** کمبوباکس زبان */
  // ایجاد گزینه‌های datalist زبان به صورت پویا
  languageList.forEach((language) => {
    const option = document.createElement("option");
    option.textContent = language.name; // نمایش نام زبان در لیست
    option.value = language.promptName || language.name; // مقدار promptName به عنوان value
    allLanguagesDatalist.appendChild(option);
  });

  // نمایش تمام زبان‌ها هنگام کلیک شدن روی input
  targetLanguageInput.addEventListener("click", () => {
    const currentValue = targetLanguageInput.value;
    targetLanguageInput.value = "";
    targetLanguageInput.dispatchEvent(new Event("input"));
    setTimeout(() => {
      targetLanguageInput.value = currentValue;
    }, 10);
  });

  // پاک کردن مقدار کمبوباکس زبان با کلیک روی ضربدر
  clearTargetLanguageBtn.addEventListener("click", () => {
    targetLanguageInput.value = "";
    targetLanguageInput.focus();
  });

  // *** مکانیزم مربوط به مخفی شدن و یا ظاهر شدن Popup ***
  const popupContainer = document.body;
  let selectElementIconClicked = false; // اضافه کردن پرچم

  let popupMouseLeaveTimer;
  let popupInteractionTimer;

  // وقتی موس وارد popup می‌شود، تایمر بسته شدن لغو شود
  popupContainer.addEventListener("mouseenter", () => {
    clearTimeout(popupMouseLeaveTimer);
    selectElementIconClicked = false; // ریست کردن پرچم
  });

  // وقتی موس از داخل popup خارج شود، در صورتی که حالت انتخاب فعال باشد، بعد از 2 ثانیه popup بسته شود
  popupContainer.addEventListener("mouseleave", async () => {
    clearTimeout(popupMouseLeaveTimer);
    const result = await chrome.storage.local.get(["selectElementState"]);
    if (result.selectElementState) {
      popupMouseLeaveTimer = setTimeout(() => {
        window.close();
      }, MOUSE_LEAVE_TIMEOUT); // زمان تاخیر برای بستن popup
    }
  });

  // اگر موس روی popup بماند یا کلیک شود، حالت انتخاب المنت غیرفعال شود
  popupContainer.addEventListener("mouseover", () => {
    if (!selectElementIconClicked) {
      // بررسی پرچم
      clearTimeout(popupInteractionTimer);
      popupInteractionTimer = setTimeout(() => {
        Active_SelectElement(false);
      }, MOUSE_OVER_TIMEOUT); // زمان تاخیر برای غیرفعال کردن حالت انتخاب
    }
  });

  popupContainer.addEventListener("click", () => {
    if (!selectElementIconClicked) {
      // بررسی پرچم
      clearTimeout(popupInteractionTimer);
      Active_SelectElement(false);
    }
  });
  // *** پایان مکانیزم مخفی شدن و یا نمایش دادن Popup ***

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = sourceText.value.trim();
    if (!text) {
      sourceText.focus();
      return;
    }
    translationResult.textContent = "در حال ترجمه...";
    chrome.runtime.sendMessage(
      {
        action: "fetchTranslation",
        payload: {
          promptText: text,
          targetLanguage: targetLanguageInput.value,
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
    /**
     * مکانیزم نمایش و یا مخفی شدن popup در صورتی که موس روی آن نبود
     * باعث ایجاد تداخل با کلیک روی آیکون انتخاب المنت می‌شود
     * و در نتیجه باعث می‌شود رویداد فعال سازی مجدد حالت انتخاب المنت
     * به درستی کار نکند.
     * بنابرین یک فلگش با نام selectElementIconClicked اضافه می‌شود
     * که در صورت کلیک روی آیکون انتخاب المنت، این پرچم true می‌شود
     * و در رویدادهای دیگر کلیک روی popup، این پرچم بررسی میشود قبل از اعمال رویدادهای خود
     */
    selectElementIconClicked = true; // تنظیم پرچم
    Active_SelectElement(true, true); // فعالسازی حالت انتخاب المنت و بستن popup
  });

  // دکمه حذف داده‌ها از Storage - Clear Fields
  clearIcon.addEventListener("click", () => {
    chrome.storage.local.remove("lastTranslation", () => {
      sourceText.value = "";
      translationResult.textContent = "";
      sourceText.focus();
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
    if (sourceText.value.trim() === "") {
      sourceText.focus();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(sourceText.value);
    utterance.lang = "auto" || "en-US"; // تنظیم زبان مبدا
    speechSynthesis.speak(utterance);
  });

  voiceTargetIcon.addEventListener("click", () => {
    const resultText = translationResult.textContent;
    if (!resultText) {
      return;
    }
    const utterance = new SpeechSynthesisUtterance(resultText);
    // یافتن کد زبان متناظر با نام زبان انتخاب شده
    const selectedLanguage = languageList.find(
      (lang) => lang.promptName === targetLanguageInput.value
    );
    utterance.lang = selectedLanguage ? selectedLanguage.code : "en-US"; // استفاده از کد زبان یا انگلیسی به عنوان پیش فرض
    speechSynthesis.speak(utterance);
  });
});
