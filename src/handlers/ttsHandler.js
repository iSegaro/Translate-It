// src/handlers/ttsHandler.js
import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";
import {
  detectTextLanguage,
  getLanguageInfoFromCode,
} from "../utils/textDetection.js";
import { ErrorTypes } from "../services/ErrorTypes.js";

// Dependencies passed as arguments: playAudioViaOffscreen, errorHandler

export async function handlePlayGoogleTTS(
  message,
  sender,
  sendResponse,
  playAudioViaOffscreen,
  errorHandler
) {
  logME("[Handler:TTS] Handling playGoogleTTS request", message);
  try {
    const text = message?.text;
    const maxLengthGoogle = 200;

    if (!text) throw new Error("No text provided for TTS.");
    if (text.length > maxLengthGoogle) {
      logME("[Handler:TTS] Text too long for Google TTS, skipping.");
      throw new Error(
        `Text exceeds maximum length of ${maxLengthGoogle} characters.`
      );
    }

    let voiceLangCode = "en";
    try {
      const detectedLang = await detectTextLanguage(text);
      if (detectedLang) {
        const languageInfo = getLanguageInfoFromCode(detectedLang);
        if (languageInfo?.voiceCode) {
          voiceLangCode = languageInfo.voiceCode;
          logME(
            `[Handler:TTS] Detected language: ${detectedLang}, using voice code: ${voiceLangCode}`
          );
        } else {
          logME(
            `[Handler:TTS] No voice code for: ${detectedLang}. Falling back to 'en'.`
          );
        }
      }
    } catch (detectionError) {
      logME("[Handler:TTS] Language detection failed:", detectionError);
    }

    const requiredOrigin = "https://translate.google.com/*";
    const hasPermission = await Browser.permissions.contains({
      origins: [requiredOrigin],
    });

    if (!hasPermission) {
      const granted = await new Promise((resolve) => {
        Browser.permissions.request({ origins: [requiredOrigin] }, resolve);
      });
      if (!granted) {
        throw new Error("Permission for Google Translate was denied.");
      }
    }

    const ttsUrl = `https://translate.google.com/translate_tts?client=tw-ob&q=${encodeURIComponent(
      text
    )}&tl=${voiceLangCode}`;

    const offscreenResult = await playAudioViaOffscreen(ttsUrl);
    if (offscreenResult?.success) {
      sendResponse({ success: true });
    } else {
      sendResponse({
        success: false,
        error: offscreenResult?.error || "Failed to play via offscreen.",
      });
    }
  } catch (error) {
    logME("[Handler:TTS] Error processing playGoogleTTS:", error);
    const handledError = errorHandler.handle(error, {
      type:
        error.message.includes("Permission") ?
          ErrorTypes.PERMISSION
        : ErrorTypes.API,
      context: "handler-playGoogleTTS",
      metadata: { textSnippet: message?.text?.substring(0, 50) || "N/A" },
    });
    sendResponse({ success: false, error: handledError.message });
  }
  return true;
}
