// popup.js

// Section for restoring the original text
document.getElementById("restore").addEventListener("click", () => {
  chrome.scripting.executeScript({
    target: { allFrames: true },
    function: () => {
      document.querySelectorAll("[data-original-text]").forEach((element) => {
        element.innerText = element.dataset.originalText;
        delete element.dataset.originalText;
      });
    },
  });
});

// Section for API Key management
document.addEventListener("DOMContentLoaded", () => {
  // Retrieve the saved key (if it exists)
  chrome.storage.sync.get("apiKey", (data) => {
    if (data.apiKey) {
      document.getElementById("apiKey").value = data.apiKey;
    }
  });
});

document.getElementById("saveApiKey").addEventListener("click", () => {
  const apiKey = document.getElementById("apiKey").value.trim();
  chrome.storage.sync.set({ apiKey }, () => {
    console.log("API key saved:", apiKey);
    // You can display a success message to the user if needed
  });
});
