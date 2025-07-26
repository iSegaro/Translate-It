// src/managers/tts-player-chrome.js
// Chrome-specific TTS player with offscreen support

import { logME } from "../helpers.js";
import {
  AUTO_DETECT_VALUE,
  playAudioWebSpeechAPI as playAudioWebSpeech,
  playAudioChromeTTS,
} from "../tts/tts.js";
import { detectTextLanguage } from "../textDetection.js";
import { resolveLangCode } from "../langUtils.js";

let activeTTS = null;

/**
 * Chrome-specific TTS player using TTS Manager
 * 1) Chrome TTS API (preferred, if available)
 * 2) TTS Manager offscreen (reliable with proper readiness)
 * 3) Direct Google TTS URL (fallback)
 */
export async function playTTS(message) {
  try {
    console.log("[TTS Chrome] playTTS called with message:", message);
    stopTTS();

    const text = message?.text?.trim();
    if (!text) {
      throw new Error("No text provided for TTS.");
    }
    console.log("[TTS Chrome] Text validation passed:", text);

    // Language detection
    let rawLang = message?.lang || AUTO_DETECT_VALUE;
    console.log("[TTS Chrome] Raw language:", rawLang);
    
    if (rawLang === AUTO_DETECT_VALUE) {
      try {
        console.log("[TTS Chrome] Starting language detection...");
        const detectedLang = await detectTextLanguage(text);
        rawLang = detectedLang || "en";
        console.log("[TTS Chrome] Language detected:", rawLang);
      } catch (err) {
        console.log("[TTS Chrome] Language detection failed. Fallback to 'en'.", err);
        rawLang = "en";
      }
    }

    const lang = resolveLangCode(rawLang);
    console.log("[TTS Chrome] Final language to play:", lang);

    // Try Chrome TTS API first (fastest when available)
    console.log("[TTS Chrome] Checking Chrome TTS API availability...");
    try {
      if (typeof chrome !== "undefined" && chrome.tts) {
        console.log("[TTS Chrome] Chrome TTS API available, attempting...");
        const playbackPromise = playAudioChromeTTS(text, lang);
        
        activeTTS = { method: "chrome" };
        
        await playbackPromise
          .catch((err) => {
            console.log("[TTS Chrome] chrome.tts error:", err);
            throw err;
          })
          .finally(() => {
            activeTTS = null;
          });

        console.log("[TTS Chrome] Chrome TTS completed successfully");
        return { success: true };
      } else {
        console.log("[TTS Chrome] Chrome TTS API not available");
      }
    } catch (err) {
      console.log("[TTS Chrome] chrome.tts failed, fallback to TTS Manager...", err);
    }

    // Use TTS Manager with proper readiness system
    console.log("[TTS Chrome] Using TTS Manager for offscreen TTS...");

    try {
      // Load TTS Manager (speak() method handles initialization internally)
      console.log("[TTS Chrome] Loading TTS Manager...");
      const { featureLoader } = await import('../../background/feature-loader.js');
      const ttsManager = await featureLoader.loadTTSManager();
      console.log("[TTS Chrome] TTS Manager loaded, ready to speak");
      
      activeTTS = { method: "tts-manager" };
      
      // Use TTS Manager's speak method (text, options)
      console.log("[TTS Chrome] Calling ttsManager.speak with:", { text, lang });
      await ttsManager.speak(text, {
        lang: lang,
        rate: message.rate || 1,
        pitch: message.pitch || 1,
        volume: message.volume || 1
      });

      console.log("[TTS Chrome] TTS Manager completed successfully");
      activeTTS = null;
      return { success: true };
    
  } catch (ttsManagerErr) {
    activeTTS = null;
    console.error("[TTS Chrome] TTS Manager failed:", ttsManagerErr);
    throw new Error("TTS Manager failed: " + ttsManagerErr.message);
  }
  
  } catch (mainError) {
    console.error("[TTS Chrome] Critical error in playTTS:", mainError);
    activeTTS = null;
    throw mainError;
  }
}

