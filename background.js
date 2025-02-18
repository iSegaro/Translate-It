// background.js

// Listen for extension icon clicks and send a message to enable selection mode
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { action: "enable_selection" });
});
