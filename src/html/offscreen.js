import LiveCaptionOffscreenRuntimeShell, {
  LIVE_CAPTION_RUNTIME_ACTIONS
} from './liveCaptionOffscreenRuntimeShell.js';

// src/public/offscreen.js
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

// Import ResourceTracker for memory management
// Note: Since this is an offscreen document, we'll create a simple tracker
class OffscreenResourceTracker {
  constructor() {
    this.timeouts = new Set();
    this.intervals = new Set();
    this.eventListeners = new Map(); // Track event listeners: element -> {event, handler, options}
  }

  trackTimeout(callback, delay) {
    const timeoutId = setTimeout(() => {
      this.timeouts.delete(timeoutId);
      callback();
    }, delay);
    this.timeouts.add(timeoutId);
    return timeoutId;
  }

  clearTimeout(timeoutId) {
    if (this.timeouts.has(timeoutId)) {
      clearTimeout(timeoutId);
      this.timeouts.delete(timeoutId);
    }
  }

  addEventListener(element, event, handler, options = {}) {
    // Store the listener info for cleanup
    if (!this.eventListeners.has(element)) {
      this.eventListeners.set(element, []);
    }
    this.eventListeners.get(element).push({ event, handler, options });

    // Add the actual listener
    element.addEventListener(event, handler, options);
  }

  cleanup() {
    // Clear all tracked timeouts
    for (const timeoutId of this.timeouts) {
      clearTimeout(timeoutId);
    }
    this.timeouts.clear();

    // Clear all tracked intervals
    for (const intervalId of this.intervals) {
      clearInterval(intervalId);
    }
    this.intervals.clear();

    // Clear all tracked event listeners
    for (const [element, listeners] of this.eventListeners) {
      for (const { event, handler, options } of listeners) {
        element.removeEventListener(event, handler, options);
      }
    }
    this.eventListeners.clear();
  }
}

// Create global resource tracker for offscreen
const resourceTracker = new OffscreenResourceTracker();
const liveCaptionOffscreenRuntimeShell = new LiveCaptionOffscreenRuntimeShell();

let currentAudio = null;
let currentUtterance = null;
let currentFetchController = null;
let isPlaying = false;

logger.info("TTS script loaded - Version 1.5 - Fixed race condition and null audio cleanup");

