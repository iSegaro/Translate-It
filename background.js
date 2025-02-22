// background.js

// Detect extension reload
let isReloaded = false;

chrome.action.onClicked.addListener((tab) => {
  // Check if tab exists and is active
  if (!tab?.id || tab.status !== "complete") return;

  // Send message with error handling
  chrome.tabs
    .sendMessage(tab.id, { action: "enable_selection" })
    .catch((error) => {
      if (error.message.includes("Receiving end does not exist")) {
        // Inject content script if needed
        chrome.scripting
          .executeScript({
            target: { tabId: tab.id },
            files: ["content.js"],
          })
          .then(() => {
            console.log("Content script injected successfully");
          })
          .catch((injError) => {
            console.error("Injection failed:", injError);
          });
      } else {
        console.error("Unexpected error:", error);
      }
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
          tab.url?.includes("web.whatsapp.com") ||
          tab.url?.includes("web.telegram.org") ||
          tab.url?.includes("instagram.com") ||
          tab.url?.includes("twitter.com") ||
          tab.url?.includes("youtube.com")
        ) {
          chrome.tabs
            .sendMessage(tab.id, {
              type: "EXTENSION_RELOADED",
            })
            .catch(() => {});
        }
      });
    });
  }
});
