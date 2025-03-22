// src/popup.js
import { getApiKeyAsync } from "./config.js";

document.getElementById("restore").addEventListener("click", () => {
  if (chrome.scripting && chrome.scripting.executeScript) {
    chrome.scripting.executeScript({
      target: { allFrames: true },
      func: () => {
        document.querySelectorAll("[data-original-text]").forEach((element) => {
          element.innerText = element.dataset.original - text;
          delete element.dataset.original - text;
        });
      },
    });
  } else {
    // errorHandler.handle(new Error('Scripting API disabled'), {...});
    console.log("Popup.js: Scripting API disabled");
  }
});

document.addEventListener("DOMContentLoaded", () => {
  getApiKeyAsync()
    .then((apiKey) => {
      document.getElementById("apiKey").value = apiKey;
    })
    .catch(() => {});

  document.getElementById("saveApiKey").addEventListener("click", () => {
    const apiKey = document.getElementById("apiKey").value.trim();
    chrome.storage.sync.set({ apiKey }, () => {
      console.log("API key saved:", apiKey);
    });
  });
});
