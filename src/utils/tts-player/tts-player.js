// src/managers/tts-player.js
// Browser-agnostic TTS player that delegates to appropriate implementation

import * as chromePlayer from "./tts-player-chrome.js";
import * as firefoxPlayer from "./tts-player-firefox.js";
import { isFirefox } from "../browserCompat.js";

let ttsPlayer = null;
let browserType = null;

/**
 * Simple LRU Cache for TTS audio blobs
 * Stores last 5 TTS audio files for instant replay
 */
class SimpleTTSCache {
  constructor() {
    this.cache = new Map();
    this.maxSize = 5; // Store last 5 TTS audio files
  }

  /**
   * Generate cache key from text and language
   * @param {string} text - Text to speak
   * @param {string} lang - Language code
   * @returns {string} Cache key
   */
  generateKey(text, lang) {
    // Create unique key: lang + text length + first 50 chars
    const shortText = text.substring(0, 50);
    return `${lang}_${text.length}_${shortText}`;
  }

  /**
   * Get cached audio blob (LRU behavior)
   * @param {string} text - Text to speak
   * @param {string} lang - Language code
   * @returns {Blob|null} Cached audio blob or null
   */
  get(text, lang) {
    const key = this.generateKey(text, lang);
    if (this.cache.has(key)) {
      // Move to end (mark as most recently used)
      const audioBlob = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, audioBlob);
      console.log("[TTS Cache] Cache HIT for:", key.substring(0, 30) + "...");
      return audioBlob;
    }
    console.log("[TTS Cache] Cache MISS for:", key.substring(0, 30) + "...");
    return null;
  }

  /**
   * Set cached audio blob (LRU eviction)
   * @param {string} text - Text to speak
   * @param {string} lang - Language code
   * @param {Blob} audioBlob - Audio blob to cache
   */
  set(text, lang, audioBlob) {
    const key = this.generateKey(text, lang);
    
    // Remove oldest if at capacity (and not updating existing)
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      console.log("[TTS Cache] Evicting oldest:", firstKey.substring(0, 30) + "...");
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, audioBlob);
    console.log("[TTS Cache] Cached new audio:", key.substring(0, 30) + "...", `(${this.cache.size}/${this.maxSize})`);
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      keys: Array.from(this.cache.keys()).map(k => k.substring(0, 30) + "...")
    };
  }

  /**
   * Clear all cached audio
   */
  clear() {
    this.cache.clear();
    console.log("[TTS Cache] Cache cleared");
  }
}

// Global cache instance shared across all TTS calls
const ttsCache = new SimpleTTSCache();

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
 * Play TTS using browser-appropriate method with caching
 */
export async function playTTS(message) {
  const player = await initTTSPlayer();
  
  const text = message?.text?.trim();
  const lang = message?.lang || 'en';
  
  if (!text) {
    throw new Error("No text provided for TTS.");
  }
  
  // 1. Check cache first for instant playback
  const cachedAudio = ttsCache.get(text, lang);
  if (cachedAudio) {
    console.log("[TTS Player] Using cached audio (⚡ instant)");
    return playAudioBlob(cachedAudio);
  }
  
  // 2. Cache miss - download and cache for next time
  console.log("[TTS Player] Cache miss - downloading audio");
  const result = await player.playTTS(message);
  
  // 3. Try to get audio blob for caching (if player supports it)
  try {
    const audioBlob = await player.getAudioBlob?.(text, lang);
    if (audioBlob) {
      ttsCache.set(text, lang, audioBlob);
    }
  } catch (error) {
    console.warn("[TTS Player] Could not cache audio blob:", error.message);
  }
  
  return result;
}

/**
 * Play audio from cached blob via browser-specific implementation
 * @param {Blob} audioBlob - Cached audio blob
 * @returns {Promise<Object>} Result object
 */
async function playAudioBlob(audioBlob) {
  try {
    console.log("[TTS Player] Playing cached audio blob:", audioBlob.size, "bytes");
    
    // Use browser-specific implementation for cached blob playback
    const player = await initTTSPlayer();
    
    // Check if player has cached blob playback support
    if (typeof player.playAudioBlobViaOffscreen === 'function') {
      console.log("[TTS Player] Using browser-specific cached blob playback");
      return await player.playAudioBlobViaOffscreen(audioBlob);
    }
    
    // Fallback: Try direct Audio object (may not work in service worker context)
    console.warn("[TTS Player] Browser-specific cached playback not available, trying direct Audio");
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    
    return new Promise((resolve, reject) => {
      audio.onended = () => {
        console.log("[TTS Player] Cached audio playback ended");
        URL.revokeObjectURL(audioUrl);
        resolve({ success: true });
      };
      
      audio.onerror = (error) => {
        console.error("[TTS Player] Cached audio playback error:", error);
        URL.revokeObjectURL(audioUrl);
        reject(new Error("Cached audio playback failed: " + error.message));
      };
      
      console.log("[TTS Player] Starting direct cached audio playback");
      audio.play()
        .then(() => {
          console.log("[TTS Player] Direct cached audio play() successful");
        })
        .catch((playError) => {
          console.error("[TTS Player] Direct cached audio play() failed:", playError);
          URL.revokeObjectURL(audioUrl);
          reject(new Error("Direct cached audio play failed: " + playError.message));
        });
    });
    
  } catch (error) {
    console.error("[TTS Player] Failed to play cached audio:", error);
    throw new Error("Failed to play cached audio: " + error.message);
  }
}

/**
 * Stop TTS playback
 */
export async function stopTTS() {
  const player = await initTTSPlayer();
  return player.stopTTS();
}

/**
 * Get TTS cache statistics (for debugging)
 * @returns {Object} Cache statistics
 */
export function getCacheStats() {
  return ttsCache.getStats();
}

/**
 * Clear TTS cache
 */
export function clearCache() {
  ttsCache.clear();
}
