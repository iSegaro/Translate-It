// src/options.js
import { getSettingsAsync } from "./config.js";

document.addEventListener("DOMContentLoaded", () => {
  const manifest = chrome.runtime.getManifest();
  document.getElementById("NameVersion").textContent =
    `${manifest.name} v${manifest.version}`;

  loadSettings();

  document
    .getElementById("saveSettings")
    .addEventListener("click", async () => {
      const apiKey = document.getElementById("apiKey")?.value?.trim();
      const useMock = document.getElementById("useMock")?.checked;
      const apiUrl = document.getElementById("apiUrl")?.value?.trim();
      const sourceLanguage = document.getElementById("sourceLanguage")?.value;
      const targetLanguage = document.getElementById("targetLanguage")?.value;

      const settings = {
        apiKey: apiKey || "",
        USE_MOCK: useMock,
        API_URL: apiUrl || "",
        sourceLanguage: sourceLanguage || "en",
        targetLanguage: targetLanguage || "fa",
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

        showStatus("ذخیره شد!", "success");

        setTimeout(() => {
          showStatus("", ""); // پاک کردن پیام
        }, 2000);
      } catch (error) {
        console.error("Error saving settings:", error);
        showStatus("خطا در ذخیره سازی: " + error.message, "error");
      }
    });

  async function loadSettings() {
    try {
      const settings = await getSettingsAsync();
      const apiKeyInput = document.getElementById("apiKey");
      if (apiKeyInput) apiKeyInput.value = settings.apiKey || "";
      const useMockInput = document.getElementById("useMock");
      if (useMockInput) useMockInput.checked = settings.USE_MOCK;
      const apiUrlInput = document.getElementById("apiUrl");
      if (apiUrlInput) apiUrlInput.value = settings.API_URL || "";
      const sourceLanguageSelect = document.getElementById("sourceLanguage");
      if (sourceLanguageSelect)
        sourceLanguageSelect.value = settings.sourceLanguage || "en";
      const targetLanguageSelect = document.getElementById("targetLanguage");
      if (targetLanguageSelect)
        targetLanguageSelect.value = settings.targetLanguage || "fa";
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
