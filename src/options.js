// src/options.js
import Browser from "webextension-polyfill";
import { getSettingsAsync, CONFIG } from "./config.js";
import { ErrorHandler, ErrorTypes } from "./services/ErrorService.js";
import { logME } from "./utils/helpers.js";
import { app_localize, getTranslationString } from "./utils/i18n.js";
import { fadeOutInElement } from "./utils/i18n.helper.js";
import { shouldInject } from "./utils/injector.js";
import "./utils/localization.js";

document.addEventListener("DOMContentLoaded", () => {
  const tabButtons = document.querySelectorAll(".tab-button");
  const tabContents = document.querySelectorAll(".tab-content");

  const errorHandler = new ErrorHandler(); // ایجاد یک نمونه از ErrorHandler

  // Elements for Tab Navigation
  const languagesTabButton = document.querySelector('[data-tab="languages"]');
  const apiSettingsTabButton = document.querySelector(
    '[data-tab="apiSettings"]'
  );
  const importExportTabButton = document.querySelector(
    '[data-tab="importExport"]'
  );
  const languagesTabContent = document.getElementById("languages");
  const apiSettingsTabContent = document.getElementById("apiSettings");
  const importExportTabContent = document.getElementById("importExport");

  // Elements for Language Tab - Activation Settings
  const extensionEnabledCheckbox = document.getElementById("extensionEnabled");

  const translateOnTextFieldsCheckbox = document.getElementById(
    "translateOnTextFields"
  );
  const enableShortcutForTextFieldsCheckbox = document.getElementById(
    "enableShortcutForTextFields"
  );
  const textFieldShortcutGroup = document.getElementById(
    "textFieldShortcutGroup"
  );

  const translateWithSelectElementCheckbox = document.getElementById(
    "translateWithSelectElement"
  );

  const translateOnTextSelectionCheckbox = document.getElementById(
    "translateOnTextSelection"
  );
  const requireCtrlForTextSelectionCheckbox = document.getElementById(
    "requireCtrlForTextSelection"
  );
  const textSelectionCtrlGroup = document.getElementById(
    "textSelectionCtrlGroup"
  );

  const enableDictionraryCheckbox =
    document.getElementById("enableDictionrary");

  // Elements for API Settings
  const translationApiSelect = document.getElementById("translationApi");
  const webAIApiSettings = document.getElementById("webAIApiSettings");
  const apiKeySettingGroup = document
    .getElementById("apiKey")
    ?.closest(".setting-group");
  const apiUrlSettingGroup = document
    .getElementById("apiUrl")
    ?.closest(".setting-group");
  const useMockCheckbox = document.getElementById("useMock");
  const debugModeCheckbox = document.getElementById("debugMode");
  const webAIApiUrlInput = document.getElementById("webAIApiUrl");
  const webAIApiModelInput = document.getElementById("webAIApiModel");
  const apiKeyInput = document.getElementById("apiKey");
  const apiUrlInput = document.getElementById("apiUrl");
  const saveSettingsButton = document.getElementById("saveSettings");
  const sourceLanguageInput = document.getElementById("sourceLanguage");
  const targetLanguageInput = document.getElementById("targetLanguage");
  const geminiApiSettings = document.getElementById("geminiApiSettings");
  const openAIApiSettings = document.getElementById("openAIApiSettings");
  const openAIApiKeyInput = document.getElementById("openaiApiKey");
  const openAIModelInput = document.getElementById("openaiApiModel");
  const openRouterApiSettings = document.getElementById(
    "openRouterApiSettings"
  );
  const openRouterApiKeyInput = document.getElementById("openrouterApiKey");
  const openRouterApiModelInput = document.getElementById("openrouterApiModel");

  // Elements for Import/Export
  const exportSettingsButton = document.getElementById("exportSettings");
  const importFile = document.getElementById("importFile");
  const importSettingsButton = document.getElementById("importSettings");

  // Elements for Status and Manifest Info
  const statusElement = document.getElementById("status");
  const manifest_Name = document.getElementById("options_app_name");
  const manifest_Version = document.getElementById("options_app_version");

  const promptTemplateInput = document.getElementById("promptTemplate");
  const sourceLangNameSpan = document.getElementById("sourceLangName");
  const targetLangNameSpan = document.getElementById("targetLangName");

  const excludedSites = document.getElementById("excludedSites");

  // وابستگی انتخاب متن
  function handleTextSelectionDependency() {
    if (
      !translateOnTextSelectionCheckbox ||
      !requireCtrlForTextSelectionCheckbox ||
      !textSelectionCtrlGroup
    )
      return;

    const isTextSelectionEnabled = translateOnTextSelectionCheckbox.checked;
    requireCtrlForTextSelectionCheckbox.disabled = !isTextSelectionEnabled;
    textSelectionCtrlGroup.style.opacity = isTextSelectionEnabled ? "1" : "0.6";
    textSelectionCtrlGroup.style.pointerEvents =
      isTextSelectionEnabled ? "auto" : "none";

    if (!isTextSelectionEnabled) {
      requireCtrlForTextSelectionCheckbox.checked = false;
    }
  }

  // Add event listener for the text selection checkbox
  if (translateOnTextSelectionCheckbox) {
    translateOnTextSelectionCheckbox.addEventListener(
      "change",
      handleTextSelectionDependency
    );
  }

  function showTab(tabId) {
    const activeContent = document.querySelector(".tab-content.active");
    const targetContent = document.getElementById(tabId);
    const container = document.querySelector(".container");

    if (activeContent === targetContent) return;

    tabButtons.forEach((btn) => btn.classList.remove("active"));
    document.querySelector(`[data-tab="${tabId}"]`)?.classList.add("active");

    if (activeContent) {
      fadeOutInElement(
        activeContent,
        () => {
          activeContent.classList.remove("active");

          targetContent.classList.add("active");
          targetContent.style.opacity = "0";
          targetContent.style.transition = "opacity 300ms ease";

          requestAnimationFrame(() => {
            setTimeout(() => {
              const containerRect = container.getBoundingClientRect();
              const contentRect = targetContent.getBoundingClientRect();
              const paddingBottom = 40; // برای دکمه save و status و فاصله پایین
              const newHeight =
                contentRect.bottom - containerRect.top + paddingBottom;

              container.style.transition = "height 300ms ease";
              container.style.height = `${newHeight}px`;

              targetContent.style.opacity = "1";
            }, 0);
          });
        },
        200
      );
    } else {
      // بار اول
      targetContent.classList.add("active");
      targetContent.style.opacity = "1";

      requestAnimationFrame(() => {
        setTimeout(() => {
          const containerRect = container.getBoundingClientRect();
          const contentRect = targetContent.getBoundingClientRect();
          const paddingBottom = 40;
          const newHeight =
            contentRect.bottom - containerRect.top + paddingBottom;

          container.style.height = `${newHeight}px`;
        }, 0);
      });
    }
  }

  function updateOverallExtensionDependency() {
    const isEnabled = extensionEnabledCheckbox.checked;

    [
      translateOnTextFieldsCheckbox,
      enableShortcutForTextFieldsCheckbox,
      translateWithSelectElementCheckbox,
      translateOnTextSelectionCheckbox,
      requireCtrlForTextSelectionCheckbox,
      enableDictionraryCheckbox,
    ].forEach((el) => {
      if (el) {
        el.disabled = !isEnabled;
        const group = el.closest(".setting-group");
        if (group) group.classList.toggle("disabled", !isEnabled);
      }
    });
  }

  // در لود اولیه و هنگام تغییر این تابع را فراخوانی کن
  if (extensionEnabledCheckbox) {
    extensionEnabledCheckbox.addEventListener(
      "change",
      updateOverallExtensionDependency
    );
  }

  tabButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      const tabId = event.target.getAttribute("data-tab");
      showTab(tabId);
    });
  });

  async function updateMockState(isMockEnabled) {
    try {
      translationApiSelect.disabled = isMockEnabled;
      sourceLanguageInput.disabled = isMockEnabled;
      targetLanguageInput.disabled = isMockEnabled;

      // مدیریت وضعیت المان‌ها
      const elementsToToggle = [
        webAIApiUrlInput,
        webAIApiModelInput,
        apiKeyInput,
        apiUrlInput,
        openAIApiKeyInput,
        openAIModelInput,
        openRouterApiKeyInput,
        openRouterApiModelInput,
      ];

      elementsToToggle.forEach((element) => {
        if (element) element.disabled = isMockEnabled;
      });

      // مدیریت نمایش بخش‌های مختلف
      const apiSections = {
        webai: webAIApiSettings,
        gemini: geminiApiSettings,
        openai: openAIApiSettings,
        openrouter: openRouterApiSettings,
      };

      Object.entries(apiSections).forEach(([key, section]) => {
        if (section) {
          section.style.display =
            !isMockEnabled && translationApiSelect.value === key ?
              "block"
            : "none";
        }
      });
    } catch (error) {
      errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "updateMockState-options",
      });
    }
  }

  function toggleApiSettings() {
    const selectedApi = translationApiSelect.value;
    const isGemini = selectedApi === "gemini";
    const isWebAI = selectedApi === "webai";
    const isOpenAI = selectedApi === "openai";
    const isOpenRouter = selectedApi === "openrouter";

    if (webAIApiSettings) {
      webAIApiSettings.style.display = isWebAI ? "block" : "none";
    }

    if (geminiApiSettings) {
      geminiApiSettings.style.display = isGemini ? "block" : "none";
    }

    if (openAIApiSettings) {
      openAIApiSettings.style.display = isOpenAI ? "block" : "none";
    }

    if (openRouterApiSettings) {
      openRouterApiSettings.style.display = isOpenRouter ? "block" : "none";
    }

    // نمایش فیلد API URL فقط در صورتی که Gemini انتخاب شده باشد
    if (apiUrlSettingGroup) {
      apiUrlSettingGroup.style.display = isGemini ? "block" : "none";
    }
  }

  toggleApiSettings(); // تنظیم حالت اولیه
  translationApiSelect.addEventListener("change", toggleApiSettings);

  useMockCheckbox.addEventListener("change", () => {
    updateMockState(useMockCheckbox.checked);
  });

  // فراخوانی اولیه loadSettings
  loadSettings(); // Load settings when the DOM is ready

  // Browser.runtime.sendMessage({ ping: true });

  saveSettingsButton.addEventListener("click", async () => {
    const currentSettings = await getSettingsAsync();

    const webAIApiUrl = webAIApiUrlInput?.value?.trim();
    const webAIApiModel = webAIApiModelInput?.value?.trim();
    const apiKey = apiKeyInput?.value?.trim();
    const useMock = useMockCheckbox?.checked;
    const debugMode = debugModeCheckbox?.checked;
    const apiUrl = apiUrlInput?.value?.trim();
    const sourceLanguage = sourceLanguageInput?.value;
    const targetLanguage = targetLanguageInput?.value;
    const promptTemplate = promptTemplateInput?.value?.trim();
    const translationApi = translationApiSelect.value;
    const openaiApiKey = openAIApiKeyInput?.value?.trim();
    const openaiApiModel = openAIModelInput?.value?.trim();
    const openrouterApiKey = openRouterApiKeyInput?.value?.trim();
    const openrouterApiModel = openRouterApiModelInput?.value?.trim();
    const extensionEnabled = extensionEnabledCheckbox?.checked ?? true;
    const enableDictionary =
      enableDictionraryCheckbox?.checked ?? CONFIG.ENABLE_DICTIONARY;
    const translateOnTextFields =
      translateOnTextFieldsCheckbox?.checked ?? true;
    const enableShortcutForTextFields =
      enableShortcutForTextFieldsCheckbox?.checked ?? true;
    const translateWithSelectElement =
      translateWithSelectElementCheckbox?.checked ?? true;
    const translateOnTextSelection =
      translateOnTextSelectionCheckbox?.checked ?? true;
    const requireCtrlForTextSelection =
      requireCtrlForTextSelectionCheckbox?.checked ?? false;

    const excludedList =
      excludedSites?.value
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? [];

    try {
      const settings = {
        API_KEY: apiKey || "",
        USE_MOCK: useMock,
        DEBUG_MODE: debugMode ?? CONFIG.DEBUG_MODE,
        EXTENSION_ENABLED: extensionEnabled,
        API_URL: apiUrl || CONFIG.API_URL,
        SOURCE_LANGUAGE: sourceLanguage || "English",
        TARGET_LANGUAGE: targetLanguage || "Farsi", // مربوط به ترجمه است
        // زبان لوکالایز از تنظیمات قبلی (یا پیش‌فرض) گرفته می‌شود:
        APPLICATION_LOCALIZE:
          currentSettings.APPLICATION_LOCALIZE || CONFIG.APPLICATION_LOCALIZE,
        PROMPT_TEMPLATE: promptTemplate || CONFIG.PROMPT_TEMPLATE,
        TRANSLATION_API: translationApi || "gemini",
        WEBAI_API_URL: webAIApiUrl || CONFIG.WEBAI_API_URL,
        WEBAI_API_MODEL: webAIApiModel || CONFIG.WEBAI_API_MODEL,
        OPENAI_API_KEY: openaiApiKey || CONFIG.OPENAI_API_KEY,
        OPENAI_API_MODEL: openaiApiModel || CONFIG.OPENAI_API_MODEL,
        OPENROUTER_API_KEY: openrouterApiKey || CONFIG.OPENROUTER_API_KEY,
        OPENROUTER_API_MODEL: openrouterApiModel || CONFIG.OPENROUTER_API_MODEL,
        TRANSLATE_ON_TEXT_FIELDS: translateOnTextFields,
        ENABLE_DICTIONARY: enableDictionary,
        ENABLE_SHORTCUT_FOR_TEXT_FIELDS: enableShortcutForTextFields,
        TRANSLATE_WITH_SELECT_ELEMENT: translateWithSelectElement,
        TRANSLATE_ON_TEXT_SELECTION: translateOnTextSelection,
        REQUIRE_CTRL_FOR_TEXT_SELECTION: requireCtrlForTextSelection,
        EXCLUDED_SITES: excludedList,
      };

      try {
        await Browser.storage.local.set(settings);
      } catch (error) {
        logME("Error setting storage:", error);
      }

      if (settings.EXTENSION_ENABLED) {
        const tabs = await Browser.tabs.query({ url: "<all_urls>" });

        await Promise.allSettled(
          tabs.map(async (tab) => {
            if (!tab.id || !tab.url) return;

            if (await shouldInject(tab.url)) {
              try {
                const res = await Browser.runtime.sendMessage({
                  action: "TRY_INJECT_IF_NEEDED",
                  tabId: tab.id,
                  url: tab.url,
                });
                logME("Injected?", tab.url, res);
              } catch (e) {
                logME("Injection failed for", tab.url, e);
              }
            }
          })
        );
      }

      await updatePromptHelpText();
      showStatus(
        await getTranslationString("OPTIONS_STATUS_SAVED_SUCCESS"),
        "success"
      );
      setTimeout(() => showStatus("", ""), 2000);
    } catch (error) {
      errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "saveSettings",
      });
      showStatus(
        await getTranslationString("OPTIONS_STATUS_SAVED_FAILED"),
        "success"
      );
    }
  });

  async function updatePromptHelpText() {
    const settings = await getSettingsAsync();
    const sourceLang = settings.SOURCE_LANGUAGE || "English";
    const targetLang = settings.TARGET_LANGUAGE || "Farsi";

    if (sourceLangNameSpan) {
      sourceLangNameSpan.textContent = `(${sourceLang})`;
    }
    if (targetLangNameSpan) {
      targetLangNameSpan.textContent = `(${targetLang})`;
    }
  }

  async function loadSettings() {
    try {
      const settings = await getSettingsAsync();

      // نمایش اطلاعات مانیفست
      const manifest = Browser.runtime.getManifest();
      if (manifest_Name) {
        manifest_Name.textContent = CONFIG.APP_NAME;
      }

      if (manifest_Version) {
        manifest_Version.textContent = `v${manifest.version}`;
      }

      // مقداردهی اولیه تنظیمات دیباگ و ماد
      if (debugModeCheckbox) {
        debugModeCheckbox.checked = settings.DEBUG_MODE ?? CONFIG.DEBUG_MODE;
      }
      if (useMockCheckbox) {
        useMockCheckbox.checked = settings.USE_MOCK ?? CONFIG.USE_MOCK;
      }

      // مقداردهی اولیه تنظیمات حالت‌های مختلف ترجمه
      if (extensionEnabledCheckbox) {
        extensionEnabledCheckbox.checked = settings.EXTENSION_ENABLED ?? true;
      }

      if (translateOnTextFieldsCheckbox) {
        translateOnTextFieldsCheckbox.checked =
          settings.TRANSLATE_ON_TEXT_FIELDS ?? true;
      }
      if (enableShortcutForTextFieldsCheckbox) {
        enableShortcutForTextFieldsCheckbox.checked =
          settings.ENABLE_SHORTCUT_FOR_TEXT_FIELDS ?? true;
      }
      if (translateWithSelectElementCheckbox) {
        translateWithSelectElementCheckbox.checked =
          settings.TRANSLATE_WITH_SELECT_ELEMENT ?? true;
      }
      if (translateOnTextSelectionCheckbox) {
        translateOnTextSelectionCheckbox.checked =
          settings.TRANSLATE_ON_TEXT_SELECTION ?? true;
      }
      if (requireCtrlForTextSelectionCheckbox) {
        requireCtrlForTextSelectionCheckbox.checked =
          settings.REQUIRE_CTRL_FOR_TEXT_SELECTION ?? false;
      }

      if (enableDictionraryCheckbox) {
        enableDictionraryCheckbox.checked = settings.ENABLE_DICTIONARY ?? true;
      }

      /** مقدار دهی اولیه exclude */
      if (excludedSites) {
        excludedSites.value = (settings.EXCLUDED_SITES || []).join(", ");
      }

      /** Mock Mode */
      const initialUseMock = settings.USE_MOCK ?? CONFIG.USE_MOCK ?? false;
      updateMockState(initialUseMock);

      if (sourceLanguageInput) {
        sourceLanguageInput.value = settings.SOURCE_LANGUAGE || "English";
      }
      if (targetLanguageInput) {
        targetLanguageInput.value = settings.TARGET_LANGUAGE || "Farsi";
      }
      if (promptTemplateInput) {
        promptTemplateInput.value =
          settings.PROMPT_TEMPLATE || CONFIG.PROMPT_TEMPLATE;
      }

      // تنظیم وضعیت اولیه API
      if (apiKeyInput) apiKeyInput.value = settings.API_KEY || "";
      if (apiUrlInput) apiUrlInput.value = settings.API_URL || CONFIG.API_URL;

      // مقداردهی انتخاب API
      if (translationApiSelect) {
        translationApiSelect.value = settings.TRANSLATION_API || "gemini";
      }

      // مقداردهی تنظیمات WebAI
      if (webAIApiUrlInput) {
        webAIApiUrlInput.value = settings.WEBAI_API_URL || CONFIG.WEBAI_API_URL;
      }
      if (webAIApiModelInput) {
        webAIApiModelInput.value =
          settings.WEBAI_API_MODEL || CONFIG.WEBAI_API_MODEL;
      }

      // مقداردهی تنظیمات OpenAI
      if (openAIApiKeyInput) {
        openAIApiKeyInput.value =
          settings.OPENAI_API_KEY || CONFIG.OPENAI_API_KEY;
      }
      if (openAIModelInput) {
        openAIModelInput.value =
          settings.OPENAI_API_MODEL || CONFIG.OPENAI_API_MODEL;
      }

      // مقداردهی تنظیمات OpenRouter
      if (openRouterApiKeyInput) {
        openRouterApiKeyInput.value =
          settings.OPENROUTER_API_KEY || CONFIG.OPENROUTER_API_KEY;
      }
      if (openRouterApiModelInput) {
        openRouterApiModelInput.value =
          settings.OPENROUTER_API_MODEL || CONFIG.OPENROUTER_API_MODEL;
      }

      app_localize(
        settings.APPLICATION_LOCALIZE || CONFIG.APPLICATION_LOCALIZE
      );

      // فراخوانی اولیه تابع وابستگی *بعد* از تنظیم مقادیر اولیه چک‌باکس‌ها  وضعیت های ترجمه
      handleTextSelectionDependency(); // فراخوانی برای انتخاب متن

      if (!initialUseMock) {
        const initialTranslationApi = settings.TRANSLATION_API || "gemini";
        if (translationApiSelect)
          translationApiSelect.value = initialTranslationApi;
        toggleApiSettings(); // Update visibility based on loaded API
      }

      updateOverallExtensionDependency();

      // بروزرسانی متن راهنمای پرامپت
      await updatePromptHelpText();

      // Show default tab only if no other logic dictates it (e.g., deep linking)
      // As loadSettings handles the initial state based on saved settings, explicitly calling showTab might be redundant
      // unless you want to force 'languages' tab on every load regardless of previous state.
      // showTab("languages"); // Reconsider if this is needed here or should rely on loaded state. Keep it if you want 'languages' always first.

      //*** تنظیم اندازه تب برای نمایش انیمیشن */
      // بعد از اینکه همه چیز لود شد، ارتفاع تب فعال رو تنظیم کن
      window.requestAnimationFrame(() => {
        setTimeout(() => {
          const container = document.querySelector(".container");
          const activeTab = document.querySelector(".tab-content.active");
          if (container && activeTab) {
            const containerRect = container.getBoundingClientRect();
            const contentRect = activeTab.getBoundingClientRect();
            const paddingBottom = 40;
            const newHeight =
              contentRect.bottom - containerRect.top + paddingBottom;

            container.style.height = `${newHeight}px`;
          }
        }, 0); // یا اگر خواستی مطمئن‌تر بشه، بذار `setTimeout(..., 100);`
      });
      //*** تنظیم اندازه تب برای نمایش انیمیشن */
    } catch (error) {
      errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "loadSettings",
        details: {
          component: "options-page",
          action: "initialize-settings",
        },
      });
    }
  }

  function showStatus(message, type) {
    if (statusElement) {
      statusElement.textContent = message;
      statusElement.className = `status-${type}`;
    }
  }

  // Export Settings functionality
  exportSettingsButton.addEventListener("click", async () => {
    try {
      const settings = await getSettingsAsync();
      const blob = new Blob([JSON.stringify(settings, null, 2)], {
        type: "application/json",
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "AI_Writing_Companion_Settings.json";

      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);

      showStatus("تنظیمات با موفقیت صادر شدند!", "success");
      setTimeout(() => showStatus("", ""), 2000); // پاک کردن پیام
    } catch (error) {
      errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "exportSettings",
      });
    }
  });

  // Import Settings functionality
  importFile.addEventListener("change", async (event) => {
    try {
      const file = event.target.files[0];
      if (!file) return;

      const importedSettings = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(JSON.parse(e.target.result));
        reader.onerror = (e) => reject(reader.error);
        reader.readAsText(file);
      });

      try {
        await Browser.storage.local.set(importedSettings);
        // در صورت نیاز، کد مربوط به موفقیت را اینجا قرار دهید
      } catch (error) {
        logME("Error setting imported settings:", error);
        // کد مربوط به مدیریت خطا را اینجا قرار دهید
      }

      showStatus("تنظیمات وارد شدند! در حال بارگذاری مجدد...", "success");
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "importSettings",
      });
      importFile.value = ""; // Reset file input
    }
  });

  // نمایش تب "Languages" به عنوان تب پیش‌فرض هنگام بارگیری صفحه.
  // این کار تضمین می‌کند که کاربر در ابتدا یک محتوا را مشاهده کند در حالی که تنظیمات در حال بارگیری هستند.
  // متد loadSettings پس از این خط اجرا می‌شود و ممکن است تب فعال را بر اساس تنظیمات ذخیره شده تغییر دهد.
  // با این حال، فراخوانی showTab در اینجا به این دلیل حفظ شده است که یک تب پیش‌فرض به کاربر نشان داده شود
  // قبل از اینکه تنظیمات ذخیره شده (در صورت وجود) از حافظه بارگیری و اعمال شوند.
  showTab("languages");

  const initialActive = document.querySelector(".tab-content.active");
  if (initialActive) {
    const container = document.querySelector(".container");
    container.style.height = `${initialActive.offsetHeight}px`;
  }
});
