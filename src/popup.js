// src/popup.js
import { logME } from "./utils/helpers.js";
import { Active_SelectElement } from "./utils/helpers.popup.js";
import { languageList } from "./utils/languages.js";
import { getTargetLanguageAsync } from "./config.js";

document.addEventListener("DOMContentLoaded", async () => {
  // --- Constants ---
  const MOUSE_OVER_TIMEOUT = 1000; // زمان تاخیر برای غیرفعال کردن حالت انتخاب
  const MOUSE_LEAVE_TIMEOUT = 800; // زمان تاخیر برای بستن popup
  const AUTO_DETECT_VALUE = "Auto Detect"; // مقدار ثابت برای تشخیص خودکار

  // --- DOM Elements ---
  const form = document.getElementById("translationForm");
  const sourceText = document.getElementById("sourceText");
  const translationResult = document.getElementById("translationResult");

  // Language Controls
  const sourceLanguageInput = document.getElementById("sourceLanguageInput");
  const targetLanguageInput = document.getElementById("targetLanguageInput");
  const sourceLanguagesList = document.getElementById("sourceLanguagesList");
  const targetLanguagesList = document.getElementById("targetLanguagesList");
  const clearSourceLanguage = document.getElementById("clearSourceLanguage");
  const clearTargetLanguage = document.getElementById("clearTargetLanguage");
  const swapLanguagesBtn = document.getElementById("swapLanguagesBtn");
  const translateBtn = document.getElementById("translateBtn");

  // Inline Toolbars & Buttons
  const sourceContainer = sourceText.parentElement;
  const resultContainer = translationResult.parentElement;
  const copySourceBtn = document.getElementById("copySourceBtn");
  const pasteSourceBtn = document.getElementById("pasteSourceBtn");
  const voiceSourceIcon = document.getElementById("voiceSourceIcon"); // آیکون صدا در تولبار داخلی
  const copyTargetBtn = document.getElementById("copyTargetBtn");
  const voiceTargetIcon = document.getElementById("voiceTargetIcon"); // آیکون صدا در تولبار داخلی

  // Header Toolbar Buttons
  const translatePageIcon = document.getElementById("translatePageIcon");
  const selectElementIcon = document.getElementById("selectElementIcon");
  const clearStorageBtn = document.getElementById("clearStorageBtn"); // دکمه پاک کردن کلی در هدر

  // --- Helper Functions ---
  function toggleClearButtonVisibility(inputElement, clearButton) {
    const container = inputElement.parentElement;
    if (!container) return;
    container.classList.toggle("has-value", !!inputElement.value);
  }

  /**
   * Toggles visibility of the clear button based on input value.
   * @param {HTMLInputElement} inputElement The language input element.
   * @param {HTMLElement} clearButton The clear button element.
   */
  /**
   * Toggles visibility of the inline toolbar (excluding Paste button logic now)
   * based on content.
   * @param {HTMLTextAreaElement | HTMLElement} element The textarea or result div.
   */
  function toggleInlineToolbarVisibility(element) {
    const container = element.parentElement;
    if (!container) return;
    const text = (element.value || element.textContent || "").trim();
    // فقط در صورتی که متنی وجود دارد و متن "در حال ترجمه..." نیست، تولبار را نشان بده
    // Note: This controls the *entire* toolbar's container visibility via CSS
    // The paste button's visibility is handled separately by updatePasteButtonVisibility
    container.classList.toggle(
      "has-content",
      text && text !== "در حال ترجمه..."
    );
  }

  function getLanguageCode(langIdentifier) {
    if (!langIdentifier) return null;
    const trimmedId = langIdentifier.trim();
    if (trimmedId === AUTO_DETECT_VALUE) return "auto";
    const lang = languageList.find(
      (l) =>
        l.name === trimmedId ||
        l.promptName === trimmedId ||
        l.code === trimmedId
    );
    return lang ? lang.code : null;
  }

  /**
   * Gets the language promptName from a display name/identifier.
   * Returns 'auto' for AUTO_DETECT_VALUE.
   * @param {string} langIdentifier The display name (e.g., "Persian", "Auto Detect").
   * @returns {string | null} The language promptName or 'auto' or null if not found.
   */
  function getLanguagePromptName(langIdentifier) {
    if (!langIdentifier) return null;
    const trimmedIdentifier = langIdentifier.trim();
    if (trimmedIdentifier === AUTO_DETECT_VALUE) {
      return "auto"; // Return 'auto' specifically for auto-detect case
    }
    const lang = languageList.find(
      (l) => l.name === trimmedIdentifier || l.promptName === trimmedIdentifier
    );
    // Return promptName if found, otherwise null
    return lang ? lang.promptName || lang.name : null;
  }

  /**
   * Gets the display value (promptName or name) for a language identifier (code, name, or promptName).
   * Used to set input value from stored data.
   * @param {string} langIdentifier Code, name, or promptName.
   * @returns {string} The display value or an empty string.
   */
  function getLanguageDisplayValue(langIdentifier) {
    if (!langIdentifier || langIdentifier === "auto") return AUTO_DETECT_VALUE; // Handle 'auto' specifically for source
    const lang = languageList.find(
      (l) =>
        l.code === langIdentifier ||
        l.name === langIdentifier ||
        l.promptName === langIdentifier
    );
    // Prioritize promptName if it exists, otherwise use name
    return lang ? lang.promptName || lang.name : "";
  }

  /**
   * Gets the appropriate language code for the Speech Synthesis API.
   * @param {string} langCode The standard language code ('en', 'fa', etc.).
   * @returns {string} The speech synthesis language code ('en-US', 'fa-IR', etc.) or the original code.
   */
  function getSpeechApiLangCode(langCode) {
    if (!langCode || langCode === "auto") return null; // Cannot speak 'auto'
    const lang = languageList.find((l) => l.code === langCode);
    return lang?.speechCode || lang?.code || null; // Prefer speechCode, fallback to code
  }

  // --- Initialization Functions ---

  /**
   * Updates the Paste button visibility based on clipboard content and permissions.
   * Handles the "Document is not focused" error by retrying once on window focus.
   */
  let hasTriedUpdatingVisibilityOnFocus = false; // Flag to prevent multiple focus listeners

  async function updatePasteButtonVisibility() {
    // Always hide initially or if called again before success
    pasteSourceBtn.classList.add("hidden-by-clipboard");

    // Prevent adding multiple focus listeners if called repeatedly before focus
    if (hasTriedUpdatingVisibilityOnFocus && !document.hasFocus()) {
      logME("[Popup]: Visibility update already deferred to window focus.");
      return; // Don't try again until focus happens
    }

    try {
      // Try reading text from clipboard
      const clipboardText = await navigator.clipboard.readText();

      // If successful, reset the flag and update visibility
      hasTriedUpdatingVisibilityOnFocus = false; // Reset flag after successful read
      if (clipboardText && clipboardText.trim() !== "") {
        pasteSourceBtn.classList.remove("hidden-by-clipboard");
        logME("[Popup]: Clipboard has text, showing Paste button.");
      } else {
        logME(
          "[Popup]: Clipboard is empty or has no text, hiding Paste button."
        );
      }
    } catch (err) {
      if (
        err.name === "NotAllowedError" &&
        !document.hasFocus() &&
        !hasTriedUpdatingVisibilityOnFocus
      ) {
        // Specific error: Document not focused, and we haven't tried deferring yet
        logME(
          "[Popup]: Could not read clipboard due to lack of focus. Deferring check until window gains focus."
        );
        hasTriedUpdatingVisibilityOnFocus = true; // Set flag

        // Add a ONE-TIME listener to try again when the popup window gets focus
        window.addEventListener("focus", updatePasteButtonVisibility, {
          once: true,
        });
      } else {
        // Other errors (e.g., permission truly denied, non-text content, or focused but empty)
        logME(
          "[Popup]: Could not read clipboard (permission denied, empty, non-text, or other error). Hiding Paste button.",
          err.name,
          err.message
        );
        console.warn(
          // Keep console.warn for debugging visibility
          "[Popup]: Could not read clipboard. Hiding Paste button.",
          err.name,
          err.message
        );
        // Ensure button remains hidden in case of other errors
        pasteSourceBtn.classList.add("hidden-by-clipboard");
        // We encountered an error other than focus, reset the focus retry flag if it was set
        hasTriedUpdatingVisibilityOnFocus = false;
      }
    }
  }

  function populateLanguageLists() {
    languageList.forEach((lang) => {
      const optionSource = document.createElement("option");
      optionSource.value = lang.promptName || lang.name; // Use promptName if available
      sourceLanguagesList.appendChild(optionSource);

      // Add all languages except 'Auto Detect' to target list
      if (lang.code !== "auto") {
        const optionTarget = document.createElement("option");
        optionTarget.value = lang.promptName || lang.name;
        targetLanguagesList.appendChild(optionTarget);
      }
    });

    // Add Auto Detect separately to source list (if not already in languageList)
    if (
      !languageList.some(
        (l) =>
          l.name === AUTO_DETECT_VALUE || l.promptName === AUTO_DETECT_VALUE
      )
    ) {
      const autoOption = document.createElement("option");
      autoOption.value = AUTO_DETECT_VALUE;
      sourceLanguagesList.prepend(autoOption); // Add it at the beginning
    }

    // Set initial values
    sourceLanguageInput.value = AUTO_DETECT_VALUE;
    toggleClearButtonVisibility(sourceLanguageInput, clearSourceLanguage);

    getTargetLanguageAsync()
      .then((storedTargetLang) => {
        targetLanguageInput.value =
          getLanguageDisplayValue(storedTargetLang) ||
          getLanguageDisplayValue("en"); // Default to English display value if invalid/not found
        toggleClearButtonVisibility(targetLanguageInput, clearTargetLanguage);
      })
      .catch((err) => {
        logME("[Popup]: Error getting target language:", err);
        targetLanguageInput.value = getLanguageDisplayValue("en"); // Fallback default
        toggleClearButtonVisibility(targetLanguageInput, clearTargetLanguage);
      });
  }

  function loadInitialState() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].id != null) {
        const activeTabId = tabs[0].id;
        chrome.tabs.sendMessage(
          activeTabId,
          { action: "getSelectedText" },
          (response) => {
            const err = chrome.runtime.lastError;
            if (err) {
              logME(
                `[Popup]: Error getting selected text from tab ${activeTabId}: ${err.message}. Loading from storage instead.`
              );
              loadLastTranslationFromStorage();
            } else if (response && response.selectedText) {
              logME("[Popup]: Received selected text from content script.");
              sourceText.value = response.selectedText;
              translationResult.textContent = "";
              sourceLanguageInput.value = AUTO_DETECT_VALUE; // Reset source to Auto
              getTargetLanguageAsync()
                .then((storedTargetLang) => {
                  targetLanguageInput.value =
                    getLanguageDisplayValue(storedTargetLang) ||
                    getLanguageDisplayValue("en");
                  toggleClearButtonVisibility(
                    targetLanguageInput,
                    clearTargetLanguage
                  );
                })
                .catch((err) => {
                  logME(
                    "[Popup]: Error getting target language after selection:",
                    err
                  );
                  targetLanguageInput.value = getLanguageDisplayValue("en");
                  toggleClearButtonVisibility(
                    targetLanguageInput,
                    clearTargetLanguage
                  );
                });
              toggleClearButtonVisibility(
                sourceLanguageInput,
                clearSourceLanguage
              );
              toggleInlineToolbarVisibility(sourceText);
              toggleInlineToolbarVisibility(translationResult); // Clear result toolbar initially
              // Optionally trigger translation here if needed
            } else {
              logME(
                "[Popup]: No selected text received. Loading from storage."
              );
              loadLastTranslationFromStorage();
            }
          }
        );
      } else {
        logME(
          "[Popup]: No active tab found or tab ID is invalid. Loading from storage."
        );
        loadLastTranslationFromStorage();
      }
    });
  }

  /** Loads last translation from storage or handles selected text from the page. */
  function loadInitialState() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      // بررسی کنید که آیا تب فعال وجود دارد و ID معتبر است
      if (tabs.length > 0 && tabs[0].id != null) {
        // استفاده از != null برای پوشش undefined و null
        const activeTabId = tabs[0].id;
        chrome.tabs.sendMessage(
          activeTabId,
          { action: "getSelectedText" },
          (response) => {
            // --- بررسی خطای اتصال ---
            const err = chrome.runtime.lastError;
            if (err) {
              // اگر خطا وجود داشت (مثلا content script آماده نبود)
              logME(
                `[Popup]: Error getting selected text from tab ${activeTabId}: ${err.message}. Loading from storage instead.`
              );
              // به بارگذاری از حافظه محلی بروید
              loadLastTranslationFromStorage();
              // --- پایان بررسی خطا ---
            } else if (response && response.selectedText) {
              // اگر خطا نبود و متن انتخاب شده وجود داشت
              sourceText.value = response.selectedText;
              translationResult.textContent = "";
              // زبان مبدا را روی Auto Detect تنظیم کن
              sourceLanguageInput.value = AUTO_DETECT_VALUE;
              // زبان مقصد را از تنظیمات بگیر
              getTargetLanguageAsync()
                .then((storedTargetLang) => {
                  targetLanguageInput.value =
                    getLanguageDisplayValue(storedTargetLang) ||
                    getLanguageDisplayValue("en");
                  toggleClearButtonVisibility(
                    targetLanguageInput,
                    clearTargetLanguage
                  );
                })
                .catch((err) => {
                  // مدیریت خطای احتمالی getTargetLanguageAsync
                  logME("[Popup]: Error getting target language:", err);
                  targetLanguageInput.value = getLanguageDisplayValue("en"); // پیش فرض
                  toggleClearButtonVisibility(
                    targetLanguageInput,
                    clearTargetLanguage
                  );
                });
              toggleClearButtonVisibility(
                sourceLanguageInput,
                clearSourceLanguage
              );
              toggleInlineToolbarVisibility(sourceText);
              toggleInlineToolbarVisibility(translationResult);
            } else {
              // اگر خطا نبود ولی متن انتخاب شده هم وجود نداشت
              loadLastTranslationFromStorage();
            }
          }
        );
      } else {
        // اگر تب فعال معتبری پیدا نشد
        logME(
          "[Popup]: No active tab found or tab ID is invalid. Loading from storage."
        );
        loadLastTranslationFromStorage();
      }
    });
  }

  /** Loads the last translation details from chrome.storage.local. */
  function loadLastTranslationFromStorage() {
    chrome.storage.local.get(["lastTranslation"], async (result) => {
      let targetLangValue = "";
      if (result.lastTranslation) {
        logME("[Popup]: Loading last translation from storage.");
        sourceText.value = result.lastTranslation.sourceText || "";
        translationResult.textContent =
          result.lastTranslation.translatedText || "";
        sourceLanguageInput.value =
          getLanguageDisplayValue(result.lastTranslation.sourceLanguage) ||
          AUTO_DETECT_VALUE;
        targetLangValue = getLanguageDisplayValue(
          result.lastTranslation.targetLanguage
        );
      } else {
        logME("[Popup]: No last translation found in storage.");
      }

      if (!targetLangValue) {
        try {
          const storedTargetLang = await getTargetLanguageAsync();
          targetLangValue =
            getLanguageDisplayValue(storedTargetLang) ||
            getLanguageDisplayValue("en");
        } catch (err) {
          logME(
            "[Popup]: Error getting default target language for storage load:",
            err
          );
          targetLangValue = getLanguageDisplayValue("en");
        }
      }
      targetLanguageInput.value = targetLangValue;

      toggleClearButtonVisibility(sourceLanguageInput, clearSourceLanguage);
      toggleClearButtonVisibility(targetLanguageInput, clearTargetLanguage);
      toggleInlineToolbarVisibility(sourceText);
      toggleInlineToolbarVisibility(translationResult);
    });
  }

  // --- Event Listeners ---

  // Form Submission (Translate Button Click)
  form.addEventListener("submit", (event) => {
    // async را حذف می‌کنیم چون از callback استفاده می‌کنیم
    event.preventDefault();
    logME("[Popup]: Translation form submitted.");

    const textToTranslate = sourceText.value.trim();
    // مقدار زبان مقصد را مستقیما از اینپوت میخوانیم
    const targetLangIdentifier = targetLanguageInput.value.trim();
    const sourceLangIdentifier = sourceLanguageInput.value.trim();

    // --- Validation ---
    if (!textToTranslate) {
      sourceText.focus();
      logME("[Popup]: No text to translate.");
      return;
    }
    // چک میکنیم که زبان مقصد خالی نباشد
    if (!targetLangIdentifier) {
      logME("[Popup]: Missing target language identifier.");
      targetLanguageInput.focus();
      // TODO: Add user feedback (e.g., highlight input)
      return;
    }
    // (اختیاری ولی توصیه شده) چک کنیم آیا زبان مقصد معتبر است یا auto نیست
    const targetLangCodeCheck = getLanguagePromptName(targetLangIdentifier);
    if (!targetLangCodeCheck || targetLangCodeCheck === "auto") {
      logME(
        "[Popup]: Invalid target language selected: ",
        targetLangIdentifier
      );
      targetLanguageInput.focus();
      // TODO: Add user feedback
      return;
    }

    // Source Language Validation
    let sourceLangCheck = getLanguagePromptName(sourceLangIdentifier);
    if (!sourceLangCheck || sourceLangCheck === "auto") {
      sourceLangCheck = null;
    }
    // --- End Validation ---

    translationResult.textContent = "در حال ترجمه...";
    // مخفی کردن تولبار نتیجه در زمان لودینگ (این قسمت را می‌توان حفظ کرد)
    resultContainer.classList.remove("has-content");

    try {
      // --- بازگرداندن منطق ارسال پیام به حالت قدیمی ---
      chrome.runtime.sendMessage(
        {
          action: "fetchTranslation",
          payload: {
            promptText: textToTranslate,
            sourceLanguage: sourceLangCheck,
            targetLanguage: targetLangIdentifier,
          },
        },
        (response) => {
          logME(
            "[Popup]: Received translation response from background:",
            response
          );

          // ابتدا خطای زمان اجرا در callback را بررسی کنید (مهم)
          if (chrome.runtime.lastError) {
            logME(
              "[Popup]: Chrome runtime error during translation response:",
              chrome.runtime.lastError.message
            );
            translationResult.textContent = `خطا: ${chrome.runtime.lastError.message}`;
            // نمایش مجدد تولبار نتیجه در صورت خطا
            toggleInlineToolbarVisibility(translationResult);
            return; // خروج از callback
          }

          // بررسی پاسخ با ساختار قدیمی
          if (response?.data && response.data.translatedText) {
            translationResult.textContent = response.data.translatedText; // خواندن از مسیر قدیمی

            // ذخیره در storage (با فرض اینکه ساختار ذخیره سازی تغییر نکرده)
            // برای ذخیره سازی ممکن است به کد زبان نیاز باشد
            const sourceLangIdentifier = sourceLanguageInput.value;
            const sourceLangCode = getLanguageCode(sourceLangIdentifier);
            const targetLangCode = getLanguageCode(targetLangIdentifier); // کد زبان مقصد برای ذخیره

            chrome.storage.local.set(
              {
                lastTranslation: {
                  sourceText: textToTranslate,
                  translatedText: response.data.translatedText,
                  // تصمیم بگیرید چه چیزی برای زبان مبدا ذخیره شود
                  sourceLanguage: sourceLangCode || "auto", // کد انتخاب شده یا 'auto'
                  targetLanguage: targetLangCode, // کد زبان مقصد
                },
              },
              () => {
                logME("[Popup]: Last translation saved to storage.");
              }
            );

            // (اختیاری) آپدیت زبان مبدا اگر Auto بود و زبان تشخیص داده شده توسط بک‌اند برگردانده شده بود
            // این قسمت بستگی دارد که آیا نسخه قدیمی بک‌اند زبان مبدا را برمیگرداند یا نه
            // if (getLanguageCode(sourceLanguageInput.value) === 'auto' && response.data.detectedSourceLang) {
            //     const detectedLangDisplay = getLanguageDisplayValue(response.data.detectedSourceLang);
            //     if(detectedLangDisplay){
            //         sourceLanguageInput.value = detectedLangDisplay;
            //         toggleClearButtonVisibility(sourceLanguageInput, clearSourceLanguage);
            //     }
            // }
          } else {
            // مدیریت خطای ترجمه با ساختار قدیمی
            translationResult.textContent =
              response?.error || "ترجمه با خطا مواجه شد."; // خواندن خطا از مسیر قدیمی
            logME("[Popup]: Translation failed:", response?.error);
          }

          // نمایش مجدد تولبار نتیجه بعد از اتمام کار (موفق یا ناموفق)
          toggleInlineToolbarVisibility(translationResult);
        } // پایان callback
      ); // پایان sendMessage
    } catch (error) {
      // این catch فقط خطاهای همگام قبل از ارسال پیام را می‌گیرد
      logME("[Popup]: Synchronous error before sending message:", error);
      translationResult.textContent = "خطا در آماده سازی درخواست ترجمه.";
      // نمایش مجدد تولبار نتیجه در صورت خطا
      toggleInlineToolbarVisibility(translationResult);
    }
  }); // پایان addEventListener

  // Language Input Click (Optional: Helps show datalist)
  function handleLanguageInputClick(inputElement) {
    // Simple focus is usually enough to trigger datalist
    inputElement.focus();
    // const currentValue = inputElement.value;
    // inputElement.value = '';
    // inputElement.dispatchEvent(new Event('input'));
    // setTimeout(() => { inputElement.value = currentValue; }, 10);
  }
  sourceLanguageInput.addEventListener("click", () =>
    handleLanguageInputClick(sourceLanguageInput)
  );
  targetLanguageInput.addEventListener("click", () =>
    handleLanguageInputClick(targetLanguageInput)
  );

  // Clear Language Buttons
  clearSourceLanguage.addEventListener("click", () => {
    sourceLanguageInput.value = "";
    toggleClearButtonVisibility(sourceLanguageInput, clearSourceLanguage);
    sourceLanguageInput.focus();
  });
  clearTargetLanguage.addEventListener("click", () => {
    targetLanguageInput.value = "";
    toggleClearButtonVisibility(targetLanguageInput, clearTargetLanguage);
    targetLanguageInput.focus();
  });

  // Show/Hide Clear Button on Input Change
  sourceLanguageInput.addEventListener("input", () =>
    toggleClearButtonVisibility(sourceLanguageInput, clearSourceLanguage)
  );
  targetLanguageInput.addEventListener("input", () =>
    toggleClearButtonVisibility(targetLanguageInput, clearTargetLanguage)
  );

  // Swap Languages Button
  swapLanguagesBtn.addEventListener("click", () => {
    const sourceVal = sourceLanguageInput.value;
    const targetVal = targetLanguageInput.value;
    const sourceCode = getLanguageCode(sourceVal); // Need code for validation
    const targetCode = getLanguageCode(targetVal);

    // Allow swap only if source is NOT auto and target IS valid
    if (
      sourceCode &&
      sourceCode !== "auto" &&
      targetCode &&
      targetCode !== "auto"
    ) {
      sourceLanguageInput.value = targetVal;
      targetLanguageInput.value = sourceVal;
      toggleClearButtonVisibility(sourceLanguageInput, clearSourceLanguage);
      toggleClearButtonVisibility(targetLanguageInput, clearTargetLanguage);
      // Swap text content as well
      const sourceContent = sourceText.value;
      const targetContent = translationResult.textContent;
      if (targetContent && targetContent !== "در حال ترجمه...") {
        sourceText.value = targetContent;
        translationResult.textContent = sourceContent; // Keep original source in result temporarily
        toggleInlineToolbarVisibility(sourceText);
        toggleInlineToolbarVisibility(translationResult);
        updatePasteButtonVisibility(); // Check clipboard again after potential copy
      }
    } else if (sourceCode === "auto") {
      logME("[Popup]: Cannot swap 'Auto Detect'.");
      // Optional: Provide user feedback (e.g., slight button shake)
    } else {
      logME("[Popup]: Cannot swap - invalid language selection.");
    }
  });

  // Show/Hide Inline Toolbars on Text Change (maintains original logic for copy/voice)
  sourceText.addEventListener("input", () =>
    toggleInlineToolbarVisibility(sourceText)
  );
  // translationResult visibility is handled after translation response & swap

  // --- Inline Toolbar Button Listeners ---

  // Copy Source Text
  copySourceBtn.addEventListener("click", () => {
    if (sourceText.value) {
      navigator.clipboard
        .writeText(sourceText.value)
        .then(() => {
          logME("[Popup]: Source text copied!");
          // **Show Paste button after successful copy**
          pasteSourceBtn.classList.remove("hidden-by-clipboard");
          // TODO: Visual feedback (e.g., temporary checkmark)
        })
        .catch((err) => {
          logME("[Popup]: Failed to copy source text: ", err);
          // TODO: Visual error feedback
        });
    }
  });

  // Paste into Source Text (Action)
  pasteSourceBtn.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        sourceText.value = text;
        // Trigger necessary updates after paste
        sourceText.dispatchEvent(new Event("input", { bubbles: true })); // For toolbar visibility
        sourceText.focus();
        // Optionally trigger translation automatically after paste
        // translateBtn.click(); // Or form.requestSubmit();
      }
      // Re-check clipboard state *after* paste attempt (in case it failed or was empty)
      // Although usually after a paste, the clipboard remains the same until next copy.
      await updatePasteButtonVisibility();
    } catch (err) {
      logME("[Popup]: Failed to paste text: ", err);
      // TODO: Visual feedback for error
      // Hide paste button again if reading failed (e.g., permission revoked mid-session)
      pasteSourceBtn.classList.add("hidden-by-clipboard");
    }
  });

  // Copy Target Text
  copyTargetBtn.addEventListener("click", () => {
    const text = translationResult.textContent;
    if (text && text !== "در حال ترجمه...") {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          logME("[Popup]: Target text copied!");
          // **Show Paste button after successful copy**
          pasteSourceBtn.classList.remove("hidden-by-clipboard");
          // TODO: Visual feedback
        })
        .catch((err) => {
          logME("[Popup]: Failed to copy target text: ", err);
          // TODO: Visual error feedback
        });
    }
  });

  // Voice Source
  voiceSourceIcon.addEventListener("click", () => {
    const text = sourceText.value.trim();
    if (!text) {
      sourceText.focus();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    const sourceLangIdentifier = sourceLanguageInput.value;
    const sourceLangCode = getLanguageCode(sourceLangIdentifier);
    const speechLang = getSpeechApiLangCode(sourceLangCode); // Expects a function like 'en' -> 'en-US'

    if (speechLang) {
      utterance.lang = speechLang;
    }
    // else: let browser guess if 'auto' or invalid

    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  });

  // Voice Target
  voiceTargetIcon.addEventListener("click", () => {
    const text = translationResult.textContent?.trim();
    if (!text || text === "در حال ترجمه...") {
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    const targetLangIdentifier = targetLanguageInput.value;
    const targetLangCode = getLanguageCode(targetLangIdentifier);
    const speechLang = getSpeechApiLangCode(targetLangCode);

    if (speechLang) {
      utterance.lang = speechLang;
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    } else {
      logME(
        `[Popup]: Cannot speak target: Invalid language ${targetLangIdentifier} (Code: ${targetLangCode})`
      );
      // Optional: Fallback or user feedback
    }
  });

  // --- Header Toolbar Button Listeners ---

  // Clear Storage Button (Clear Text Fields & Storage)
  clearStorageBtn.addEventListener("click", () => {
    chrome.storage.local.remove("lastTranslation", () => {
      sourceText.value = "";
      translationResult.textContent = "";
      toggleInlineToolbarVisibility(sourceText);
      toggleInlineToolbarVisibility(translationResult);
      // Reset languages to default
      sourceLanguageInput.value = AUTO_DETECT_VALUE;
      getTargetLanguageAsync()
        .then((lang) => {
          targetLanguageInput.value =
            getLanguageDisplayValue(lang) || getLanguageDisplayValue("en");
          toggleClearButtonVisibility(targetLanguageInput, clearTargetLanguage);
        })
        .catch(() => {
          targetLanguageInput.value = getLanguageDisplayValue("en"); // Fallback
          toggleClearButtonVisibility(targetLanguageInput, clearTargetLanguage);
        });
      toggleClearButtonVisibility(sourceLanguageInput, clearSourceLanguage);

      sourceText.focus();
      logME("[Popup]: Translation history and fields cleared.");
      updatePasteButtonVisibility(); // Re-check clipboard after clearing
    });
  });

  // Translate Entire Page Button
  translatePageIcon.addEventListener("click", () => {
    chrome.runtime.sendMessage(
      { action: "translateEntirePage" },
      (response) => {
        if (chrome.runtime.lastError) {
          logME(
            "[Popup]: Error sending translate page message:",
            chrome.runtime.lastError.message
          );
        } else {
          logME("[Popup]: Translate page message sent.", response);
        }
      }
    );
    window.close();
  });

  // Select Element Button
  let selectElementIconClicked = false; // Flag remains local
  selectElementIcon.addEventListener("click", () => {
    selectElementIconClicked = true;
    Active_SelectElement(true, true); // Activate selection mode and close popup
    // No need to manually close here, Active_SelectElement handles it
  });

  // --- Popup Auto-Close/Interaction Logic ---
  const popupContainer = document.body;
  let popupMouseLeaveTimer;
  let popupInteractionTimer; // Renamed from selectElementTimeout

  popupContainer.addEventListener("mouseenter", () => {
    clearTimeout(popupMouseLeaveTimer);
    selectElementIconClicked = false; // Reset flag
  });

  popupContainer.addEventListener("mouseleave", () => {
    clearTimeout(popupMouseLeaveTimer);
    // Get current state *directly* before setting timeout
    chrome.storage.local.get(["selectElementState"], (result) => {
      // Only close if element selection mode IS currently active
      if (result.selectElementState) {
        logME(
          "[Popup]: Mouse left while select mode active, starting close timer."
        );
        popupMouseLeaveTimer = setTimeout(() => {
          logME("[Popup]: Closing popup due to mouse leave timeout.");
          window.close();
        }, MOUSE_LEAVE_TIMEOUT);
      } else {
        logME("[Popup]: Mouse left, but select mode not active. Not closing.");
      }
    });
  });

  function handlePopupInteraction() {
    if (selectElementIconClicked) return; // Don't deactivate if click was the interaction

    clearTimeout(popupInteractionTimer);
    popupInteractionTimer = setTimeout(() => {
      logME(
        "[Popup]: User interacted with popup (mouseover/mousedown), deactivating select mode."
      );
      Active_SelectElement(false); // Deactivate element selection mode
    }, MOUSE_OVER_TIMEOUT); // Deactivate after a delay
  }

  popupContainer.addEventListener("mouseover", handlePopupInteraction);

  popupContainer.addEventListener("mousedown", (event) => {
    // Prevent deactivation if the click target was the select icon itself
    if (event.target === selectElementIcon) {
      logME(
        "[Popup]: Mousedown on select icon, preventing immediate deactivation."
      );
      return;
    }

    clearTimeout(popupInteractionTimer); // Cancel delayed deactivation
    if (!selectElementIconClicked) {
      logME(
        "[Popup]: Mousedown interaction, deactivating select mode immediately."
      );
      Active_SelectElement(false);
    }
    // Reset flag after first interaction (if needed, maybe not necessary here)
    // setTimeout(() => { selectElementIconClicked = false; }, 50);
  });

  // --- Initial Setup Calls ---
  populateLanguageLists(); // Setup language dropdowns first
  loadInitialState(); // Load selected text or last translation
  await updatePasteButtonVisibility(); // <<--- Check clipboard and set paste button visibility
  Active_SelectElement(true, false); // Activate selection mode on initial load (don't close popup yet)
}); // End DOMContentLoaded
