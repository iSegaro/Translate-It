// src/background.js
import { CONFIG, getApiKeyAsync } from "./config.js";

// Detect extension reload
let isReloaded = false;

chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id || tab.status !== "complete") return;

  chrome.storage.local.get(["selectionActive"], (result) => {
    const newState = !result.selectionActive;

    chrome.storage.local.set({ selectionActive: newState }, () => {
      chrome.tabs
        .sendMessage(tab.id, {
          action: "TOGGLE_SELECTION_MODE",
          data: newState,
        })
        .catch((error) => {
          console.log("Retrying injection...");
          chrome.scripting
            .executeScript({
              target: { tabId: tab.id },
              files: ["content.bundle.js"],
            })
            .then(() => {
              chrome.tabs.sendMessage(tab.id, {
                action: "TOGGLE_SELECTION_MODE",
                data: newState,
              });
            });
        });
    });
  });
});

chrome.runtime.onInstalled.addListener((details) => {
  console.log("Extension installed/updated:", details.reason);

  chrome.storage.sync.get(["apiKey"], (result) => {
    console.log("Stored API Key:", result.apiKey ? "Exists" : "Missing");
  });

  if (details.reason === "update") {
    isReloaded = true;
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (
          tab.url &&
          [
            "web.whatsapp.com",
            "web.telegram.org",
            "instagram.com",
            "twitter.com",
            "youtube.com",
          ].some((domain) => tab.url.includes(domain))
        ) {
          chrome.tabs
            .sendMessage(tab.id, { type: "EXTENSION_RELOADED" })
            .catch(() => {});
        }
      });
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "CONTEXT_INVALID") {
    chrome.runtime.reload();
  } else if (message.action === "fetchTranslation") {
    (async () => {
      try {
        const { promptText } = message.payload;
        const apiKey = await getApiKeyAsync();

        const response = await fetch(`${CONFIG.API_URL}?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
          }),
          mode: "cors",
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || response.statusText);
        }

        sendResponse({ data: await response.json() });
      } catch (error) {
        console.error("Translation error:", error);
        sendResponse({
          error:
            error.message.includes("API") ?
              error.message
            : "Translation service unavailable",
        });
      }
    })();
    return true;
  }
});
