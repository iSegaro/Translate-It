/**
 * TTS Handler - Handle text-to-speech requests
 * Based on OLD implementation pattern for reliability
 */

import browser from "webextension-polyfill";

export async function handleTTSSpeak(text, language, options = {}) {
  console.log("[TTSHandler] Handling TTS speak request:", {
    text: text?.substring(0, 50),
    language,
  });

  try {
    // Import TTS manager dynamically to avoid circular dependencies
    const { playTTS } = await import("../managers/tts-content.js");

    // Use the existing TTS system
    await playTTS({
      text,
      language,
      ...options,
    });

    console.log("[TTSHandler] TTS speak completed successfully");
  } catch (error) {
    console.error("[TTSHandler] TTS speak error:", error);
    throw new Error(`TTS speak failed: ${error.message}`);
  }
}

export function handleTTSStop() {
  console.log("[TTSHandler] Handling TTS stop request");

  try {
    // Import TTS manager dynamically
    import("../managers/tts-content.js")
      .then(({ stopTTS }) => {
        stopTTS();
        console.log("[TTSHandler] TTS stopped successfully");
      })
      .catch((error) => {
        console.error("[TTSHandler] TTS stop error:", error);
      });
  } catch (error) {
    console.error("[TTSHandler] TTS stop sync error:", error);
  }
}
