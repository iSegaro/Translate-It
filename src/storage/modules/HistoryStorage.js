/**
 * HistoryStorage - Specialized storage module for translation history
 * Handles translation history, favorites, and usage statistics
 */

import { storageCore } from '../core/StorageCore.js';

export class HistoryStorage {
  constructor() {
    this.storage = storageCore;
    this.historyKey = 'translationHistory';
    this.maxHistoryItems = 1000; // Maximum history items to keep
  }

  /**
   * Get translation history
   * @param {Object} options - Query options
   * @returns {Promise<Array>} History items
   */
  async getHistory(options = {}) {
    try {
      const { limit = 100, offset = 0, sortBy = 'timestamp', order = 'desc' } = options;
      
      const result = await this.storage.get({ [this.historyKey]: [] });
      let history = result[this.historyKey] || [];

      // Sort history
      history.sort((a, b) => {
        const aVal = a[sortBy] || 0;
        const bVal = b[sortBy] || 0;
        return order === 'desc' ? bVal - aVal : aVal - bVal;
      });

      // Apply pagination
      const paginatedHistory = history.slice(offset, offset + limit);
      
      console.log(`[HistoryStorage] Retrieved ${paginatedHistory.length} history items`);
      return paginatedHistory;
    } catch (error) {
      console.error('[HistoryStorage] Get history failed:', error);
      return [];
    }
  }

  /**
   * Add item to history
   * @param {Object} item - History item
   * @returns {Promise<void>}
   */
  async addHistoryItem(item) {
    try {
      const historyItem = {
        id: `${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
        timestamp: Date.now(),
        sourceText: item.sourceText,
        translatedText: item.translatedText,
        sourceLanguage: item.sourceLanguage || 'auto',
        targetLanguage: item.targetLanguage || 'fa',
        provider: item.provider || 'unknown',
        ...item
      };

      const result = await this.storage.get({ [this.historyKey]: [] });
      let history = result[this.historyKey] || [];

      // Check for duplicates
      const isDuplicate = history.some(h => 
        h.sourceText === historyItem.sourceText && 
        h.targetLanguage === historyItem.targetLanguage &&
        h.sourceLanguage === historyItem.sourceLanguage
      );

      if (!isDuplicate) {
        // Add to beginning of array
        history.unshift(historyItem);

        // Limit history size
        if (history.length > this.maxHistoryItems) {
          history = history.slice(0, this.maxHistoryItems);
        }

        await this.storage.set({ [this.historyKey]: history });
        console.log('[HistoryStorage] Added history item');
      }
    } catch (error) {
      console.error('[HistoryStorage] Add history item failed:', error);
      throw error;
    }
  }

  /**
   * Update history item
   * @param {string} id - Item ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<boolean>} Success status
   */
  async updateHistoryItem(id, updates) {
    try {
      const result = await this.storage.get({ [this.historyKey]: [] });
      const history = result[this.historyKey] || [];

      const itemIndex = history.findIndex(item => item.id === id);
      if (itemIndex === -1) {
        console.warn(`[HistoryStorage] History item '${id}' not found`);
        return false;
      }

      // Update item
      history[itemIndex] = { ...history[itemIndex], ...updates, updatedAt: Date.now() };

      await this.storage.set({ [this.historyKey]: history });
      console.log(`[HistoryStorage] Updated history item '${id}'`);
      return true;
    } catch (error) {
      console.error(`[HistoryStorage] Update history item '${id}' failed:`, error);
      return false;
    }
  }

  /**
   * Remove history items
   * @param {string|string[]} ids - Item IDs to remove
   * @returns {Promise<number>} Number of items removed
   */
  async removeHistoryItems(ids) {
    try {
      const idList = Array.isArray(ids) ? ids : [ids];
      const result = await this.storage.get({ [this.historyKey]: [] });
      const history = result[this.historyKey] || [];

      const filteredHistory = history.filter(item => !idList.includes(item.id));
      const removedCount = history.length - filteredHistory.length;

      if (removedCount > 0) {
        await this.storage.set({ [this.historyKey]: filteredHistory });
        console.log(`[HistoryStorage] Removed ${removedCount} history item(s)`);
      }

      return removedCount;
    } catch (error) {
      console.error('[HistoryStorage] Remove history items failed:', error);
      return 0;
    }
  }

  /**
   * Clear all history
   * @returns {Promise<void>}
   */
  async clearHistory() {
    try {
      await this.storage.set({ [this.historyKey]: [] });
      console.log('[HistoryStorage] History cleared');
    } catch (error) {
      console.error('[HistoryStorage] Clear history failed:', error);
      throw error;
    }
  }

  /**
   * Search history
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Matching history items
   */
  async searchHistory(query, options = {}) {
    try {
      const { limit = 50, fields = ['sourceText', 'translatedText'] } = options;
      
      const history = await this.getHistory({ limit: this.maxHistoryItems });
      const searchQuery = query.toLowerCase();

      const matches = history.filter(item => {
        return fields.some(field => {
          const value = item[field];
          return value && value.toLowerCase().includes(searchQuery);
        });
      });

      const limitedMatches = matches.slice(0, limit);
      console.log(`[HistoryStorage] Found ${limitedMatches.length} matches for '${query}'`);
      return limitedMatches;
    } catch (error) {
      console.error('[HistoryStorage] Search history failed:', error);
      return [];
    }
  }

  /**
   * Get history statistics
   * @returns {Promise<Object>} Usage statistics
   */
  async getHistoryStats() {
    try {
      const history = await this.getHistory({ limit: this.maxHistoryItems });
      
      const stats = {
        totalItems: history.length,
        providers: {},
        languages: {},
        recentActivity: history.slice(0, 10).length,
        oldestItem: history.length > 0 ? Math.min(...history.map(h => h.timestamp)) : null,
        newestItem: history.length > 0 ? Math.max(...history.map(h => h.timestamp)) : null
      };

      // Count by provider and language
      history.forEach(item => {
        // Provider stats
        const provider = item.provider || 'unknown';
        stats.providers[provider] = (stats.providers[provider] || 0) + 1;

        // Language stats
        const langPair = `${item.sourceLanguage}->${item.targetLanguage}`;
        stats.languages[langPair] = (stats.languages[langPair] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error('[HistoryStorage] Get history stats failed:', error);
      return { totalItems: 0, providers: {}, languages: {}, recentActivity: 0 };
    }
  }

  /**
   * Listen for history changes
   * @param {Function} callback - Callback function
   */
  onHistoryChange(callback) {
    this.storage.on(`change:${this.historyKey}`, ({ newValue, oldValue }) => {
      callback(newValue, oldValue);
    });
  }

  /**
   * Remove history change listener
   * @param {Function} callback - Callback function
   */
  offHistoryChange(callback) {
    this.storage.off(`change:${this.historyKey}`, callback);
  }
}

// Create singleton instance
const historyStorage = new HistoryStorage();

export { historyStorage };
export default historyStorage;