export function stopTTS() {
  if (!activeTTS) return;

  logME("[TTS Chrome] Stopping TTS method:", activeTTS.method);

  try {
    switch (activeTTS.method) {
      case "chrome":
        if (typeof chrome !== "undefined" && chrome.tts) {
          chrome.tts.stop();
        }
        break;

      case "direct-google":
        if (activeTTS.audio) {
          activeTTS.audio.pause();
          activeTTS.audio.src = "";
          activeTTS.audio = null;
        }
        break;

      case "tts-manager":
        // Use TTS Manager's stop method
        (async () => {
          try {
            const { featureLoader } = await import('../../background/feature-loader.js');
            const ttsManager = await featureLoader.loadTTSManager();
            await ttsManager.stop();
          } catch (err) {
            logME("[TTS Chrome] Error stopping TTS Manager:", err);
          }
        })();
        break;

      case "webspeech":
        // Deprecated: Web Speech API removed for reliability
        if (typeof speechSynthesis !== "undefined") {
          speechSynthesis.cancel();
        }
        break;

      case "offscreen-tts":
        // Deprecated: Direct offscreen calls removed - use TTS Manager
        logME("[TTS Chrome] Direct offscreen method deprecated, use TTS Manager");
        break;

      case "offscreen":
        // Deprecated: Offscreen method removed for performance
        logME("[TTS Chrome] Offscreen method deprecated, skipping stop");
        break;

      default:
        logME("[TTS Chrome] Unknown TTS method to stop:", activeTTS.method);
        break;
    }
  } catch (err) {
    logME("[TTS Chrome] Error stopping TTS:", err);
  }

  activeTTS = null;
}

// Removed duplicate offscreen management functions
// Now using TTS Manager for proper offscreen handling with readiness system

/**
 * Get audio blob for caching purposes
 * Downloads audio separately for caching (doesn't use offscreen)
 * @param {string} text - Text to speak
 * @param {string} lang - Language code  
 * @returns {Promise<Blob>} Audio blob
 */
export async function getAudioBlob(text, lang) {
  try {
    // Use direct fetch for caching (more reliable than offscreen for this purpose)
    const googleTTSUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(text)}&client=gtx`;
    
    // Fetch audio as blob
    const response = await fetch(googleTTSUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch TTS audio: ${response.status}`);
    }
    
    const audioBlob = await response.blob();
    logME("[TTS Chrome] Downloaded audio blob for caching:", audioBlob.size, "bytes");
    
    return audioBlob;
    
  } catch (error) {
    logME("[TTS Chrome] Failed to get audio blob:", error);
    throw error;
  }
}

/**
 * Play cached audio blob via offscreen (using direct runtime message)
 * @param {Blob} audioBlob - Cached audio blob to play
 * @returns {Promise<Object>} Result object
 */
export async function playAudioBlobViaOffscreen(audioBlob) {
  try {
    logME("[TTS Chrome] Playing cached audio blob via offscreen:", audioBlob.size, "bytes");
    
    // Load TTS Manager to ensure offscreen readiness
    const { featureLoader } = await import('../../background/feature-loader.js');
    const ttsManager = await featureLoader.loadTTSManager();
    
    // TTS Manager is already initialized, no need to call ensureReady()
    
    // Convert blob to ArrayBuffer for message passing
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioData = Array.from(new Uint8Array(arrayBuffer));
    
    logME("[TTS Chrome] Sending cached audio data to offscreen:", audioData.length, "bytes");
    
    // Send cached audio directly to offscreen document
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'playCachedAudio',
        audioData: audioData,
        fromTTSPlayer: true
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });

    if (!response || !response.success) {
      throw new Error(response?.error || "Offscreen cached audio playback failed");
    }

    logME("[TTS Chrome] Offscreen cached audio playback completed successfully");
    return { success: true };
    
  } catch (error) {
    logME("[TTS Chrome] Failed to play cached audio via offscreen:", error);
    throw error;
  }
}

// Removed stopAudioViaOffscreen() - now handled by TTS Manager