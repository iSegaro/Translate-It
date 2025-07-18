// src/managers/tts-player-firefox.js  
// Firefox-specific TTS player with direct Google TTS

import { logME } from "../utils/helpers.js";
import {
  AUTO_DETECT_VALUE,
  playAudioGoogleTTS,
} from "../utils/tts-firefox.js";
import { detectTextLanguage } from "../utils/textDetection.js";
import { resolveLangCode } from "../utils/langUtils.js";

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

  // Use Google TTS directly
  logME("[TTS Firefox] Using Google TTS method.");
  const { audio, playbackPromise } = playAudioGoogleTTS(text, lang);

  activeTTS = { method: "google", audio };

  await playbackPromise
    .catch((err) => {
      logME("[TTS Firefox] GoogleTTS error:", err);
      throw err;
    })
    .finally(() => {
      activeTTS = null;
    });

  return { success: true };
}

export function stopTTS() {
  if (!activeTTS) return;

  logME("[TTS Firefox] Stopping TTS method:", activeTTS.method);

  try {
    if (activeTTS.method === "google" && activeTTS.audio) {
      activeTTS.audio.pause();
      activeTTS.audio.src = "";
    }
  } catch (err) {
    logME("[TTS Firefox] Error stopping TTS:", err);
  }

  activeTTS = null;
}