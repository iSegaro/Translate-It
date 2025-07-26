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

  // Direct Google TTS (reliable and fast)
  logME("[TTS Chrome] Using Direct Google TTS...");

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
    logME("[TTS Chrome] Direct Google TTS failed:", directGoogleErr);
    throw new Error("Direct Google TTS failed: " + directGoogleErr.message);
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