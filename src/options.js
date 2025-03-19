// src/options.js
import { getSettingsAsync, CONFIG } from "./config.js";
import { ErrorHandler, ErrorTypes } from "./services/ErrorService.js";

document.addEventListener("DOMContentLoaded", () => {
  const tabButtons = document.querySelectorAll(".tab-button");
  const tabContents = document.querySelectorAll(".tab-content");

  const errorHandler = new ErrorHandler(); // ایجاد یک نمونه از ErrorHandler

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

  const translationApiSelect = document.getElementById("translationApi");
  const webAIApiSettings = document.getElementById("webAIApiSettings");
  const apiKeySettingGroup = document
    .getElementById("apiKey")
    ?.closest(".setting-group");
  const apiUrlSettingGroup = document
    .getElementById("apiUrl")
    ?.closest(".setting-group");
  const useMockCheckbox = document.getElementById("useMock");
  const webAIApiUrlInput = document.getElementById("webAIApiUrl");
  const webAIApiModelInput = document.getElementById("webAIApiModel");
  const apiKeyInput = document.getElementById("apiKey");
  const apiUrlInput = document.getElementById("apiUrl");
  // const promptTemplateInput = document.getElementById("promptTemplate");
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

  function updateMockState(isMockEnabled) {
    translationApiSelect.disabled = isMockEnabled;
    sourceLanguageInput.disabled = isMockEnabled;
    targetLanguageInput.disabled = isMockEnabled;

    // غیرفعال/فعال کردن تنظیمات WebAI API
    if (webAIApiUrlInput) {
      webAIApiUrlInput.disabled = isMockEnabled;
    }
    if (webAIApiModelInput) {
      webAIApiModelInput.disabled = isMockEnabled;
    }

    // غیرفعال/فعال کردن تنظیمات Gemini API
    if (apiKeyInput) {
      apiKeyInput.disabled = isMockEnabled;
    }
    if (apiUrlInput) {
      apiUrlInput.disabled = isMockEnabled;
    }

    // غیرفعال/فعال کردن تنظیمات OpenAI API
    if (openAIApiKeyInput) {
      openAIApiKeyInput.disabled = isMockEnabled;
    }
    if (openAIModelInput) {
      openAIModelInput.disabled = isMockEnabled;
    }

    // غیرفعال/فعال کردن تنظیمات OpenRouter API
    if (openRouterApiKeyInput) {
      openRouterApiKeyInput.disabled = isMockEnabled;
    }
    if (openRouterApiModelInput) {
      openRouterApiModelInput.disabled = isMockEnabled;
    }

    // نمایش/عدم نمایش تنظیمات API بر اساس انتخاب و وضعیت MOCK
    if (webAIApiSettings) {
      webAIApiSettings.style.display =
        !isMockEnabled && translationApiSelect.value === "webai" ?
          "block"
        : "none";
    }
    if (geminiApiSettings) {
      geminiApiSettings.style.display =
        !isMockEnabled && translationApiSelect.value === "gemini" ?
          "block"
        : "none";
    }
    if (openAIApiSettings) {
      openAIApiSettings.style.display =
        !isMockEnabled && translationApiSelect.value === "openai" ?
          "block"
        : "none";
    }
    if (openRouterApiSettings) {
      openRouterApiSettings.style.display =
        !isMockEnabled && translationApiSelect.value === "openrouter" ?
          "block"
        : "none";
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

  const manifest = chrome.runtime.getManifest();
  document.getElementById("NameVersion").textContent =
    `${manifest.name} v${manifest.version}`;

  loadSettings();

  useMockCheckbox.addEventListener("change", () => {
    updateMockState(useMockCheckbox.checked);
  });

  document
    .getElementById("saveSettings")
    .addEventListener("click", async () => {
      const webAIApiUrl = document.getElementById("webAIApiUrl")?.value?.trim();
      const webAIApiModel = document
        .getElementById("webAIApiModel")
        ?.value?.trim();
      const apiKey = document.getElementById("apiKey")?.value?.trim();
      const useMock = document.getElementById("useMock")?.checked;
      const apiUrl = document.getElementById("apiUrl")?.value?.trim();
      const sourceLanguage = document.getElementById("sourceLanguage")?.value;
      const targetLanguage = document.getElementById("targetLanguage")?.value;
      const promptTemplate = document
        .getElementById("promptTemplate")
        ?.value?.trim();
      const translationApiSelect = document.getElementById("translationApi"); // دریافت المنت dropdown
      const translationApi = translationApiSelect.value;
      const openaiApiKey = document
        .getElementById("openaiApiKey")
        ?.value?.trim();
      const openaiApiModel = document
        .getElementById("openaiApiModel")
        ?.value?.trim();
      const openrouterApiKey = document
        .getElementById("openrouterApiKey")
        ?.value?.trim();
      const openrouterApiModel = document
        .getElementById("openrouterApiModel")
        ?.value?.trim();

      const settings = {
        apiKey: apiKey || "",
        USE_MOCK: useMock,
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

      try {
        await new Promise((resolve, reject) => {
          chrome.storage.sync.set(settings, () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve();
            }
          });
        });

        updatePromptHelpText();

        showStatus("ذخیره شد!", "success");

        setTimeout(() => {
          showStatus("", ""); // پاک کردن پیام
        }, 2000);
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

    const sourceLangNameSpan = document.getElementById("sourceLangName");
    const targetLangNameSpan = document.getElementById("targetLangName");

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
      const apiKeyInput = document.getElementById("apiKey");
      if (apiKeyInput) apiKeyInput.value = settings.apiKey || "";
      const useMockInput = document.getElementById("useMock");
      if (useMockInput) useMockInput.checked = settings.USE_MOCK;
      const apiUrlInput = document.getElementById("apiUrl");
      if (apiUrlInput) {
        apiUrlInput.value = settings.API_URL || CONFIG.API_URL;
      }
      const sourceLanguageInput = document.getElementById("sourceLanguage");
      if (sourceLanguageInput)
        sourceLanguageInput.value = settings.sourceLanguage || "English";
      const targetLanguageInput = document.getElementById("targetLanguage");
      if (targetLanguageInput)
        targetLanguageInput.value = settings.targetLanguage || "Persian";
      const promptTemplateInput = document.getElementById("promptTemplate");
      if (promptTemplateInput)
        promptTemplateInput.value =
          settings.promptTemplate || CONFIG.promptTemplate;

      if (translationApiSelect)
        translationApiSelect.value = settings.translationApi || "gemini";
      if (document.getElementById("webAIApiUrl"))
        document.getElementById("webAIApiUrl").value =
          settings.webAIApiUrl || CONFIG.WEBAI_API_URL;
      if (document.getElementById("webAIApiModel"))
        document.getElementById("webAIApiModel").value =
          settings.webAIApiModel || CONFIG.WEBAI_API_MODEL;
      if (document.getElementById("openaiApiKey"))
        document.getElementById("openaiApiKey").value =
          settings.openaiApiKey || CONFIG.OPENAI_API_KEY;
      if (document.getElementById("openaiApiModel"))
        document.getElementById("openaiApiModel").value =
          settings.openaiApiModel || CONFIG.OPENAI_API_MODEL;
      if (document.getElementById("openrouterApiKey"))
        document.getElementById("openrouterApiKey").value =
          settings.openrouterApiKey || CONFIG.OPENROUTER_API_KEY;
      if (document.getElementById("openrouterApiModel"))
        document.getElementById("openrouterApiModel").value =
          settings.openrouterApiModel || CONFIG.OPENROUTER_API_MODEL;

      const initialTranslationApi = settings.translationApi || "gemini";
      const initialUseMock = settings.USE_MOCK;

      // نمایش تب Languages به صورت پیش فرض
      showTab("languages");
      if (initialUseMock) {
        updateMockState(true);
      } else {
        translationApiSelect.value = initialTranslationApi;
        toggleApiSettings();
      }

      await updatePromptHelpText();
    } catch (error) {
      errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "loadSettings",
      });
    }
  }

  function showStatus(message, type) {
    const status = document.getElementById("status");
    status.textContent = message;
    status.className = `status-${type}`;
  }

  // Export Settings functionality
  exportSettingsButton.addEventListener("click", async () => {
    try {
      const settings = await getSettingsAsync();
      const settingsJSON = JSON.stringify(settings, null, 2);
      const filename = "gemini_translate_settings.json";
      const blob = new Blob([settingsJSON], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showStatus("تنظیمات با موفقیت صادر شدند!", "success");
      setTimeout(() => {
        showStatus("", "");
      }, 2000);
    } catch (error) {
      errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "exportSettings",
      });
    }
  });

  // Import Settings functionality
  importSettingsButton.addEventListener("click", () => {
    importFile.click(); // Trigger file input click
  });

  importFile.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const importedSettings = JSON.parse(e.target.result);
          await new Promise((resolve, reject) => {
            chrome.storage.sync.set(importedSettings, () => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve();
              }
            });
          });
          showStatus(
            "تنظیمات با موفقیت وارد شدند! صفحه در حال بارگیری مجدد است.",
            "success"
          );
          setTimeout(() => {
            window.location.reload(); // Reload the page to apply imported settings
          }, 1500);
        } catch (error) {
          errorHandler.handle(error, {
            type: ErrorTypes.UI,
            context: "importSettings-parse",
          });
        }
      };
      reader.onerror = () => {
        errorHandler.handle(reader.error, {
          type: ErrorTypes.UI,
          context: "importSettings-read",
        });
      };
      reader.readAsText(file);
    }
  });

  // نمایش تب "Languages" به عنوان تب پیش‌فرض هنگام بارگیری صفحه.
  // این کار تضمین می‌کند که کاربر در ابتدا یک محتوا را مشاهده کند در حالی که تنظیمات در حال بارگیری هستند.
  // متد loadSettings پس از این خط اجرا می‌شود و ممکن است تب فعال را بر اساس تنظیمات ذخیره شده تغییر دهد.
  // با این حال، فراخوانی showTab در اینجا به این دلیل حفظ شده است که یک تب پیش‌فرض به کاربر نشان داده شود
  // قبل از اینکه تنظیمات ذخیره شده (در صورت وجود) از حافظه بارگیری و اعمال شوند.
  showTab("languages");
});
