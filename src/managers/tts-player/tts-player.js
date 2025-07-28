// src/managers/tts-player.js
// browser-agnostic TTS player that delegates to appropriate implementation

import * as chromePlayer from "./tts-player-chrome.js";
import * as firefoxPlayer from "./tts-player-firefox.js";
import { isFirefox } from "../../utils/browserCompat.js";

let ttsPlayer = null;
let browserType = null;

// Initialize the appropriate TTS player for current browser
async function initTTSPlayer() {
  if (!ttsPlayer) {
    if (browserType === null) {
      browserType = await isFirefox() ? 'firefox' : 'chrome';
    }
    
    ttsPlayer = browserType === 'firefox' ? firefoxPlayer : chromePlayer;
  }
  return ttsPlayer;
}

/**
 * Play TTS using browser-appropriate method
 */
export async function playTTS(message) {
  const player = await initTTSPlayer();
  return player.playTTS(message);
}

/**
 * Stop TTS playback
 */
export async function stopTTS() {
  const player = await initTTSPlayer();
  return player.stopTTS();
}
