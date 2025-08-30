// public/offscreen.js
// Chrome-specific offscreen script

// Enhanced logging for offscreen document
const createOffscreenLogger = () => {
  const prefix = '[Offscreen]';
  return {
    debug: (...args) => console.log(`[DEBUG] ${prefix}`, ...args),
    info: (...args) => console.log(`[INFO] ${prefix}`, ...args),
    warn: (...args) => console.warn(`[WARN] ${prefix}`, ...args),
    error: (...args) => console.error(`[ERROR] ${prefix}`, ...args),
    log: (...args) => console.log(`[LOG] ${prefix}`, ...args) // Alias for compatibility
  };
};

const logger = createOffscreenLogger();

let currentAudio = null;
let currentUtterance = null;

logger.info("TTS script loaded - Version 1.5 - Fixed race condition and null audio cleanup");

// Signal readiness immediately to parent
if (chrome.runtime) {
  chrome.runtime.sendMessage({ action: "OFFSCREEN_READY" }).catch(() => {});
  // Try multiple times to ensure readiness is sent
  setTimeout(() => chrome.runtime.sendMessage({ action: "OFFSCREEN_READY" }).catch(() => {}), 100);
  setTimeout(() => chrome.runtime.sendMessage({ action: "OFFSCREEN_READY" }).catch(() => {}), 500);
}


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  logger.debug("Received message:", message);
  

  // Only handle messages explicitly targeted to offscreen context
  if (!message.target || message.target !== "offscreen") {
    logger.debug("Message not targeted for offscreen, ignoring:", message.target);
    return false;
  }
  
  // Remove forwardedFromBackground flag if present (clean up)
  const cleanMessage = { ...message };
  delete cleanMessage.forwardedFromBackground;
  delete cleanMessage.target;

  logger.info("Processing message targeted for offscreen:", cleanMessage.action);

  // Handle different TTS and audio actions
  const action = cleanMessage.action;
  
  if (action === "TTS_SPEAK" && cleanMessage.data) {
    handleTTSSpeak(cleanMessage.data, sendResponse);
    return true; // keep async channel open
  }
  else if (action === "TTS_STOP" || action === "handleTTSStop") {
    handleTTSStop(sendResponse);
    return true;
  }
  else if (action === "TTS_PAUSE" || action === "handleTTSPause") {
    handleTTSPause(sendResponse);
    return true;
  }
  else if (action === "TTS_RESUME" || action === "handleTTSResume") {
    handleTTSResume(sendResponse);
    return true;
  }
  else if (action === "handleTTSGetStatus") {
    handleTTSGetStatus(sendResponse);
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
  else if (action === "TTS_GET_VOICES") {
    handleTTSGetVoices(sendResponse);
    return true;
  }
  else if (action === "playCachedAudio" && cleanMessage.audioData) {
    handleCachedAudioPlayback(cleanMessage.audioData, sendResponse);
    return true;
  }
  else {
    logger.warn("Unknown offscreen action:", action);
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
    let langCode = data.language || data.lang || "en"; // Support both 'language' and 'lang' parameters
    if (langCode.includes("-")) {
      langCode = langCode.split("-")[0]; // Convert 'en-US' to 'en'
    }
    
    console.log("[Offscreen] Language parameter debug:", {
      dataLanguage: data.language,
      dataLang: data.lang,
      finalLangCode: langCode,
      originalData: data
    });

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
 * Handle TTS get voices
 */
function handleTTSGetVoices(sendResponse) {
  try {
    console.log("[Offscreen] Getting available TTS voices");
    
    if ("speechSynthesis" in window) {
      // Get available voices
      let voices = speechSynthesis.getVoices();
      
      // If voices array is empty, wait for voiceschanged event
      if (voices.length === 0) {
        let responseAlreadySent = false;
        
        const voicesChangedHandler = () => {
          if (responseAlreadySent) return;
          responseAlreadySent = true;
          
          voices = speechSynthesis.getVoices();
          console.log("[Offscreen] Voices loaded:", voices.length);
          sendResponse({ 
            success: true, 
            voices: voices.map(voice => ({
              name: voice.name,
              lang: voice.lang,
              default: voice.default,
              localService: voice.localService
            }))
          });
        };
        
        speechSynthesis.addEventListener('voiceschanged', voicesChangedHandler, { once: true });
        
        // Set a timeout in case voiceschanged doesn't fire
        setTimeout(() => {
          if (responseAlreadySent) return;
          responseAlreadySent = true;
          
          voices = speechSynthesis.getVoices();
          console.log("[Offscreen] Timeout reached, voices available:", voices.length);
          sendResponse({ 
            success: true, 
            voices: voices.map(voice => ({
              name: voice.name,
              lang: voice.lang,
              default: voice.default,
              localService: voice.localService
            }))
          });
        }, 1000);
      } else {
        console.log("[Offscreen] Voices available:", voices.length);
        sendResponse({ 
          success: true, 
          voices: voices.map(voice => ({
            name: voice.name,
            lang: voice.lang,
            default: voice.default,
            localService: voice.localService
          }))
        });
      }
    } else {
      console.warn("[Offscreen] Speech synthesis not available");
      sendResponse({ success: true, voices: [] });
    }
  } catch (error) {
    console.error("[Offscreen] Failed to get TTS voices:", error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle TTS stop
 */
function handleTTSStop(sendResponse) {
  // Create safe response wrapper to prevent duplicate calls
  let responseSent = false;
  const safeResponse = (response) => {
    if (!responseSent) {
      responseSent = true;
      try {
        sendResponse(response);
      } catch (error) {
        console.log("[Offscreen] Response already sent or connection closed:", error.message);
      }
    } else {
      console.log("[Offscreen] Duplicate response attempt blocked");
    }
  };

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
      // Pause first to prevent further events
      currentAudio.pause();
      // Clear source safely
      try {
        currentAudio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
        currentAudio.load(); // Reset to empty state
      } catch(e) {
        // Ignore errors during cleanup
      }
      currentAudio = null;
      stopped = true;
      console.log("[Offscreen] TTS audio stopped");
    }

    safeResponse({ success: true, stopped });
  } catch (error) {
    console.error("[Offscreen] TTS stop failed:", error);
    safeResponse({ success: false, error: error.message });
  }
}

/**
 * Handle TTS pause
 */
function handleTTSPause(sendResponse) {
  try {
    let paused = false;

    // Pause speech synthesis
    if (currentUtterance && speechSynthesis.speaking && !speechSynthesis.paused) {
      speechSynthesis.pause();
      paused = true;
      console.log("[Offscreen] TTS speech paused");
    }

    // Pause audio playback
    if (currentAudio && !currentAudio.paused) {
      currentAudio.pause();
      paused = true;
      console.log("[Offscreen] TTS audio paused");
    }

    sendResponse({ success: true, paused });
  } catch (error) {
    console.error("[Offscreen] TTS pause failed:", error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle TTS resume
 */
function handleTTSResume(sendResponse) {
  try {
    let resumed = false;

    // Resume speech synthesis
    if (currentUtterance && speechSynthesis.paused) {
      speechSynthesis.resume();
      resumed = true;
      console.log("[Offscreen] TTS speech resumed");
    }

    // Resume audio playback
    if (currentAudio && currentAudio.paused) {
      currentAudio.play().then(() => {
        console.log("[Offscreen] TTS audio resumed");
      }).catch((error) => {
        console.error("[Offscreen] Failed to resume audio:", error);
      });
      resumed = true;
    }

    sendResponse({ success: true, resumed });
  } catch (error) {
    console.error("[Offscreen] TTS resume failed:", error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle TTS get status
 */
function handleTTSGetStatus(sendResponse) {
  try {
    let status = 'idle';
    
    // Check speech synthesis status
    if (currentUtterance) {
      if (speechSynthesis.paused) {
        status = 'paused';
      } else if (speechSynthesis.speaking) {
        status = 'playing';
      }
    }
    
    // Check audio playback status
    if (currentAudio) {
      if (currentAudio.paused) {
        status = currentAudio.currentTime > 0 ? 'paused' : 'idle';
      } else {
        status = 'playing';
      }
    }
    
    console.log("[Offscreen] TTS status:", status);
    sendResponse({ success: true, status });
  } catch (error) {
    console.error("[Offscreen] TTS get status failed:", error);
    sendResponse({ success: false, error: error.message, status: 'error' });
  }
}

/**
 * Handle audio playback with fallback to Web Speech API
 */
function handleAudioPlaybackWithFallback(url, ttsData, sendResponse) {
  try {
    console.log("[Offscreen] Attempting Google TTS:", url);
    
    // Always create a new Audio object to avoid race conditions with global currentAudio
    const newAudio = new Audio();
    if (currentAudio) { // Stop and clear previous audio if it exists
      handleAudioStop(() => {}); // Use the dedicated stop function
    }
    if (currentUtterance) {
      speechSynthesis.cancel();
      currentUtterance = null;
    }

    currentAudio = newAudio; // Assign the new audio object to global currentAudio
    currentAudio.crossOrigin = "anonymous"; // Set crossOrigin after creating new Audio
    
    let responseSent = false;
    
    // Timeout for Google TTS fetch
    const fetchTimeout = setTimeout(() => {
      if (!responseSent) {
        console.warn("[Offscreen] Google TTS fetch timeout, falling back to Web Speech");
        responseSent = true;
        handleWebSpeechFallback(ttsData, sendResponse);
      }
    }, 3000); // 3 second timeout for fetch
    
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
      clearTimeout(fetchTimeout); // Clear the timeout on successful response
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
        
        // Always notify frontend that TTS ended (real completion)
        chrome.runtime.sendMessage({ action: 'GOOGLE_TTS_ENDED' }).catch(err => {
          console.log("[Offscreen] Failed to send TTS ended notification:", err);
        });
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
      // Send success response after play() succeeds
      if (!responseSent) {
        responseSent = true;
        sendResponse({ success: true, message: "Audio playback started" });
      }
    })
    .catch(async (err) => { // Make this catch block async
      clearTimeout(fetchTimeout); // Clear the timeout on error too
      console.error("[Offscreen] Google TTS failed:", err);
      currentAudio = null;
      if (!responseSent) {
        responseSent = true; // Set responseSent to true here to prevent duplicate responses
        console.log("[Offscreen] Falling back to Web Speech API");
        // Await the fallback to ensure its response is sent
        try {
          await handleWebSpeechFallback(ttsData, sendResponse); // Pass sendResponse directly
        } catch (fallbackError) {
          console.error("[Offscreen] Web Speech API fallback also failed:", fallbackError);
          // If fallback also fails, send a final failure response
          sendResponse({ success: false, error: fallbackError.message || 'Web Speech API fallback failed' });
        }
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

        // Set voice options - support both 'language' and 'lang' parameters
        const voiceLang = data.language || data.lang;
        if (voiceLang) currentUtterance.lang = voiceLang;
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
                  retryUtterance.lang = data.language || data.lang || 'en-US';
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
        }, 5000); // 5 second timeout

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
  logger.debug("Starting audio playback for URL:", url.substring(0, 100) + '...');
  
  // Create a safe response wrapper to prevent multiple calls
  let responseSent = false;
  const safeResponse = (response) => {
    if (!responseSent) {
      responseSent = true;
      logger.debug("Sending response to background:", response);
      
      try {
        sendResponse(response);
        logger.debug("Response sent successfully");
      } catch (error) {
        logger.error("Response send failed:", error);
        // Try alternative approach
        setTimeout(() => {
          try {
            sendResponse(response);
            logger.debug("Response sent via retry");
          } catch (retryError) {
            logger.error("Response retry failed:", retryError);
          }
        }, 50);
      }
    } else {
      logger.warn("Duplicate response attempt blocked");
    }
  };
  
  try {
    // Stop any current audio
    if (currentAudio) {
      logger.debug("Stopping current audio");
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
        if (currentAudio) {
          currentAudio.src = audioUrl;
        } else {
          logger.warn("currentAudio was null during blob assignment, cleaning up");
          URL.revokeObjectURL(audioUrl);
          return Promise.reject(new Error('Audio was stopped during fetch'));
        }
        
        currentAudio.addEventListener("ended", () => {
          logger.info("Audio playback ended");
          URL.revokeObjectURL(audioUrl);
          currentAudio = null;
          
          // Send completion notification to frontend
          chrome.runtime.sendMessage({ action: 'GOOGLE_TTS_ENDED' }).catch(err => {
            logger.error("Failed to send TTS ended notification:", err);
          });
        });

        currentAudio.addEventListener("error", (e) => {
          logger.error("Audio playback error:", e);
          URL.revokeObjectURL(audioUrl);
          currentAudio = null;
          safeResponse({
            success: false,
            error: e.message || "Audio playback error",
          });
        });

        currentAudio.addEventListener("loadstart", () => {
          logger.debug("Audio loading started");
        });

        return currentAudio.play();
      })
      .then(() => {
        logger.info("Audio playback started successfully");
        // Send success response immediately after playback starts, don't wait for end
        logger.debug("Sending success response to background...");
        
        // Send response immediately while the runtime channel is still open
        const responseData = { success: true, message: "Audio playback started" };
        logger.debug("About to call safeResponse with:", responseData);
        safeResponse(responseData);
        logger.debug("safeResponse called successfully");
        
        // ALSO send success via separate message (backup method)
        chrome.runtime.sendMessage({ 
          action: 'GOOGLE_TTS_STARTED',
          success: true 
        }).catch(err => {
          logger.debug("Backup success message send failed:", err);
        });
      })
      .catch((err) => {
        logger.error("Audio fetch/play failed:", err);
        currentAudio = null;
        safeResponse({ success: false, error: err.message });
      });
    } else {
      // Fallback for non-Google TTS URLs
      currentAudio.src = url;
      
      currentAudio.addEventListener("ended", () => {
        console.log("[Offscreen] Audio playback ended");
        currentAudio = null;
        // Don't send response here anymore, already sent after play() starts
      });

      currentAudio.addEventListener("error", (e) => {
        console.error("[Offscreen] Audio playback error:", e);
        currentAudio = null;
        safeResponse({
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
          // Send success response immediately after playback starts
          safeResponse({ success: true });
        })
        .catch((err) => {
          console.error("[Offscreen] Audio play failed:", err);
          currentAudio = null;
          safeResponse({ success: false, error: err.message });
        });
    }
  } catch (error) {
    console.error("[Offscreen] Audio playback setup failed:", error);
    safeResponse({ success: false, error: error.message });
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
