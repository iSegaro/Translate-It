// src/utils/browserCompat.js
// browser compatibility utilities

/**
 * Detect if we're running in Firefox
 */
export async function isFirefox() {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getbrowserInfo) {
      const browserInfo = await chrome.runtime.getbrowserInfo();
      return browserInfo.name.toLowerCase() === 'firefox';
    }
    // Fallback detection for content scripts/UI contexts
    if (typeof window !== 'undefined' && typeof InstallTrigger !== 'undefined') {
      return true;
    }
    // Additional Firefox detection for service workers
    if (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.includes('Firefox')) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Detect if we're running in Chrome
 */
export async function isChrome() {
  return !(await isFirefox());
}

/**
 * Get the appropriate TTS player for the current browser
 */
export async function getTTSPlayer() {
  try {
    if (await isFirefox()) {
      // Use dynamic import with webpack magic comment for proper chunking
      const module = await import(/* webpackChunkName: "tts-firefox" */ '../managers/tts-player/tts-player-firefox.js');
      return module;
    } else {
      // Use dynamic import with webpack magic comment for proper chunking
      const module = await import(/* webpackChunkName: "tts-chrome" */ '../managers/tts-player/tts-player-chrome.js');
      return module;
    }
  } catch (error) {
    console.error('[browserCompat] Error loading TTS player:', error);
    // Fallback to chrome implementation
    const module = await import(/* webpackChunkName: "tts-chrome-fallback" */ '../managers/tts-player/tts-player-chrome.js');
    return module;
  }
}

/**
 * Get browser-specific TTS utilities
 */
export async function getTTSUtils() {
  try {
    if (await isFirefox()) {
      const module = await import(/* webpackChunkName: "tts-utils-firefox" */ './tts/tts-firefox.js');
      return module;
    } else {
      const module = await import(/* webpackChunkName: "tts-utils-chrome" */ './tts/tts-chrome.js');
      return module;
    }
  } catch (error) {
    console.error('[browserCompat] Error loading TTS utils:', error);
    // Fallback to chrome implementation
    const module = await import(/* webpackChunkName: "tts-utils-chrome-fallback" */ './tts/tts-chrome.js');
    return module;
  }
}