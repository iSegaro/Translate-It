// src/options.js
import { getSettingsAsync, CONFIG } from "./config.js";

document.addEventListener("DOMContentLoaded", () => {
  const translationApiSelect = document.getElementById("translationApi");
  const customApiSettings = document.getElementById("customApiSettings");

  function toggleCustomApiSettings() {
    customApiSettings.style.display =
      translationApiSelect.value === "custom" ? "block" : "none";
  }

  toggleCustomApiSettings(); // تنظیم حالت اولیه
  translationApiSelect.addEventListener("change", toggleCustomApiSettings);

  const manifest = chrome.runtime.getManifest();
  document.getElementById("NameVersion").textContent =
    `${manifest.name} v${manifest.version}`;

  loadSettings();

  const useMockCheckbox = document.getElementById("useMock");
  const apiKeyInput = document.getElementById("apiKey");

  function toggleApiKeyInput() {
    if (useMockCheckbox.checked) {
      apiKeyInput.disabled = true;
    } else {
      apiKeyInput.disabled = false;
    }
  }

  toggleApiKeyInput();
  useMockCheckbox.addEventListener("change", toggleApiKeyInput);

  document
    .getElementById("saveSettings")
    .addEventListener("click", async () => {
      const customApiUrl = document
        .getElementById("customApiUrl")
        ?.value?.trim();
      const customApiModel = document
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

      const settings = {
        apiKey: apiKey || "",
        USE_MOCK: useMock,
        API_URL: apiUrl || CONFIG.API_URL,
        sourceLanguage: sourceLanguage || "English",
        targetLanguage: targetLanguage || "Persian",
        promptTemplate: promptTemplate || CONFIG.promptTemplate,
        translationApi: translationApi || "gemini",
        customApiUrl: customApiUrl || CONFIG.CUSTOM_API_URL,
        customApiModel: customApiModel || CONFIG.CUSTOM_API_MODEL,
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
        apiUrlInput.value = settings.API_URL || CONFIG.API_URL; // استفاده از مقدار پیش فرض از CONFIG
      }
      const sourceLanguageInput = document.getElementById("sourceLanguage"); // دریافت المنت input
      if (sourceLanguageInput)
        sourceLanguageInput.value = settings.sourceLanguage || "English"; // تنظیم مقدار input
      const targetLanguageInput = document.getElementById("targetLanguage"); // دریافت المنت input
      if (targetLanguageInput)
        targetLanguageInput.value = settings.targetLanguage || "Persian"; // تنظیم مقدار input
      const promptTemplateInput = document.getElementById("promptTemplate");
      if (promptTemplateInput)
        promptTemplateInput.value =
          settings.promptTemplate || CONFIG.promptTemplate;

      if (translationApiSelect)
        translationApiSelect.value = settings.translationApi || "gemini";
      if (document.getElementById("customApiUrl"))
        document.getElementById("customApiUrl").value =
          settings.customApiUrl || CONFIG.CUSTOM_API_URL;
      if (document.getElementById("customApiModel"))
        document.getElementById("customApiModel").value =
          settings.customApiModel || CONFIG.CUSTOM_API_MODEL;
      toggleCustomApiSettings(); // تنظیم نمایش/عدم نمایش در هنگام بارگیری
      await updatePromptHelpText(); // فراخوانی برای تنظیم نام زبان‌ها هنگام بارگیری اولیه
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
