import { defineStore } from 'pinia';
import { ocrCache } from '../utils/ocrCache.js';
import { toTesseractLanguageCode, getSupportedOCRCanvasCodes } from '../utils/ocrLanguageMap.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.SCREEN_CAPTURE, 'OCRStore');

export const useOCRStore = defineStore('ocr', {
  state: () => ({
    downloadedLanguages: [],
    downloadingProgress: {}, // { [langCode]: progress }
    // Settings
    defaultOCRLang: 'eng',
  }),

  getters: {
    isDownloaded: (state) => (lang) => {
      const tesseractCode = toTesseractLanguageCode(lang);
      return state.downloadedLanguages.includes(tesseractCode);
    },
    isDownloading: (state) => (langCode) => {
      return state.downloadingProgress[langCode] !== undefined;
    },
    getDownloadProgress: (state) => (langCode) => {
      return state.downloadingProgress[langCode] || 0;
    },
    supportedLanguages: () => {
      return getSupportedOCRCanvasCodes();
    }
  },

  actions: {
    async init() {
      await this.refreshDownloadedLanguages();
    },

    async refreshDownloadedLanguages() {
      this.downloadedLanguages = await ocrCache.listCachedLanguages();
    },

    async downloadLanguage(langCode) {
      const tesseractCode = toTesseractLanguageCode(langCode);

      if (this.downloadedLanguages.includes(tesseractCode) || this.downloadingProgress[langCode] !== undefined) {
        return;
      }

      this.downloadingProgress[langCode] = 0;

      try {
        // Tesseract.js language data URL (using the fast/lightweight models)
        // We use the same URL format as Tesseract.js uses internally
        const url = `https://tessdata.projectnaptha.com/4.0.0_fast/${tesseractCode}.traineddata.gz`;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to download ${tesseractCode}`);

        const contentLength = response.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        let loaded = 0;

        const reader = response.body.getReader();
        const chunks = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          chunks.push(value);
          loaded += value.length;

          if (total > 0) {
            this.downloadingProgress[langCode] = Math.round((loaded / total) * 100);
          }
        }

        const blob = new Blob(chunks);
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        await ocrCache.saveModel(tesseractCode, uint8Array);
        await this.refreshDownloadedLanguages();
      } catch (error) {
        logger.error(`Error downloading ${tesseractCode}`, error);
        throw error;
      } finally {
        delete this.downloadingProgress[langCode];
      }
    },

    async deleteLanguage(langCode) {
      const tesseractCode = toTesseractLanguageCode(langCode);
      await ocrCache.deleteModel(tesseractCode);
      await this.refreshDownloadedLanguages();
    },

    async clearAllLanguages() {
      await ocrCache.clear();
      await this.refreshDownloadedLanguages();
    }
  }
});
