// src/offscreen-chrome.js
// Chrome-specific offscreen script

let currentAudio = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "playOffscreenAudio" && message.url) {
    // اگر صدایی در حال پخش است، اول متوقفش کنیم
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = "";
    }

    currentAudio = new Audio(message.url);
    currentAudio.crossOrigin = "anonymous";

    currentAudio.addEventListener("ended", () => {
      sendResponse({ success: true });
      currentAudio = null;
    });

    currentAudio.addEventListener("error", (e) => {
      sendResponse({
        success: false,
        error: e.message || "Audio playback error",
      });
      currentAudio = null;
    });

    currentAudio.play().catch((err) => {
      sendResponse({ success: false, error: err.message });
      currentAudio = null;
    });

    return true; // keep async channel open
  } else if (message.action === "stopOffscreenAudio") {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = "";
      currentAudio = null;
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: "No offscreen audio playing" });
    }
    return true;
  }
});