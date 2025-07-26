// public/offscreen.js
// Chrome-specific offscreen script

let currentAudio = null;
let currentUtterance = null;

console.log("🔊 Offscreen TTS script loaded");

// Signal readiness immediately to parent
if (chrome.runtime) {
  chrome.runtime.sendMessage({ action: "OFFSCREEN_READY" }).catch(() => {});
}

/**
 * Check if message is TTS-related
 * @param {Object} message - The message object
 * @returns {boolean} True if TTS message
 */
function isTTSMessage(message) {
  const ttsActions = [
    "TTS_SPEAK",
    "TTS_STOP",
    "TTS_TEST",
    "TTS_PAUSE",
    "TTS_RESUME",
    "TTS_GET_VOICES",
    "playOffscreenAudio",
    "stopOffscreenAudio",
    "speak",
    "stopTTS",
  ];

  console.log("🔍 Checking if TTS message:", {
    action: message.action,
    actionType: typeof message.action,
    isIncluded: ttsActions.includes(message.action),
    ttsActions: ttsActions,
  });

  return ttsActions.includes(message.action);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("📨 Offscreen received message:", message);

  // Only handle messages specifically targeted to offscreen context
  if (message.target && message.target !== "offscreen") {
    console.log("🔀 Message not for offscreen, ignoring:", message.target);
    return false;
  }

  // Forward non-TTS messages to background service worker
  if (!isTTSMessage(message)) {
    console.log("🔄 Forwarding non-TTS message to background:", message.action);
    chrome.runtime
      .sendMessage({
        ...message,
        forwardedFromOffscreen: true,
      })
      .then((response) => {
        if (sendResponse) sendResponse(response);
      })
      .catch((error) => {
        console.error("❌ Failed to forward message:", error);
        if (sendResponse)
          sendResponse({ success: false, error: error.message });
      });
    return true; // Keep async channel open
  }

  // Handle TTS speak requests (new format)
  if (message.action === "TTS_SPEAK" && message.data) {
    handleTTSSpeak(message.data, sendResponse);
    return true; // keep async channel open
  }

  // Handle legacy 'speak' action from sidepanel/popup
  else if (message.action === "speak") {
    console.log("🎤 Handling legacy speak action:", message);

    // Convert legacy format to new format
    const ttsData = {
      text: message.text || "",
      lang: message.lang || "en",
      rate: message.rate || 1,
      pitch: message.pitch || 1,
      volume: message.volume || 1,
    };

    handleTTSSpeak(ttsData, sendResponse);
    return true; // keep async channel open
  }

  // Handle TTS stop requests
  else if (message.action === "TTS_STOP") {
    handleTTSStop(sendResponse);
    return true;
  }

  // Handle TTS test requests
  else if (message.action === "TTS_TEST") {
    sendResponse({ success: true, message: "Offscreen TTS ready" });
    return false; // synchronous response
  }

  // Legacy audio playback support
  else if (message.action === "playOffscreenAudio" && message.url) {
    handleAudioPlayback(message.url, sendResponse);
    return true;
  }

  // Legacy audio stop support
  else if (message.action === "stopOffscreenAudio") {
    handleAudioStop(sendResponse);
    return true;
  }

  console.warn("❓ Unknown offscreen message action:", message.action);
  sendResponse({ success: false, error: "Unknown action" });
  return false;
});

/**
 * Handle TTS speak using Web Speech API
 */
function handleTTSSpeak(data, sendResponse) {
  try {
    console.log("🗣️ Starting TTS speak:", data);

    // Stop any current speech
    if (currentUtterance || currentAudio) {
      handleTTSStop(() => {});
    }

    // Convert language code to simple format for Google TTS
    let langCode = data.lang || "en";
    if (langCode.includes("-")) {
      langCode = langCode.split("-")[0]; // Convert 'en-US' to 'en'
    }

    // Use Google TTS URL directly (more reliable in offscreen)
    console.log("🌐 Using Google TTS with language:", langCode);
    const googleTTSUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(langCode)}&q=${encodeURIComponent(data.text)}&client=gtx`;
    handleAudioPlayback(googleTTSUrl, sendResponse);
    
    // Fallback to Web Speech API only if Google TTS fails
    // (Commented out due to synthesis-failed errors in offscreen)
    /*
    if ("speechSynthesis" in window) {
      currentUtterance = new SpeechSynthesisUtterance(data.text);

      // Set voice options
      if (data.lang) currentUtterance.lang = data.lang;
      if (data.rate) currentUtterance.rate = data.rate;
      if (data.pitch) currentUtterance.pitch = data.pitch;
      if (data.volume) currentUtterance.volume = data.volume;

      currentUtterance.onend = () => {
        console.log("✅ TTS speech ended");
        currentUtterance = null;
        sendResponse({ success: true });
      };

      currentUtterance.onerror = (error) => {
        console.error("❌ TTS speech error:", error);
        currentUtterance = null;
        // Fallback to Google TTS on speech synthesis error
        const googleTTSUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(langCode)}&q=${encodeURIComponent(data.text)}&client=gtx`;
        handleAudioPlayback(googleTTSUrl, sendResponse);
      };

      currentUtterance.onstart = () => {
        console.log("🔊 TTS speech started");
      };

      speechSynthesis.speak(currentUtterance);
    }
    */
  } catch (error) {
    console.error("❌ TTS speak failed:", error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle TTS stop
 */
function handleTTSStop(sendResponse) {
  try {
    let stopped = false;

    // Stop speech synthesis
    if (currentUtterance) {
      speechSynthesis.cancel();
      currentUtterance = null;
      stopped = true;
      console.log("🛑 TTS speech cancelled");
    }

    // Stop audio playback
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = "";
      currentAudio = null;
      stopped = true;
      console.log("🛑 TTS audio stopped");
    }

    sendResponse({ success: true, stopped });
  } catch (error) {
    console.error("❌ TTS stop failed:", error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle audio playback (legacy support)
 */
function handleAudioPlayback(url, sendResponse) {
  try {
    // Stop any current audio
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = "";
    }

    currentAudio = new Audio(url);
    currentAudio.crossOrigin = "anonymous";

    currentAudio.addEventListener("ended", () => {
      console.log("✅ Audio playback ended");
      currentAudio = null;
      sendResponse({ success: true });
    });

    currentAudio.addEventListener("error", (e) => {
      console.error("❌ Audio playback error:", e);
      currentAudio = null;
      sendResponse({
        success: false,
        error: e.message || "Audio playback error",
      });
    });

    currentAudio.addEventListener("loadstart", () => {
      console.log("🔊 Audio loading started");
    });

    currentAudio
      .play()
      .then(() => {
        console.log("▶️ Audio playback started");
      })
      .catch((err) => {
        console.error("❌ Audio play failed:", err);
        currentAudio = null;
        sendResponse({ success: false, error: err.message });
      });
  } catch (error) {
    console.error("❌ Audio playback setup failed:", error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle audio stop (legacy support)
 */
function handleAudioStop(sendResponse) {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
    sendResponse({ success: true });
  } else {
    sendResponse({ success: false, error: "No offscreen audio playing" });
  }
}
