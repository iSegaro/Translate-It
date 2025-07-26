// src/managers/tts-player-firefox.js  
// Firefox-specific TTS player with direct Google TTS

import { logME } from "../helpers.js";
import {
  AUTO_DETECT_VALUE,
  playAudioGoogleTTS,
  playAudioWebSpeechAPI as playAudioWebSpeech,
  getSpeechApiLangCode,
} from "../tts/tts.js";
import { detectTextLanguage } from "../textDetection.js";
import { resolveLangCode } from "../langUtils.js";

let activeTTS = null;

/**
 * Firefox-specific TTS player using direct Google TTS
 * Uses Audio API directly without offscreen document
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
      logME("[TTS Firefox] Language detection failed. Fallback to 'en'.", err);
      rawLang = "en";
    }
  }

  const lang = resolveLangCode(rawLang);
  logME("[TTS Firefox] Final language to play:", lang);

  // Try Google TTS first, fallback to Web Speech API if it fails
  try {
    logME("[TTS Firefox] Using Google TTS method.");
    const { audio, playbackPromise } = playAudioGoogleTTS(text, lang);

    activeTTS = { method: "google", audio };

    await playbackPromise
      .catch((err) => {
        logME("[TTS Firefox] GoogleTTS error, falling back to Web Speech API:", err);
        throw err;
      })
      .finally(() => {
        activeTTS = null;
      });
  } catch (err) {
    logME("[TTS Firefox] Google TTS failed, checking if Web Speech API should be used.", err);
    
    // Check if this is a language support error - if so, don't use fallback
    const errorMessage = err?.message || err?.toString() || "";
    const isLanguageError = errorMessage.includes("NS_BINDING_ABORTED") || 
                           errorMessage.includes("not suitable") ||
                           err?.target?.error?.code === 4; // MEDIA_ELEMENT_ERROR: MEDIA_ERR_SRC_NOT_SUPPORTED
    
    if (isLanguageError) {
      logME(`[TTS Firefox] Language '${lang}' not supported by Google TTS. Skipping Web Speech API fallback to avoid language warning.`);
      throw new Error(`Language '${lang}' not supported for TTS`);
    }
    
    // Fallback to Web Speech API for other errors
    const speechLang = getSpeechApiLangCode(lang) || lang;
    logME("[TTS Firefox] Using Web Speech API with language:", speechLang);
    
    activeTTS = { method: "webspeech" };
    
    await playAudioWebSpeech(text, speechLang)
      .catch((speechErr) => {
        logME("[TTS Firefox] Web Speech API error:", speechErr);
        throw speechErr;
      })
      .finally(() => {
        activeTTS = null;
      });
  }

  return { success: true };
}

export function stopTTS() {
  if (!activeTTS) return;

  logME("[TTS Firefox] Stopping TTS method:", activeTTS.method);

  try {
    if (activeTTS.method === "google" && activeTTS.audio) {
      activeTTS.audio.pause();
      activeTTS.audio.src = "";
    } else if (activeTTS.method === "webspeech") {
      speechSynthesis.cancel();
    }
  } catch (err) {
    logME("[TTS Firefox] Error stopping TTS:", err);
  }

  activeTTS = null;
}

/**
 * Get audio blob for caching purposes
 * @param {string} text - Text to speak
 * @param {string} lang - Language code  
 * @returns {Promise<Blob>} Audio blob
 */
export async function getAudioBlob(text, lang) {
  try {
    // Create Google TTS URL (same as in playTTS)
    const googleTTSUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(text)}&client=gtx`;
    
    // Fetch audio as blob
    const response = await fetch(googleTTSUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch TTS audio: ${response.status}`);
    }
    
    const audioBlob = await response.blob();
    logME("[TTS Firefox] Downloaded audio blob for caching:", audioBlob.size, "bytes");
    
    return audioBlob;
    
  } catch (error) {
    logME("[TTS Firefox] Failed to get audio blob:", error);
    throw error;
  }
}