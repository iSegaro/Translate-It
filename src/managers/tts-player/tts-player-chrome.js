// src/managers/tts-player-chrome.js
// Chrome-specific TTS player with offscreen support

import { logME } from "../../utils/helpers.js";
import {
  AUTO_DETECT_VALUE,
  playAudioViaOffscreen,
  playAudioChromeTTS,
} from "tts-utils";
import { detectTextLanguage } from "../../utils/textDetection.js";
import { resolveLangCode } from "../../utils/langUtils.js";

let activeTTS = null;

/**
 * Chrome-specific TTS player with offscreen fallback
 * 1) Chrome TTS API (preferred)
 * 2) Offscreen document with Google TTS (fallback)
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

  // Try Chrome TTS first
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
    logME("[TTS Chrome] chrome.tts failed, fallback to offscreen...", err);
  }

  // Fallback to offscreen
  const ttsUrl = `https://translate.google.com/translate_tts?client=tw-ob&q=${encodeURIComponent(
    text
  )}&tl=${lang}`;

  logME("[TTS Chrome] Fallback to offscreen TTS...");

  const playbackPromise = playAudioViaOffscreen(ttsUrl);
  activeTTS = { method: "offscreen" };

  const result = await playbackPromise
    .catch((err) => {
      activeTTS = null;
      throw err;
    })
    .finally(() => {
      activeTTS = null;
    });

  if (result.success) {
    return { success: true };
  }
  throw new Error(result.error || "TTS playback failed via offscreen.");
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

      case "offscreen":
        stopAudioViaOffscreen();
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