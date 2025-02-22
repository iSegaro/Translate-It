// background.js

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
