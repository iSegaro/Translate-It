// src/options.js
import { getSettingsAsync, CONFIG } from "./config.js";
import { ErrorHandler, ErrorTypes } from "./services/ErrorService.js";

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
  const manifestNameElement = document.getElementById("MANIFEST_NAME");
  const manifestDescriptionElement = document.getElementById(
    "MANIFEST_DESCRIPTION"
  );
  const manifestTitle_OPTION_PAGE_Element = document.getElementById(
    "MANIFEST_TITLE_OPTION_PAGE"
  );
  const promptTemplateInput = document.getElementById("promptTemplate");
  const sourceLangNameSpan = document.getElementById("sourceLangName");
  const targetLangNameSpan = document.getElementById("targetLangName");

  function showTab(tabId) {
    tabButtons.forEach((button) => button.classList.remove("active"));
    tabContents.forEach((content) => content.classList.remove("active"));
    document.getElementById(tabId).classList.add("active");
    document.querySelector(`[data-tab="${tabId}"]`).classList.add("active");
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

  loadSettings();

  useMockCheckbox.addEventListener("change", () => {
    updateMockState(useMockCheckbox.checked);
  });

  saveSettingsButton.addEventListener("click", async () => {
    const webAIApiUrl = webAIApiUrlInput?.value?.trim();
    const webAIApiModel = webAIApiModelInput?.value?.trim();
    const apiKey = apiKeyInput?.value?.trim();
    const useMock = false; //useMockCheckbox?.checked;
    const debugMode = debugModeCheckbox?.checked;
    const apiUrl = apiUrlInput?.value?.trim();
    const sourceLanguage = sourceLanguageInput?.value;
    const targetLanguage = targetLanguageInput?.value;
    const promptTemplate = promptTemplateInput?.value?.trim();
    const translationApi = translationApiSelect.value; // دریافت المنت dropdown برای مدل‌ها
    const openaiApiKey = openAIApiKeyInput?.value?.trim();
    const openaiApiModel = openAIModelInput?.value?.trim();
    const openrouterApiKey = openRouterApiKeyInput?.value?.trim();
    const openrouterApiModel = openRouterApiModelInput?.value?.trim();

    try {
      const settings = {
        apiKey: apiKey || "",
        USE_MOCK: useMock,
        DEBUG_MODE: debugMode ?? CONFIG.DEBUG_MODE,
        API_URL: apiUrl || CONFIG.API_URL,
        sourceLanguage: sourceLanguage || "English",
        targetLanguage: targetLanguage || "Persian",
        promptTemplate: promptTemplate || CONFIG.promptTemplate,
        translationApi: translationApi || "gemini",
        webAIApiUrl: webAIApiUrl || CONFIG.WEBAI_API_URL,
        webAIApiModel: webAIApiModel || CONFIG.WEBAI_API_MODEL,
        openaiApiKey: openaiApiKey || CONFIG.OPENAI_API_KEY,
        openaiApiModel: openaiApiModel || CONFIG.OPENAI_API_MODEL,
        openrouterApiKey: openrouterApiKey || CONFIG.OPENROUTER_API_KEY,
        openrouterApiModel: openrouterApiModel || CONFIG.OPENROUTER_API_MODEL,
      };

      await new Promise((resolve, reject) => {
        chrome.storage.sync.set(settings, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });

      await updatePromptHelpText();
      showStatus("ذخیره شد!", "success");
      setTimeout(() => showStatus("", ""), 2000); // پاک کردن پیام
    } catch (error) {
      errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "saveSettings",
      });
    }
  });

  async function updatePromptHelpText() {
    const settings = await getSettingsAsync();
    const sourceLang = settings.sourceLanguage || "English";
    const targetLang = settings.targetLanguage || "Persian";

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

      // مقداردهی اولیه تنظیمات دیباگ و ماد
      if (debugModeCheckbox) {
        debugModeCheckbox.checked = settings.DEBUG_MODE ?? CONFIG.DEBUG_MODE;
      }
      if (useMockCheckbox) {
        useMockCheckbox.checked = settings.USE_MOCK ?? CONFIG.USE_MOCK;
      }

      // مقداردهی فیلدهای اصلی
      if (apiKeyInput) apiKeyInput.value = settings.apiKey || "";
      if (apiUrlInput) apiUrlInput.value = settings.API_URL || CONFIG.API_URL;
      if (sourceLanguageInput) {
        sourceLanguageInput.value = settings.sourceLanguage || "English";
      }
      if (targetLanguageInput) {
        targetLanguageInput.value = settings.targetLanguage || "Persian";
      }
      if (promptTemplateInput) {
        promptTemplateInput.value =
          settings.promptTemplate || CONFIG.promptTemplate;
      }

      // مقداردهی انتخاب API
      if (translationApiSelect) {
        translationApiSelect.value = settings.translationApi || "gemini";
      }

      // مقداردهی تنظیمات WebAI
      if (webAIApiUrlInput) {
        webAIApiUrlInput.value = settings.webAIApiUrl || CONFIG.WEBAI_API_URL;
      }
      if (webAIApiModelInput) {
        webAIApiModelInput.value =
          settings.webAIApiModel || CONFIG.WEBAI_API_MODEL;
      }

      // مقداردهی تنظیمات OpenAI
      if (openAIApiKeyInput) {
        openAIApiKeyInput.value =
          settings.openaiApiKey || CONFIG.OPENAI_API_KEY;
      }
      if (openAIModelInput) {
        openAIModelInput.value =
          settings.openaiApiModel || CONFIG.OPENAI_API_MODEL;
      }

      // مقداردهی تنظیمات OpenRouter
      if (openRouterApiKeyInput) {
        openRouterApiKeyInput.value =
          settings.openrouterApiKey || CONFIG.OPENROUTER_API_KEY;
      }
      if (openRouterApiModelInput) {
        openRouterApiModelInput.value =
          settings.openrouterApiModel || CONFIG.OPENROUTER_API_MODEL;
      }

      // تنظیم وضعیت اولیه API
      const initialTranslationApi = settings.translationApi || "gemini";
      const initialUseMock = settings.USE_MOCK ?? CONFIG.USE_MOCK;

      // نمایش اطلاعات مانیفست
      const manifest = chrome.runtime.getManifest();
      if (manifestNameElement) {
        manifestNameElement.textContent = `${manifest.name} v${manifest.version}`;
      }
      if (manifestDescriptionElement) {
        manifestDescriptionElement.textContent = manifest.description;
      }
      if (manifestTitle_OPTION_PAGE_Element) {
        manifestTitle_OPTION_PAGE_Element.textContent = `${manifest.name} - Settings`;
      }

      // تنظیم تب پیش‌فرض در اینجا اتفاق می‌افتاد
      showTab("languages");
      updateMockState(initialUseMock);
      if (!initialUseMock) {
        translationApiSelect.value = initialTranslationApi;
        toggleApiSettings();
      }

      // بروزرسانی متن راهنمای پرامپت
      await updatePromptHelpText();
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

      await new Promise((resolve, reject) => {
        chrome.storage.sync.set(importedSettings, () => {
          chrome.runtime.lastError ?
            reject(chrome.runtime.lastError)
          : resolve();
        });
      });

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
});
