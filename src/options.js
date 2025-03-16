// src/options.js
import { getSettingsAsync, CONFIG } from "./config.js";

document.addEventListener("DOMContentLoaded", () => {
  const translationApiSelect = document.getElementById("translationApi");
  const webAIApiSettings = document.getElementById("customApiSettings"); // تغییر نام
  const apiKeySettingGroup = document
    .getElementById("apiKey")
    ?.closest(".setting-group");
  const apiUrlSettingGroup = document
    .getElementById("apiUrl")
    ?.closest(".setting-group");
  const useMockCheckbox = document.getElementById("useMock");
  const webAIApiUrlInput = document.getElementById("customApiUrl"); // تغییر نام
  const webAIApiModelInput = document.getElementById("customApiModel"); // تغییر نام
  const apiKeyInput = document.getElementById("apiKey");
  const apiUrlInput = document.getElementById("apiUrl");
  const promptTemplateInput = document.getElementById("promptTemplate");
  const saveSettingsButton = document.getElementById("saveSettings");
  const sourceLanguageInput = document.getElementById("sourceLanguage");
  const targetLanguageInput = document.getElementById("targetLanguage");
  const geminiApiSettings = document.getElementById("geminiApiSettings");
  const openAIApiSettings = document.getElementById("openAIApiSettings"); // اضافه شده
  const openAIApiKeyInput = document.getElementById("openaiApiKey"); // اضافه شده
  const openAIModelInput = document.getElementById("openaiApiModel"); // اضافه شده

  function updateMockState(isMockEnabled) {
    translationApiSelect.disabled = isMockEnabled;
    if (webAIApiUrlInput) webAIApiUrlInput.disabled = isMockEnabled; // تغییر نام
    if (webAIApiModelInput) webAIApiModelInput.disabled = isMockEnabled; // تغییر نام
    if (apiKeyInput) apiKeyInput.disabled = isMockEnabled;
    if (apiUrlInput) apiUrlInput.disabled = isMockEnabled;
    if (promptTemplateInput) promptTemplateInput.disabled = isMockEnabled;
    if (openAIApiKeyInput) openAIApiKeyInput.disabled = isMockEnabled; // اضافه شده
    if (openAIModelInput) openAIModelInput.disabled = isMockEnabled; // اضافه شده
    sourceLanguageInput.disabled = false;
    targetLanguageInput.disabled = false;
  }

  function toggleApiSettings() {
    // تغییر نام تابع برای خوانایی بیشتر
    const selectedApi = translationApiSelect.value;
    const isGemini = selectedApi === "gemini";
    const isWebAI = selectedApi === "webai"; // تغییر نام
    const isOpenAI = selectedApi === "openai";

    updateMockState(useMockCheckbox.checked); // ابتدا وضعیت Mock را به‌روزرسانی کنید

    if (webAIApiSettings) {
      webAIApiSettings.style.display = isWebAI ? "block" : "none"; // تغییر نام
    }

    if (geminiApiSettings) {
      geminiApiSettings.style.display = isGemini ? "block" : "none";
    }

    if (openAIApiSettings) {
      openAIApiSettings.style.display = isOpenAI ? "block" : "none"; // اضافه شده
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
    toggleApiSettings();
  });

  document
    .getElementById("saveSettings")
    .addEventListener("click", async () => {
      const webAIApiUrl = document // تغییر نام
        .getElementById("customApiUrl")
        ?.value?.trim();
      const webAIApiModel = document // تغییر نام
        .getElementById("customApiModel")
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
        ?.value?.trim(); // اضافه شده
      const openaiApiModel = document
        .getElementById("openaiApiModel")
        ?.value?.trim(); // اضافه شده

      const settings = {
        apiKey: apiKey || "",
        USE_MOCK: useMock,
        API_URL: apiUrl || CONFIG.API_URL,
        sourceLanguage: sourceLanguage || "English",
        targetLanguage: targetLanguage || "Persian",
        promptTemplate: promptTemplate || CONFIG.promptTemplate,
        translationApi: translationApi || "gemini",
        webAIApiUrl: webAIApiUrl || CONFIG.WEBAI_API_URL, // تغییر نام
        webAIApiModel: webAIApiModel || CONFIG.WEBAI_API_MODEL, // تغییر نام
        openaiApiKey: openaiApiKey || CONFIG.OPENAI_API_KEY, // اضافه شده
        openaiApiModel: openaiApiModel || CONFIG.OPENAI_API_MODEL, // اضافه شده
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
        console.error("Error saving settings:", error);
        showStatus("خطا در ذخیره سازی: " + error.message, "error");
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
      if (document.getElementById("customApiUrl"))
        document.getElementById("customApiUrl").value =
          settings.webAIApiUrl || CONFIG.WEBAI_API_URL; // تغییر نام
      if (document.getElementById("customApiModel"))
        document.getElementById("customApiModel").value =
          settings.webAIApiModel || CONFIG.WEBAI_API_MODEL; // تغییر نام
      if (document.getElementById("openaiApiKey"))
        // اضافه شده
        document.getElementById("openaiApiKey").value =
          settings.openaiApiKey || CONFIG.OPENAI_API_KEY;
      if (document.getElementById("openaiApiModel"))
        // اضافه شده
        document.getElementById("openaiApiModel").value =
          settings.openaiApiModel || CONFIG.OPENAI_API_MODEL;
      toggleApiSettings(); // تنظیم نمایش/عدم نمایش در هنگام بارگیری
      updateMockState(settings.USE_MOCK);
      await updatePromptHelpText();
    } catch (error) {
      console.error("Error loading settings:", error);
      showStatus("خطا در بارگیری تنظیمات.", "error");
    }
  }

  function showStatus(message, type) {
    const status = document.getElementById("status");
    status.textContent = message;
    status.className = `status-${type}`;
  }
});
