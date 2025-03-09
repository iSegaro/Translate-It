// src/options.js
import { getApiKeyAsync } from "./config.js";

document.addEventListener("DOMContentLoaded", () => {
  const manifest = chrome.runtime.getManifest();
  document.getElementById("NameVersion").textContent =
    `${manifest.name} v${manifest.version}`;

  getApiKeyAsync()
    .then((apiKey) => {
      document.getElementById("apiKey").value = apiKey;
    })
    .catch(() => {});

  document.getElementById("saveApiKey").addEventListener("click", async () => {
    const apiKey = document.getElementById("apiKey").value.trim();

    if (!apiKey) {
      showStatus("لطفا کلید API را وارد کنید", "error");
      return;
    }

    try {
      await new Promise((resolve, reject) => {
        chrome.storage.sync.set({ apiKey }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });

      showStatus("ذخیره شد!", "success");

      // عدم بستن خودکار پنجره
      setTimeout(() => {
        showStatus("", ""); // پاک کردن پیام
      }, 2000);
    } catch (error) {
      console.error("Error saving API key:", error);
      showStatus("خطا در ذخیره سازی: " + error.message, "error");
    }
  });

  function showStatus(message, type) {
    const status = document.getElementById("status");
    status.textContent = message;
    status.className = `status-${type}`;
  }
});
