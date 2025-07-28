// public/offscreen.js
// Chrome-specific offscreen script

let currentAudio = null;
let currentUtterance = null;

console.log("[Offscreen] TTS script loaded");

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
    "playCachedAudio",
  ];

  console.log("[Offscreen] Checking if TTS message:", {
    action: message.action,
    actionType: typeof message.action,
    isIncluded: ttsActions.includes(message.action),
    ttsActions: ttsActions,
  });

  return ttsActions.includes(message.action);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Offscreen] Received message:", message);

  // Only handle messages explicitly targeted to offscreen context
  if (!message.target || message.target !== "offscreen") {
    console.log("[Offscreen] Message not targeted for offscreen, ignoring:", message.target);
    return false;
  }
  
  // Remove forwardedFromBackground flag if present (clean up)
  const cleanMessage = { ...message };
  delete cleanMessage.forwardedFromBackground;
  delete cleanMessage.target;

  console.log("[Offscreen] Processing message targeted for offscreen:", cleanMessage.action);

  // Handle different TTS and audio actions
  const action = cleanMessage.action;
  
  if (action === "TTS_SPEAK" && cleanMessage.data) {
    handleTTSSpeak(cleanMessage.data, sendResponse);
    return true; // keep async channel open
  }
  else if (action === "TTS_STOP") {
    handleTTSStop(sendResponse);
    return true;
  }
  else if (action === "TTS_TEST") {
    sendResponse({ success: true, message: "Offscreen TTS ready" });
    return false; // synchronous response
  }
  else if (action === "playOffscreenAudio" && cleanMessage.url) {
    handleAudioPlayback(cleanMessage.url, sendResponse);
    return true;
  }
  else if (action === "stopOffscreenAudio") {
    handleAudioStop(sendResponse);
    return true;
  }
  else if (action === "playCachedAudio" && cleanMessage.audioData) {
    handleCachedAudioPlayback(cleanMessage.audioData, sendResponse);
    return true;
  }
  else {
    console.warn("[Offscreen] Unknown offscreen action:", action);
    sendResponse({ success: false, error: `Unknown offscreen action: ${action}` });
    return false;
  }
});

/**
 * Handle TTS speak using Web Speech API
 */
