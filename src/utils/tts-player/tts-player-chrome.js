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
 * Chrome-specific TTS player with Direct Google TTS
 * 1) Chrome TTS API (preferred, if available)
 * 2) Direct Google TTS URL + Audio object (reliable fallback)
 */
export async function playTTS(message) {
  stopTTS();

  const text = message?.text?.trim();
  if (!text) {
    throw new Error("No text provided for TTS.");
  }

  // Language detection
  let rawLang = message?.lang || AUTO_DETECT_VALUE;
  if (rawLang === AUTO_DETECT_VALUE) {
    try {
      const detectedLang = await detectTextLanguage(text);
      rawLang = detectedLang || "en";
    } catch (err) {
      logME("[TTS Chrome] Language detection failed. Fallback to 'en'.", err);
      rawLang = "en";
    }
  }

  const lang = resolveLangCode(rawLang);
  logME("[TTS Chrome] Final language to play:", lang);

  // Try Chrome TTS API first (fastest when available)
  try {
    if (typeof chrome !== "undefined" && chrome.tts) {
      logME("[TTS Chrome] Attempting chrome.tts...");
      const playbackPromise = playAudioChromeTTS(text, lang);
      
      activeTTS = { method: "chrome" };
      
      await playbackPromise
        .catch((err) => {
          logME("[TTS Chrome] chrome.tts error:", err);
          throw err;
        })
        .finally(() => {
          activeTTS = null;
        });

      return { success: true };
    }
  } catch (err) {
    logME("[TTS Chrome] chrome.tts failed, fallback to Direct Google TTS...", err);
  }

  // Ensure offscreen document exists, then use offscreen TTS
  logME("[TTS Chrome] Ensuring offscreen document for TTS...");

  try {
    // Ensure offscreen document is available
    await ensureOffscreenForTTS();
    
    activeTTS = { method: "offscreen-tts" };
    
    // Send TTS request to offscreen document  
    const response = await sendMessageToOffscreen({
      action: 'speak',
      text: text,
      lang: lang,
      rate: 1,
      pitch: 1,
      volume: 1,
      fromTTSPlayer: true  // Mark as coming from cache layer
    });

    if (!response || !response.success) {
      throw new Error(response?.error || "Offscreen TTS failed");
    }

    logME("[TTS Chrome] Offscreen TTS completed successfully");
    activeTTS = null;
    return { success: true };
    
  } catch (offscreenErr) {
    activeTTS = null;
    logME("[TTS Chrome] Offscreen TTS failed, fallback to Direct Google TTS:", offscreenErr);
    
    // Fallback to direct method if offscreen fails
    try {
      activeTTS = { method: "direct-google", audio: null };
      
      // Create Google TTS URL
      const googleTTSUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(text)}&client=gtx`;
      
      // Create and play audio
      const audio = new Audio(googleTTSUrl);
      audio.crossOrigin = "anonymous";
      activeTTS.audio = audio;
      
      // Setup event handlers
      const playPromise = new Promise((resolve, reject) => {
        audio.onended = () => {
          logME("[TTS Chrome] Direct Google TTS playback ended");
          activeTTS = null;
          resolve();
        };
        
        audio.onerror = (error) => {
          logME("[TTS Chrome] Direct Google TTS error:", error);
          activeTTS = null;
          reject(new Error("Google TTS playback failed"));
        };
        
        audio.onloadstart = () => {
          logME("[TTS Chrome] Direct Google TTS loading started");
        };
      });
      
      // Start playback
      await audio.play();
      logME("[TTS Chrome] Direct Google TTS playback started");
      
      // Wait for completion
      await playPromise;
      
      return { success: true };
      
    } catch (directGoogleErr) {
      activeTTS = null;
      logME("[TTS Chrome] Both offscreen and direct Google TTS failed:", directGoogleErr);
      throw new Error("All TTS methods failed");
    }
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

      case "webspeech":
        // Deprecated: Web Speech API removed for reliability
        if (typeof speechSynthesis !== "undefined") {
          speechSynthesis.cancel();
        }
        break;

      case "offscreen-tts":
        if (typeof chrome !== "undefined" && chrome.runtime) {
          chrome.runtime.sendMessage({ action: 'stopTTS' }).catch(() => {});
        }
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

/**
 * Ensure offscreen document exists for TTS
 * @returns {Promise<void>}
 */
async function ensureOffscreenForTTS() {
  try {
    // Check if offscreen API is available
    if (!chrome.offscreen) {
      throw new Error("Offscreen API not available");
    }

    // Check if offscreen document already exists
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existingContexts.length > 0) {
      logME("[TTS Chrome] Offscreen document already exists");
      return;
    }

    // Create new offscreen document
    await chrome.offscreen.createDocument({
      url: 'html/offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'TTS audio playback for translation extension'
    });

    logME("[TTS Chrome] Offscreen document created for TTS");
    
    // Small delay to ensure script loads
    await new Promise(resolve => setTimeout(resolve, 100));

  } catch (error) {
    logME("[TTS Chrome] Failed to ensure offscreen document:", error);
    throw error;
  }
}

/**
 * Send message to offscreen document
 * @param {Object} message - Message to send
 * @returns {Promise<Object>} Response from offscreen
 */
async function sendMessageToOffscreen(message) {
  try {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  } catch (error) {
    logME("[TTS Chrome] Failed to send message to offscreen:", error);
    throw error;
  }
}

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
 * Play cached audio blob via offscreen document
 * @param {Blob} audioBlob - Cached audio blob to play
 * @returns {Promise<Object>} Result object
 */
export async function playAudioBlobViaOffscreen(audioBlob) {
  try {
    logME("[TTS Chrome] Playing cached audio blob via offscreen:", audioBlob.size, "bytes");
    
    // Ensure offscreen document exists
    await ensureOffscreenForTTS();
    
    // Convert blob to ArrayBuffer for message passing
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioData = Array.from(new Uint8Array(arrayBuffer));
    
    logME("[TTS Chrome] Sending cached audio data to offscreen:", audioData.length, "bytes");
    
    // Send cached audio to offscreen for playback
    const response = await sendMessageToOffscreen({
      action: 'playCachedAudio',
      audioData: audioData,
      fromTTSPlayer: true
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

async function stopAudioViaOffscreen() {
  try {
    if (!chrome.offscreen?.hasDocument) return;
    const docExists = await chrome.offscreen.hasDocument();
    if (!docExists) return;

    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: "stopOffscreenAudio",
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });

    await chrome.offscreen.closeDocument();
    logME("[TTS Chrome] Offscreen stopped and closed.");
  } catch (err) {
    logME("[TTS Chrome] Error stopping offscreen audio:", err);
  }
}