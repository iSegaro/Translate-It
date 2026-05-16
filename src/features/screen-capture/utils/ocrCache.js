/**
 * IndexedDB wrapper for caching OCR language models (.traineddata)
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.SCREEN_CAPTURE, 'OCRCache');
const DB_NAME = 'translate_it_ocr_cache';
const STORE_NAME = 'language_models';
const DB_VERSION = 1;
const TESSERACT_DB_NAME = 'keyval-store';
const TESSERACT_STORE_NAME = 'keyval';
const TESSERACT_CACHE_PREFIX = '.';

const getTesseractCacheKey = (lang) => `${TESSERACT_CACHE_PREFIX}/${lang}.traineddata`;

class OCRCache {
  constructor() {
    this.db = null;
    this.tesseractDb = null;
  }

  /**
   * Initialize the database
   */
  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        logger.error('Error opening IndexedDB', event.target.error);
        reject(event.target.error);
      };
    });
  }

  /**
   * Initialize Tesseract.js' built-in browser cache database.
   *
   * Tesseract.js reads language models through idb-keyval using the default
   * database/store pair. Mirroring our manually downloaded models there makes
   * OCR runtime use the same files managed from the OCR settings tab.
   */
  async initTesseractCache() {
    if (this.tesseractDb) return this.tesseractDb;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(TESSERACT_DB_NAME, 1);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(TESSERACT_STORE_NAME)) {
          db.createObjectStore(TESSERACT_STORE_NAME);
        }
      };

      request.onsuccess = (event) => {
        this.tesseractDb = event.target.result;
        resolve(this.tesseractDb);
      };

      request.onerror = (event) => {
        logger.error('Error opening Tesseract IndexedDB cache', event.target.error);
        reject(event.target.error);
      };
    });
  }

  async getTesseractCachedModel(lang) {
    const db = await this.initTesseractCache();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TESSERACT_STORE_NAME], 'readonly');
      const store = transaction.objectStore(TESSERACT_STORE_NAME);
      const request = store.get(getTesseractCacheKey(lang));

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async saveTesseractCachedModel(lang, data) {
    const db = await this.initTesseractCache();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TESSERACT_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(TESSERACT_STORE_NAME);
      const request = store.put(data, getTesseractCacheKey(lang));

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteTesseractCachedModel(lang) {
    const db = await this.initTesseractCache();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TESSERACT_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(TESSERACT_STORE_NAME);
      const request = store.delete(getTesseractCacheKey(lang));

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async listTesseractCachedLanguages() {
    const db = await this.initTesseractCache();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TESSERACT_STORE_NAME], 'readonly');
      const store = transaction.objectStore(TESSERACT_STORE_NAME);
      const request = store.getAllKeys();

      request.onsuccess = () => {
        const languages = request.result
          .map((key) => String(key).match(/^\.\/(.+)\.traineddata$/)?.[1])
          .filter(Boolean);
        resolve(languages);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get a language model from cache
   * @param {string} lang Language code (e.g., 'eng')
   * @returns {Promise<ArrayBuffer|null>}
   */
  async getModel(lang) {
    const db = await this.init();
    const model = await new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(lang);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });

    if (model) return model;

    try {
      return await this.getTesseractCachedModel(lang);
    } catch (error) {
      logger.warn(`Failed to read ${lang} from Tesseract cache`, error);
      return null;
    }
  }

  /**
   * Save a language model to cache
   * @param {string} lang Language code
   * @param {ArrayBuffer|Uint8Array} data The model data
   */
  async saveModel(lang, data) {
    // CRITICAL: Tesseract.js v5+ (and tesseract-core) requires Uint8Array (ArrayBufferView)
    // to write to its virtual filesystem. ArrayBuffer will cause "Unsupported data type" error.
    const uint8Data = data instanceof ArrayBuffer ? new Uint8Array(data) : data;

    const db = await this.init();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(uint8Data, lang);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    try {
      await this.saveTesseractCachedModel(lang, uint8Data);
    } catch (error) {
      logger.warn(`Failed to mirror ${lang} to Tesseract cache`, error);
    }
  }

  /**
   * Migrate existing cached models from ArrayBuffer to Uint8Array
   * Fixes the "Unsupported data type" error in Tesseract.js v5+
   */
  async migrateTesseractCache() {
    try {
      logger.debug('Starting Tesseract cache migration...');
      const languages = await this.listTesseractCachedLanguages();
      let migratedCount = 0;

      for (const lang of languages) {
        const data = await this.getTesseractCachedModel(lang);
        // If it's an ArrayBuffer but not a View (like Uint8Array), it will crash Tesseract.js v5+
        if (data && data instanceof ArrayBuffer && !ArrayBuffer.isView(data)) {
          logger.debug(`Migrating ${lang} from ArrayBuffer to Uint8Array`);
          await this.saveTesseractCachedModel(lang, new Uint8Array(data));
          migratedCount++;
        }
      }

      if (migratedCount > 0) {
        logger.info(`Successfully migrated ${migratedCount} OCR models to Uint8Array format`);
      } else {
        logger.debug('No OCR models needed migration');
      }
    } catch (error) {
      logger.error('Failed to migrate Tesseract cache', error);
    }
  }

  /**
   * Delete a language model from cache
   * @param {string} lang Language code
   */
  async deleteModel(lang) {
    const db = await this.init();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(lang);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    try {
      await this.deleteTesseractCachedModel(lang);
    } catch (error) {
      logger.warn(`Failed to delete ${lang} from Tesseract cache`, error);
    }
  }

  /**
   * Clear all cached models
   */
  async clear() {
    const languages = await this.listCachedLanguages();
    const db = await this.init();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    await Promise.all(languages.map(async (lang) => {
      try {
        await this.deleteTesseractCachedModel(lang);
      } catch (error) {
        logger.warn(`Failed to delete ${lang} from Tesseract cache during clear`, error);
      }
    }));
  }

  /**
   * List all cached language codes
   */
  async listCachedLanguages() {
    const db = await this.init();
    const localLanguages = await new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAllKeys();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    try {
      const tesseractLanguages = await this.listTesseractCachedLanguages();
      return Array.from(new Set([...localLanguages, ...tesseractLanguages]));
    } catch (error) {
      logger.warn('Failed to list Tesseract cached OCR languages', error);
      return localLanguages;
    }
  }

  /**
   * Check if a language model is in cache
   * @param {string} lang Language code
   * @returns {Promise<boolean>}
   */
  async hasModel(lang) {
    try {
      const model = await this.getModel(lang);
      return model !== null;
    } catch {
      return false;
    }
  }
}

export const ocrCache = new OCRCache();
export default ocrCache;