function handleTTSSpeak(data, sendResponse) {
  try {
    console.log("[Offscreen] Starting TTS speak:", data);

    // Stop any current speech
    if (currentUtterance || currentAudio) {
      handleTTSStop(() => {});
    }

    // Convert language code to simple format for Google TTS
    let langCode = data.lang || "en";
    if (langCode.includes("-")) {
      langCode = langCode.split("-")[0]; // Convert 'en-US' to 'en'
    }

    // Try Google TTS first, then fallback to Web Speech API
    console.log("[Offscreen] Trying Google TTS with language:", langCode);
    const googleTTSUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(langCode)}&q=${encodeURIComponent(data.text)}&client=gtx&ttsspeed=1&total=1&idx=0&tk=1`;
    
    // Attempt Google TTS with fallback
    handleAudioPlaybackWithFallback(googleTTSUrl, data, sendResponse);
    
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
    console.error("[Offscreen] TTS speak failed:", error);
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
      console.log("[Offscreen] TTS speech cancelled");
    }

    // Stop audio playback
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = "";
      currentAudio = null;
      stopped = true;
      console.log("[Offscreen] TTS audio stopped");
    }

    sendResponse({ success: true, stopped });
  } catch (error) {
    console.error("[Offscreen] TTS stop failed:", error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle audio playback with fallback to Web Speech API
 */
function handleAudioPlaybackWithFallback(url, ttsData, sendResponse) {
  try {
    console.log("[Offscreen] Attempting Google TTS:", url);
    
    // Stop any current audio
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = "";
    }
    if (currentUtterance) {
      speechSynthesis.cancel();
      currentUtterance = null;
    }

    currentAudio = new Audio();
    currentAudio.crossOrigin = "anonymous";
    
    let responseSent = false;
    
    // Try Google TTS with fetch
    fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://translate.google.com/',
        'Accept': 'audio/*,*/*;q=0.9',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.blob();
    })
    .then(audioBlob => {
      if (!currentAudio) {
        console.warn("[Offscreen] currentAudio is null, creating new instance");
        currentAudio = new Audio();
        currentAudio.crossOrigin = "anonymous";
      }
      const audioUrl = URL.createObjectURL(audioBlob);
      currentAudio.src = audioUrl;
      
      currentAudio.addEventListener("ended", () => {
        console.log("[Offscreen] Google TTS playback ended");
        URL.revokeObjectURL(audioUrl);
        currentAudio = null;
        if (!responseSent) {
          responseSent = true;
          sendResponse({ success: true });
        }
      });

      currentAudio.addEventListener("error", (e) => {
        console.error("[Offscreen] Google TTS playback error:", e);
        URL.revokeObjectURL(audioUrl);
        currentAudio = null;
        if (!responseSent) {
          console.log("[Offscreen] Falling back to Web Speech API");
          handleWebSpeechFallback(ttsData, sendResponse);
          responseSent = true;
        }
      });

      return currentAudio.play();
    })
    .then(() => {
      console.log("[Offscreen] Google TTS playback started successfully");
    })
    .catch((err) => {
      console.error("[Offscreen] Google TTS failed:", err);
      currentAudio = null;
      if (!responseSent) {
        console.log("[Offscreen] Falling back to Web Speech API");
        handleWebSpeechFallback(ttsData, sendResponse);
        responseSent = true;
      }
    });
    
  } catch (error) {
    console.error("[Offscreen] TTS setup failed:", error);
    console.log("[Offscreen] Falling back to Web Speech API");
    handleWebSpeechFallback(ttsData, sendResponse);
  }
}

/**
 * Fallback to Web Speech API with improved reliability
 */
function handleWebSpeechFallback(data, sendResponse) {
  try {
    console.log("[Offscreen] Using Web Speech API fallback");
    
    if ("speechSynthesis" in window) {
      // Reset speechSynthesis if it's in bad state
      if (speechSynthesis.pending || speechSynthesis.speaking) {
        console.log("[Offscreen] Cancelling existing speech synthesis");
        speechSynthesis.cancel();
        // Small delay to ensure cancellation completes
        setTimeout(() => startWebSpeech(), 100);
      } else {
        startWebSpeech();
      }
      
      function startWebSpeech() {
        currentUtterance = new SpeechSynthesisUtterance(data.text);

        // Set voice options
        if (data.lang) currentUtterance.lang = data.lang;
        if (data.rate) currentUtterance.rate = Math.max(0.1, Math.min(10, data.rate)); // Clamp rate
        if (data.pitch) currentUtterance.pitch = Math.max(0, Math.min(2, data.pitch)); // Clamp pitch
        if (data.volume) currentUtterance.volume = Math.max(0, Math.min(1, data.volume)); // Clamp volume

        let responseAlreadySent = false;

        currentUtterance.onend = () => {
          console.log("✅ Web Speech TTS ended");
          currentUtterance = null;
          if (!responseAlreadySent) {
            responseAlreadySent = true;
            sendResponse({ success: true });
          }
        };

        currentUtterance.onerror = (error) => {
          console.error("❌ Web Speech TTS error:", error);
          currentUtterance = null;
          
          if (!responseAlreadySent) {
            responseAlreadySent = true;
            
            // Try to recover from common errors
            if (error.error === 'synthesis-failed' || error.error === 'synthesis-unavailable') {
              console.log("[Offscreen] Attempting Web Speech recovery...");
              
              // Wait a bit and try once more
              setTimeout(() => {
                if (!responseAlreadySent) {
                  speechSynthesis.cancel();
                  const retryUtterance = new SpeechSynthesisUtterance(data.text);
                  retryUtterance.lang = data.lang || 'en-US';
                  retryUtterance.rate = 1; // Use default rate for retry
                  retryUtterance.pitch = 1; // Use default pitch for retry
                  retryUtterance.volume = 1; // Use default volume for retry
                  
                  retryUtterance.onend = () => {
                    console.log("✅ Web Speech TTS retry succeeded");
                    if (!responseAlreadySent) {
                      responseAlreadySent = true;
                      sendResponse({ success: true });
                    }
                  };
                  
                  retryUtterance.onerror = (retryError) => {
                    console.error("❌ Web Speech TTS retry also failed:", retryError);
                    if (!responseAlreadySent) {
                      responseAlreadySent = true;
                      sendResponse({ success: false, error: `Web Speech API failed: ${error.error}, retry failed: ${retryError.error}` });
                    }
                  };
                  
                  speechSynthesis.speak(retryUtterance);
                }
              }, 500);
            } else {
              sendResponse({ success: false, error: `Web Speech API failed: ${error.error}` });
            }
          }
        };

        currentUtterance.onstart = () => {
          console.log("🔊 Web Speech TTS started");
        };

        // Add timeout as additional safety measure
        const timeout = setTimeout(() => {
          if (!responseAlreadySent && currentUtterance) {
            console.warn("[Offscreen] Web Speech TTS timeout, cancelling");
            speechSynthesis.cancel();
            currentUtterance = null;
            responseAlreadySent = true;
            sendResponse({ success: false, error: "Web Speech API timeout" });
          }
        }, 10000); // 10 second timeout

        // Clear timeout when speech ends
        const originalOnEnd = currentUtterance.onend;
        currentUtterance.onend = (event) => {
          clearTimeout(timeout);
          if (originalOnEnd) originalOnEnd(event);
        };

        const originalOnError = currentUtterance.onerror;
        currentUtterance.onerror = (event) => {
          clearTimeout(timeout);
          if (originalOnError) originalOnError(event);
        };

        speechSynthesis.speak(currentUtterance);
      }
    } else {
      throw new Error("Web Speech API not available");
    }
  } catch (error) {
    console.error("[Offscreen] Web Speech API fallback failed:", error);
    sendResponse({ success: false, error: `All TTS methods failed: ${error.message}` });
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

    currentAudio = new Audio();
    
    // Set proper headers and user agent for Google TTS
    currentAudio.crossOrigin = "anonymous";
    
    // Add proper user agent and referer for Google TTS
    if (url.includes('translate.google.com')) {
      // Create a request with proper headers
      fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://translate.google.com/',
          'Accept': 'audio/*,*/*;q=0.9',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.blob();
      })
      .then(audioBlob => {
        const audioUrl = URL.createObjectURL(audioBlob);
        currentAudio.src = audioUrl;
        
        currentAudio.addEventListener("ended", () => {
          console.log("[Offscreen] Audio playback ended");
          URL.revokeObjectURL(audioUrl);
          currentAudio = null;
          sendResponse({ success: true });
        });

        currentAudio.addEventListener("error", (e) => {
          console.error("[Offscreen] Audio playback error:", e);
          URL.revokeObjectURL(audioUrl);
          currentAudio = null;
          sendResponse({
            success: false,
            error: e.message || "Audio playback error",
          });
        });

        currentAudio.addEventListener("loadstart", () => {
          console.log("[Offscreen] Audio loading started");
        });

        return currentAudio.play();
      })
      .then(() => {
        console.log("[Offscreen] Audio playback started successfully");
      })
      .catch((err) => {
        console.error("[Offscreen] Audio fetch/play failed:", err);
        currentAudio = null;
        sendResponse({ success: false, error: err.message });
      });
    } else {
      // Fallback for non-Google TTS URLs
      currentAudio.src = url;
      
      currentAudio.addEventListener("ended", () => {
        console.log("[Offscreen] Audio playback ended");
        currentAudio = null;
        sendResponse({ success: true });
      });

      currentAudio.addEventListener("error", (e) => {
        console.error("[Offscreen] Audio playback error:", e);
        currentAudio = null;
        sendResponse({
          success: false,
          error: e.message || "Audio playback error",
        });
      });

      currentAudio.addEventListener("loadstart", () => {
        console.log("[Offscreen] Audio loading started");
      });

      currentAudio
        .play()
        .then(() => {
          console.log("[Offscreen] Audio playback started");
        })
        .catch((err) => {
          console.error("[Offscreen] Audio play failed:", err);
          currentAudio = null;
          sendResponse({ success: false, error: err.message });
        });
    }
  } catch (error) {
    console.error("[Offscreen] Audio playback setup failed:", error);
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

/**
 * Handle cached audio blob playback
 * @param {Array} audioData - Audio data as byte array
 * @param {Function} sendResponse - Response callback
 */
function handleCachedAudioPlayback(audioData, sendResponse) {
  try {
    console.log("[Offscreen] Playing cached audio blob:", audioData.length, "bytes");
    
    // Stop any current audio
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = "";
    }

    // Convert byte array back to Blob
    const uint8Array = new Uint8Array(audioData);
    const audioBlob = new Blob([uint8Array], { type: 'audio/mpeg' });
    const audioUrl = URL.createObjectURL(audioBlob);
    
    console.log("[Offscreen] Created blob URL for cached audio:", audioUrl);

    // Create and setup audio element
    currentAudio = new Audio(audioUrl);
    currentAudio.crossOrigin = "anonymous";

    currentAudio.addEventListener("ended", () => {
      console.log("[Offscreen] Cached audio playback ended");
      URL.revokeObjectURL(audioUrl); // Clean up memory
      currentAudio = null;
      sendResponse({ success: true });
    });

    currentAudio.addEventListener("error", (e) => {
      console.error("[Offscreen] Cached audio playback error:", e);
      URL.revokeObjectURL(audioUrl); // Clean up memory
      currentAudio = null;
      sendResponse({
        success: false,
        error: e.message || "Cached audio playback error",
      });
    });

    currentAudio.addEventListener("loadstart", () => {
      console.log("[Offscreen] Cached audio loading started");
    });

    currentAudio.addEventListener("canplaythrough", () => {
      console.log("[Offscreen] Cached audio can play through");
    });

    // Start playback
    currentAudio
      .play()
      .then(() => {
        console.log("[Offscreen] Cached audio playback started successfully");
      })
      .catch((err) => {
        console.error("[Offscreen] Cached audio play failed:", err);
        URL.revokeObjectURL(audioUrl);
        currentAudio = null;
        sendResponse({ success: false, error: err.message });
      });
      
  } catch (error) {
    console.error("[Offscreen] Cached audio setup failed:", error);
    sendResponse({ success: false, error: error.message });
  }
}
