/**
 * TTS Voice Service - Manages dynamic voice lists from Microsoft Edge
 * Caches results for 24 hours in storage.local.
 */
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { PROVIDER_CONFIGS } from '@/features/tts/constants/ttsProviders.js';
import { TTS_ENGINES } from '@/shared/config/constants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TTS, 'TTSVoiceService');

class TTSVoiceService {
  constructor() {
    this.storageKey = 'TTS_VOICES_CACHE';
    this.cacheTTL = 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Get the best neural voice for a language
   * @param {string} langCode - ISO language code (e.g., 'fa' or 'zh-hk')
   * @returns {Promise<string|null>} - Voice name (e.g., 'fa-IR-DilaraNeural')
   */
  async getBestVoice(langCode) {
    if (!langCode) return null;
    const voices = await this.getVoices();
    const normalizedTarget = langCode.toLowerCase();
    const baseLang = normalizedTarget.split('-')[0];

    if (!voices || voices.length === 0) {
      return PROVIDER_CONFIGS[TTS_ENGINES.EDGE].voices[normalizedTarget] || 
             PROVIDER_CONFIGS[TTS_ENGINES.EDGE].voices[baseLang] || null;
    }

    // 1. Try exact locale match first (e.g. 'zh-hk')
    const exactMatch = voices.find(v => v.Locale.toLowerCase() === normalizedTarget && v.ShortName.includes('Neural'));
    if (exactMatch) return exactMatch.ShortName;

    // 2. Filter voices for the requested language family
    const langVoices = voices.filter(v => {
      const locale = v.Locale.toLowerCase();
      return locale === baseLang || locale.startsWith(`${baseLang}-`);
    });

    if (langVoices.length === 0) return null;

    // 3. Try to find the preferred dialect for this family (e.g. en-US)
    const dialectPriorities = {
      'en': 'en-us',
      'ar': 'ar-sa',
      'zh': 'zh-cn',
      'es': 'es-es',
      'pt': 'pt-br'
    };

    const preferredLocale = dialectPriorities[baseLang];
    if (preferredLocale) {
      const dialectMatch = langVoices.find(v => v.Locale.toLowerCase() === preferredLocale && v.ShortName.includes('Neural'));
      if (dialectMatch) return dialectMatch.ShortName;
    }

    // 4. Fallback to any Neural voice in the same language family
    const anyNeural = langVoices.find(v => v.ShortName.includes('Neural'));
    if (anyNeural) return anyNeural.ShortName;

    // 5. Last resort: return the first available voice
    return langVoices[0].ShortName;
  }

  /**
   * Fetch or get cached voices
   */
  async getVoices() {
    const cached = await this._getCachedVoices();
    if (cached) return cached;

    return await this.refreshVoices();
  }

  /**
   * Force refresh voices from Microsoft
   */
  async refreshVoices() {
    const config = PROVIDER_CONFIGS[TTS_ENGINES.EDGE];
    const url = `${config.voicesUrl}?trustedclienttoken=${config.trustedClientToken}`;

    try {
      logger.debug('Fetching live voice list from Microsoft...');
      const response = await fetch(url, {
        headers: { 'User-Agent': config.userAgent }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const voices = await response.json();
      await this._cacheVoices(voices);
      
      logger.info(`Successfully updated voice list: ${voices.length} voices found.`);
      return voices;
    } catch (error) {
      logger.warn('Failed to fetch dynamic voices, using static fallbacks.', error);
      return [];
    }
  }

  /**
   * Get voices from storage if valid
   * @private
   */
  async _getCachedVoices() {
    try {
      const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
      const result = await browserAPI.storage.local.get(this.storageKey);
      const cache = result[this.storageKey];

      if (cache && cache.timestamp && (Date.now() - cache.timestamp < this.cacheTTL)) {
        return cache.data;
      }
    } catch { /* ignore */ }
    return null;
  }

  /**
   * Save voices to storage with timestamp
   * @private
   */
  async _cacheVoices(voices) {
    try {
      const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
      await browserAPI.storage.local.set({
        [this.storageKey]: {
          timestamp: Date.now(),
          data: voices
        }
      });
    } catch { /* ignore */ }
  }
}

export const ttsVoiceService = new TTSVoiceService();
