// config.js

const CONFIG = {
  USE_MOCK: false,
  API_URL:
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite-preview-02-05:generateContent",
  PROMPT_ENGLISH:
    "Please translate the following text into English, preserving the sentence structure (like new lines) and displaying only the output:",
  PROMPT_PERSIAN:
    "لطفاً متن زیر را به فارسی ترجمه کنید، ساختار جمله (مانند خطوط جدید) را حفظ کرده و فقط خروجی را نمایش دهید:",
  HIGHLIGHT_STYLE: "2px solid red",
  DEBUG_TRANSLATED_ENGLISH: "This is a mock translation to English.",
  DEBUG_TRANSLATED_PERSIAN: "این یک ترجمه آزمایشی به فارسی است.",
  DEBUG_TRANSLATED_ENGLISH_With_NewLine:
    "This is a mock \ntranslation to English with \nnew lines.",
  DEBUG_TRANSLATED_PERSIAN_With_NewLine:
    "این یک ترجمه آزمایشی \nبرای ترجمه به فارسی \nبا خطوط جدید است.",
  HIGHTLIH_NEW_ELEMETN_RED: "2px solid red",
  TRANSLATION_ICON_TITLE: "Translate Text",
  ICON_TRANSLATION: "🌐",
  ICON_ERROR: "❌ ",
  ICON_SECCESS: "✅ ",
  ICON_STATUS: "🔄 ",
  ICON_WARNING: "⚠️ ",
  ICON_INFO: "💠 ",
};

// Helper function to retrieve the API_KEY from chrome.storage

async function getApiKeyAsync() {
  return new Promise((resolve, reject) => {
    try {
      if (!isExtensionContextValid()) {
        reject(new Error("Extension context invalid"));
        return;
      }

      // Check if chrome.storage exists
      if (!chrome?.storage?.sync) {
        throw new Error("Error: The extension has not loaded correctly");
      }

      chrome.storage.sync.get(["apiKey"], (result) => {
        if (chrome.runtime.lastError) {
          reject(
            new Error(`System error: ${chrome.runtime.lastError.message}`)
          );
          return;
        }

        if (!result.apiKey) {
          reject(
            new Error("Please enter the API key in the extension settings")
          );
          return;
        }

        resolve(result.apiKey);
      });
    } catch (error) {
      reject(new Error(`Access error: ${error.message}`));
    }
  });
}
