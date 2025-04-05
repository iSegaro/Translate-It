// This script runs in the offscreen document and handles audio playback.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "playOffscreenAudio") {
    console.log(
      "[Offscreen]: Received playOffscreenAudio message:",
      message.url
    ); // لاگ کردن URL
    const audio = document.getElementById("tts-audio");
    audio.src = message.url;
    audio
      .play()
      .then(() => sendResponse(true))
      .catch((error) => {
        console.error("Offscreen audio playback error:", error);
        sendResponse(false); // Indicate failure
      });
    return true; // Indicate async response
  }
});
