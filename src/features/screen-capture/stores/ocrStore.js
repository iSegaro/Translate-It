import { defineStore } from 'pinia';
import { ocrCache } from '../utils/ocrCache.js';

export const useOCRStore = defineStore('ocr', {
  state: () => ({
    downloadedLanguages: [],
    isDownloading: false,
    downloadProgress: 0,
    currentDownloadingLang: null,
    // Mapping of extension language codes to Tesseract language codes
    // Key: extension code, Value: Tesseract code
    langMapping: {
      'en': 'eng',
      'fa': 'fas',
      'fr': 'fra',
      'de': 'deu',
      'es': 'spa',
      'it': 'ita',
      'pt': 'por',
      'ru': 'rus',
      'zh-cn': 'chi_sim',
      'zh-tw': 'chi_tra',
      'ja': 'jpn',
      'ko': 'kor',
      'ar': 'ara',
      'hi': 'hin',
      'tr': 'tur',
      'nl': 'nld',
      'pl': 'pol',
      'vi': 'vie',
      'id': 'ind',
      'th': 'tha',
    },
    // Settings
    autoDownload: true,
    defaultOCRLang: 'eng',
  }),

  getters: {
    isDownloaded: (state) => (lang) => {
      const tesseractCode = state.langMapping[lang] || lang;
      return state.downloadedLanguages.includes(tesseractCode);
    },
    supportedLanguages: (state) => {
      return Object.keys(state.langMapping);
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
      const tesseractCode = this.langMapping[langCode] || langCode;
      
      if (this.downloadedLanguages.includes(tesseractCode)) {
        return;
      }

      this.isDownloading = true;
      this.currentDownloadingLang = langCode;
      this.downloadProgress = 0;

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
            this.downloadProgress = Math.round((loaded / total) * 100);
          }
        }

        const blob = new Blob(chunks);
        const arrayBuffer = await blob.arrayBuffer();

        await ocrCache.saveModel(tesseractCode, arrayBuffer);
        await this.refreshDownloadedLanguages();
      } catch (error) {
        console.error(`OCRStore: Error downloading ${tesseractCode}`, error);
        throw error;
      } finally {
        this.isDownloading = false;
        this.currentDownloadingLang = null;
        this.downloadProgress = 0;
      }
    },

    async deleteLanguage(langCode) {
      const tesseractCode = this.langMapping[langCode] || langCode;
      await ocrCache.deleteModel(tesseractCode);
      await this.refreshDownloadedLanguages();
    },

    async clearAllLanguages() {
      await ocrCache.clear();
      await this.refreshDownloadedLanguages();
    }
  }
});
