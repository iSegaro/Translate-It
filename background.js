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

// Retrieve API key from storage
async function getApiKeyAsync() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["apiKey"], (result) => {
      resolve(result.apiKey || "");
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "fetchTranslation") {
    (async () => {
      const { promptText } = message.payload;
      const apiKey = await getApiKeyAsync();
      if (!apiKey) {
        const errorMsg =
          "API key is missing. Please set the API key in extension options.";
        console.error("API Key missing:", errorMsg);
        sendResponse({ error: errorMsg });
        return;
      }

      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: promptText }] }],
            }),
            mode: "cors",
          }
        );

        if (!response.ok) {
          let errorData;
          try {
            errorData = await response.json();
          } catch (e) {
            console.warn("Unable to parse error JSON");
          }
          let errorMessage =
            errorData?.error?.message || response.statusText || "Unknown error";
          if (response.status === 404) {
            errorMessage =
              "Translation API endpoint not found (404). Please check your API URL.";
          }
          throw new Error(`Translation API error: ${errorMessage}`);
        }

        const data = await response.json();
        sendResponse({ data });
      } catch (error) {
        console.error("Fetch error in background:", error);
        sendResponse({ error: error.message });
      }
    })();
    return true; // برای حفظ حالت async/await مقدار true بازگردانده می‌شود
  }
});
