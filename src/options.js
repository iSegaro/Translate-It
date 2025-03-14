// src/options.js
import { getSettingsAsync, CONFIG } from "./config.js";

document.addEventListener("DOMContentLoaded", () => {
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
      const apiKey = document.getElementById("apiKey")?.value?.trim();
      const useMock = document.getElementById("useMock")?.checked;
      const apiUrl = document.getElementById("apiUrl")?.value?.trim();
      const sourceLanguage = document.getElementById("sourceLanguage")?.value;
      const targetLanguage = document.getElementById("targetLanguage")?.value;

      const promptTemplate = document
        .getElementById("promptTemplate")
        ?.value?.trim();

      const settings = {
        apiKey: apiKey || "",
        USE_MOCK: useMock,
        API_URL: apiUrl || CONFIG.API_URL,
        sourceLanguage: sourceLanguage || "English",
        targetLanguage: targetLanguage || "Persian",
        promptTemplate: promptTemplate || CONFIG.promptTemplate,
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
      const sourceLanguageSelect = document.getElementById("sourceLanguage");
      if (sourceLanguageSelect)
        sourceLanguageSelect.value = settings.sourceLanguage || "English";
      const targetLanguageSelect = document.getElementById("targetLanguage");
      if (targetLanguageSelect)
        targetLanguageSelect.value = settings.targetLanguage || "Persian";
      const promptTemplateInput = document.getElementById("promptTemplate");
      if (promptTemplateInput)
        promptTemplateInput.value =
          settings.promptTemplate || CONFIG.promptTemplate;

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
