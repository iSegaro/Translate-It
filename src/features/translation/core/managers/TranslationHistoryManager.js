/**
 * Translation History Manager - Manages storage and retrieval of translation history
 * Encapsulates all browser storage interactions for the history feature.
 */

import { storageManager } from "@/shared/storage/core/StorageCore.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import ExtensionContextManager from '@/core/extensionContext.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'TranslationHistoryManager');

export class TranslationHistoryManager {
  constructor() {
    this.history = [];
    this.MAX_HISTORY_ITEMS = 100;
  }

  /**
   * Add a single translation result to the history.
   * Persists the update to browser storage.
   *
   * @param {object} data - Original request data (text, languages)
   * @param {object} result - Translation result (translatedText)
   * @returns {Promise<void>}
   */
  async addToHistory(data, result) {
    if (!data.text || !result.translatedText) {
      logger.debug('[HistoryManager] Skipping empty translation');
      return;
    }

    try {
      const historyItem = {
        sourceText: data.text,
        translatedText: result.translatedText,
        sourceLanguage: data.sourceLanguage,
        targetLanguage: data.targetLanguage,
        timestamp: Date.now()
      };

      // Ensure history is loaded from storage first to get the latest state
      await this.loadHistoryFromStorage();

      this.history = [historyItem, ...this.history].slice(0, this.MAX_HISTORY_ITEMS);
      await this.saveHistoryToStorage();

      logger.info(`[HistoryManager] Translation saved to history: "${data.text.slice(0, 30)}..." → "${result.translatedText.slice(0, 30)}..."`);
    } catch (error) {
      logger.error("[HistoryManager] Failed to add translation to history:", error);
    }
  }

  /**
   * Persist current history array to browser storage.
   * 
   * @returns {Promise<void>}
   */
  async saveHistoryToStorage() {
    try {
      await storageManager.set({ translationHistory: this.history });
    } catch (error) {
      logger.error("[HistoryManager] Failed to save history to storage:", error);
    }
  }

  /**
   * Load history from browser storage.
   * Handles extension context errors gracefully.
   * 
   * @returns {Promise<Array>} The loaded history array
   */
  async loadHistoryFromStorage() {
    try {
      const data = await storageManager.get(["translationHistory"]);
      this.history = Array.isArray(data.translationHistory) ? data.translationHistory : [];
      return this.history;
    } catch (error) {
      if (ExtensionContextManager.isContextError(error)) {
        ExtensionContextManager.handleContextError(error, 'history-loader', { 
          fallbackAction: () => { this.history = []; } 
        });
      } else {
        logger.error("[HistoryManager] Failed to load history from storage:", error);
      }
      this.history = [];
      return [];
    }
  }

  /**
   * Clear all translation history.
   * 
   * @returns {Promise<void>}
   */
  async clearHistory() {
    this.history = [];
    await this.saveHistoryToStorage();
    logger.debug("[HistoryManager] History cleared successfully.");
  }

  /**
   * Get current in-memory history.
   * 
   * @returns {Array}
   */
  getHistory() {
    return this.history;
  }
}