// Signal readiness immediately to parent
if (chrome.runtime) {
  chrome.runtime.sendMessage({ action: "OFFSCREEN_READY" }).catch(() => {});
  // Try multiple times to ensure readiness is sent
  resourceTracker.trackTimeout(() => chrome.runtime.sendMessage({ action: "OFFSCREEN_READY" }).catch(() => {}), 100);
  resourceTracker.trackTimeout(() => chrome.runtime.sendMessage({ action: "OFFSCREEN_READY" }).catch(() => {}), 500);
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

  if (Object.values(LIVE_CAPTION_RUNTIME_ACTIONS).includes(action)) {
    Promise.resolve(liveCaptionOffscreenRuntimeShell.handleMessage(cleanMessage, sender))
      .then((response) => {
        sendResponse(response);
      })
      .catch((error) => {
        logger.error('Error handling live caption runtime action in offscreen:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // keep async channel open
  }
  
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
    // Use the enhanced function with proper state management and fallback
    const ttsData = {
      text: "TTS Audio", // Placeholder since we already have the URL
      language: "en" // Default language
    };
    handleAudioPlaybackWithFallback(cleanMessage.url, ttsData, sendResponse);
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
  else if (action === "OCR_PROCESS" && cleanMessage.data) {
    handleOCRProcess(cleanMessage.data, sendResponse);
    return true; // keep async channel open
  }
  else if (action === "GENERATE_COMPOSITE_ICON" && cleanMessage.data) {
    // Handle composite icon generation inline
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 32;
      canvas.height = 32;

      const baseImg = new Image();
      const overlayImg = new Image();

      let loadedCount = 0;
      let totalImages = cleanMessage.data.overlayBlob ? 2 : 1;

      const onLoad = () => {
        loadedCount++;
        if (loadedCount === totalImages) {
          // Draw base icon
          ctx.drawImage(baseImg, 0, 0, 32, 32);

          // Draw provider icon as small overlay in bottom-right corner if available
          if (cleanMessage.data.overlayBlob) {
            const overlaySize = 20;
            const overlayX = 32 - overlaySize - 2;
            const overlayY = 32 - overlaySize - 2;

            // Draw provider icon directly without background
            ctx.drawImage(overlayImg, overlayX, overlayY, overlaySize, overlaySize);
          }

          // Convert to ImageData
          const imageData = ctx.getImageData(0, 0, 32, 32);
          
          // Convert ImageData to transferable format
          sendResponse({ 
            success: true, 
            imageData: {
              width: imageData.width,
              height: imageData.height,
              data: Array.from(imageData.data)
            }
          });
        }
      };

      const onError = () => {
        sendResponse({ success: false, error: 'Failed to load image' });
      };

      baseImg.onload = onLoad;
      baseImg.onerror = onError;
      overlayImg.onload = onLoad;
      overlayImg.onerror = onError;

      baseImg.crossOrigin = 'anonymous';
      overlayImg.crossOrigin = 'anonymous';

      baseImg.src = cleanMessage.data.baseBlob;
      if (cleanMessage.data.overlayBlob) {
        overlayImg.src = cleanMessage.data.overlayBlob;
      }
      
    } catch {
      sendResponse({ success: false, error: 'Composite icon generation failed' });
    }
    return true;
  }
  else if (action === "GENERATE_SIMPLE_OVERLAY_ICON" && cleanMessage.data) {
    // Handle simple overlay icon generation
    console.log('[Offscreen] Generating simple overlay icon for provider:', cleanMessage.data.provider);
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 32;
      canvas.height = 32;

      // Create a simple base icon (blue square)
      ctx.fillStyle = '#4285f4';
      ctx.fillRect(0, 0, 32, 32);

      // Add provider-specific color overlay
      const providerColors = {
        'google': '#4285f4',
        'gemini': '#8e44ad',
        'bing': '#00BCF2',
        'yandex': '#FF0000',
        'openai': '#412991',
        'openrouter': '#FF6B35',
        'deepseek': '#00A67E',
        'webai': '#FF9500',
        'custom': '#9CA3AF',
        'browserapi': '#4CAF50'
      };

      const overlayColor = providerColors[cleanMessage.data.provider] || '#9CA3AF';
      
      // Draw small colored square in bottom-right
      ctx.fillStyle = overlayColor;
      ctx.fillRect(20, 20, 10, 10);

      // Add white border
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1;
      ctx.strokeRect(20, 20, 10, 10);

      // Convert to ImageData
      const imageData = ctx.getImageData(0, 0, 32, 32);
      
      sendResponse({ 
        success: true, 
        imageData: {
          width: imageData.width,
          height: imageData.height,
          data: Array.from(imageData.data)
        }
      });
    } catch {
      sendResponse({ success: false, error: 'Simple overlay icon generation failed' });
    }
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
        resourceTracker.trackTimeout(() => {
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

    // Cancel ongoing fetch if any
    if (currentFetchController) {
      logger.debug("[Offscreen] Aborting ongoing fetch request");
      currentFetchController.abort();
      currentFetchController = null;
      stopped = true;
    }

    // Reset playing state
    isPlaying = false;

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
      } catch {
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
 * Note: Currently unused in the project, added for future extensibility.
 */
function handleTTSPause(sendResponse) {
  try {
    let paused = false;

    if (currentUtterance && speechSynthesis.speaking && !speechSynthesis.paused) {
      speechSynthesis.pause();
      paused = true;
      console.log("[Offscreen] TTS speech paused");
    }

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
 * Note: Currently unused in the project, added for future extensibility.
 */
function handleTTSResume(sendResponse) {
  try {
    let resumed = false;

    if (currentUtterance && speechSynthesis.paused) {
      speechSynthesis.resume();
      resumed = true;
      console.log("[Offscreen] TTS speech resumed");
    }

    if (currentAudio && currentAudio.paused) {
      currentAudio.play().catch(error => {
        console.error("[Offscreen] TTS audio resume failed:", error);
      });
      resumed = true;
      console.log("[Offscreen] TTS audio resumed");
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
    
    // Prevent multiple simultaneous requests
    if (isPlaying) {
      handleTTSStop(() => {}); // Stop current playback
    }
    
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
    isPlaying = true; // Mark as playing
    
    let responseSent = false;
    
    // Create AbortController for fetch cancellation
    currentFetchController = new AbortController();
    
    // Timeout for Google TTS fetch
    const fetchTimeout = resourceTracker.trackTimeout(() => {
      if (!responseSent && currentFetchController) {
        currentFetchController.abort();
        currentFetchController = null;
        isPlaying = false;
        responseSent = true;
        handleWebSpeechFallback(ttsData, sendResponse);
      }
    }, 3000); // 3 second timeout for fetch
    
    // Try Google TTS with fetch
    fetch(url, {
      method: 'GET',
      signal: currentFetchController.signal, // Add AbortController signal
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://translate.google.com/',
        'Accept': 'audio/*,*/*;q=0.9',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    })
    .then(response => {
      resourceTracker.clearTimeout(fetchTimeout); // Clear the timeout on successful response
      currentFetchController = null; // Clear the AbortController reference
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.blob();
    })
    .then(audioBlob => {
      // Check if audio was stopped during fetch (race condition protection)
      if (!currentAudio || !isPlaying) {
        console.warn("[Offscreen] currentAudio was null or stopped during fetch, cleaning up blob");
        URL.revokeObjectURL(URL.createObjectURL(audioBlob)); // Clean up blob
        isPlaying = false;
        if (!responseSent) {
          responseSent = true;
          sendResponse({ success: false, error: "Audio was stopped during fetch" });
        }
        return Promise.reject(new Error('Audio was stopped during fetch'));
      }
      
      const audioUrl = URL.createObjectURL(audioBlob);
      currentAudio.src = audioUrl;
      
      resourceTracker.addEventListener(currentAudio, "ended", () => {
          URL.revokeObjectURL(audioUrl);
        currentAudio = null;
        isPlaying = false; // Reset playing state
        
        // Notify background that this chunk ended (internal only)
        chrome.runtime.sendMessage({ action: 'INTERNAL_TTS_CHUNK_FINISHED' }).catch(err => {
          console.log("[Offscreen] Failed to send internal chunk ended notification:", err);
        });
      });

      resourceTracker.addEventListener(currentAudio, "error", () => {
        URL.revokeObjectURL(audioUrl);
        currentAudio = null;
        isPlaying = false; // Reset playing state
        if (!responseSent) {
          responseSent = true; // Set this first to prevent race conditions
          handleWebSpeechFallback(ttsData, sendResponse);
        }
      });

      return currentAudio.play();
    })
    .then(() => {
      // Send success response after play() succeeds
      if (!responseSent) {
        responseSent = true;
        sendResponse({ success: true, message: "Audio playback started" });
      }
    })
    .catch(async (err) => { // Make this catch block async
      resourceTracker.clearTimeout(fetchTimeout); // Clear the timeout on error too
      currentFetchController = null; // Clear the AbortController reference
      currentAudio = null;
      isPlaying = false; // Reset playing state
      
      // Handle AbortError specifically (when fetch is cancelled)
      if (err.name === 'AbortError') {
        console.log("[Offscreen] Google TTS fetch was aborted");
        return; // Don't send response or fallback for aborted requests
      }
      
      // Log Google TTS errors with less severity for expected failures
      if (err.message && err.message.includes('HTTP 400')) {
        console.debug("[Offscreen] Google TTS HTTP 400 (expected for some languages/text):", err.message);
      } else {
        console.error("[Offscreen] Google TTS failed:", err);
      }
      
      if (!responseSent) {
        responseSent = true; // Set responseSent to true here to prevent duplicate responses
        console.debug("[Offscreen] Falling back to Web Speech API");
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
    currentFetchController = null; // Clear the AbortController reference
    isPlaying = false; // Reset playing state
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
        resourceTracker.trackTimeout(() => startWebSpeech(), 100);
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
          console.log("Web Speech TTS ended");
          currentUtterance = null;
          isPlaying = false; // Reset playing state
          if (!responseAlreadySent) {
            responseAlreadySent = true;
            sendResponse({ success: true });
          }
        };

        currentUtterance.onerror = (error) => {
          // Use debug level for expected synthesis failures
          if (error.error === 'synthesis-failed' || error.error === 'synthesis-unavailable') {
            console.debug("Web Speech TTS error (expected):", error.error);
          } else {
            console.error("Web Speech TTS error:", error);
          }
          
          currentUtterance = null;
          isPlaying = false; // Reset playing state
          
          if (!responseAlreadySent) {
            // Try to recover from common errors
            if (error.error === 'synthesis-failed' || error.error === 'synthesis-unavailable') {
              console.debug("[Offscreen] Attempting Web Speech recovery...");
              
              // Wait a bit and try once more
              resourceTracker.trackTimeout(() => {
                if (!responseAlreadySent) {
                  speechSynthesis.cancel();
                  const retryUtterance = new SpeechSynthesisUtterance(data.text);
                  retryUtterance.lang = data.language || data.lang || 'en-US';
                  retryUtterance.rate = 1; // Use default rate for retry
                  retryUtterance.pitch = 1; // Use default pitch for retry
                  retryUtterance.volume = 1; // Use default volume for retry
                  
                  retryUtterance.onend = () => {
                    console.log("Web Speech TTS retry succeeded");
                    isPlaying = false; // Reset playing state
                    if (!responseAlreadySent) {
                      responseAlreadySent = true;
                      sendResponse({ success: true });
                    }
                  };
                  
                  retryUtterance.onerror = (retryError) => {
                    console.error("Web Speech TTS retry also failed:", retryError);
                    isPlaying = false; // Reset playing state
                    if (!responseAlreadySent) {
                      responseAlreadySent = true;
                      sendResponse({ success: false, error: `Web Speech retry failed: ${retryError.error}` });
                    }
                  };
                  
                  speechSynthesis.speak(retryUtterance);
                }
              }, 500);
            } else {
              responseAlreadySent = true;
              isPlaying = false; // Reset playing state
              sendResponse({ success: false, error: `Web Speech API failed: ${error.error}` });
            }
          }
        };

        currentUtterance.onstart = () => {
          console.log("Web Speech TTS started");
        };

        // Add timeout as additional safety measure
        const timeout = resourceTracker.trackTimeout(() => {
          if (!responseAlreadySent && currentUtterance) {
            console.warn("[Offscreen] Web Speech TTS timeout, cancelling");
            speechSynthesis.cancel();
            currentUtterance = null;
            isPlaying = false; // Reset playing state
            responseAlreadySent = true;
            sendResponse({ success: false, error: "Web Speech API timeout" });
          }
        }, 5000); // 5 second timeout

        // Clear timeout when speech ends
        const originalOnEnd = currentUtterance.onend;
        currentUtterance.onend = (event) => {
          resourceTracker.clearTimeout(timeout);
          if (originalOnEnd) originalOnEnd(event);
        };

        const originalOnError = currentUtterance.onerror;
        currentUtterance.onerror = (event) => {
          resourceTracker.clearTimeout(timeout);
          if (originalOnError) originalOnError(event);
        };

        speechSynthesis.speak(currentUtterance);
      }
    } else {
      throw new Error("Web Speech API not available");
    }
  } catch (error) {
    console.error("[Offscreen] Web Speech API fallback failed:", error);
    isPlaying = false; // Reset playing state
    sendResponse({ success: false, error: `All TTS methods failed: ${error.message}` });
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
    
    // NO crossOrigin needed for local Blobs, can cause issues in some environments
    // currentAudio.crossOrigin = "anonymous";

    resourceTracker.addEventListener(currentAudio, "ended", () => {
      console.log("[Offscreen] Cached audio playback ended");
      URL.revokeObjectURL(audioUrl); // Clean up memory
      currentAudio = null;
      isPlaying = false; // Reset playing state
      chrome.runtime.sendMessage({ action: 'INTERNAL_TTS_CHUNK_FINISHED' }).catch(() => {});
    });

    resourceTracker.addEventListener(currentAudio, "error", (e) => {
      console.error("[Offscreen] Cached audio playback error:", e);
      URL.revokeObjectURL(audioUrl); // Clean up memory
      currentAudio = null;
      isPlaying = false; // Reset playing state
      // Send error response if not already sent
      sendResponse({ success: false, error: "Audio playback failed" });
    });

    resourceTracker.addEventListener(currentAudio, "loadstart", () => {
      console.log("[Offscreen] Cached audio loading started");
    });

    // Start playback
    currentAudio
      .play()
      .then(() => {
        console.log("[Offscreen] Cached audio playback started successfully");
        isPlaying = true;
        // CRITICAL: Send success response immediately so background doesn't wait
        sendResponse({ success: true, message: "Cached audio playback started" });
      })
      .catch((err) => {
        console.error("[Offscreen] Cached audio play failed:", err);
        URL.revokeObjectURL(audioUrl);
        currentAudio = null;
        isPlaying = false;
        sendResponse({ success: false, error: err.message });
      });
      
  } catch (error) {
    console.error("[Offscreen] Cached audio setup failed:", error);
    sendResponse({ success: false, error: error.message });
  }
}

let ocrEngine = null;

/**
 * Handle OCR processing with lazy loading
 */
async function handleOCRProcess(data, sendResponse) {
  console.log("[Offscreen] handleOCRProcess started", { lang: data.lang });
  try {
    if (!ocrEngine) {
      console.log("[Offscreen] Loading OCR engine module...");
      const module = await import('../features/screen-capture/services/ocrEngine.js');
      ocrEngine = module;
      console.log("[Offscreen] OCR engine module loaded");
    }

    // Import language mapping utility
    const { toTesseractLanguageCode } = await import('../features/screen-capture/utils/ocrLanguageMap.js');

    const { image, lang, coordinates } = data;
    const tesseractLang = toTesseractLanguageCode(lang); // Convert to valid Tesseract language code

    console.log("[Offscreen] Starting recognition with language:", tesseractLang);
    const text = await ocrEngine.recognize(image, tesseractLang, coordinates);
    console.log("[Offscreen] Recognition successful, extracted text length:", text?.length);
    sendResponse({ success: true, text });
  } catch (error) {
    console.error("[Offscreen] OCR process failed. Full error object:", error);

    // Extract as much info as possible
    let errorMessage = "Unknown OCR error";
    if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof error === 'object') {
      errorMessage = error.message || error.statusText || JSON.stringify(error);
    }

    sendResponse({
      success: false,
      error: errorMessage,
      stack: error?.stack || new Error().stack
    });
  }
}
// Cleanup resources when page unloads
resourceTracker.addEventListener(window, 'beforeunload', () => {
  logger.debug('Offscreen document unloading, cleaning up resources...');
  resourceTracker.cleanup();
  
  // Cancel any ongoing fetch
  if (currentFetchController) {
    currentFetchController.abort();
    currentFetchController = null;
  }
  
  // Stop any current audio
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  
  // Cancel any ongoing speech synthesis
  if (speechSynthesis.speaking || speechSynthesis.pending) {
    speechSynthesis.cancel();
  }
  
  currentUtterance = null;
  isPlaying = false;
  
  logger.debug('Offscreen cleanup completed');
});
