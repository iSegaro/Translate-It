import { createWorker } from 'tesseract.js';
import browser from 'webextension-polyfill';
import { ocrCache } from '../utils/ocrCache.js';

let worker = null;
let currentLang = null;
let lastUsedTime = Date.now();
const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

/**
 * Initialize Tesseract Worker
 * @param {string} lang Tesseract language code
 */
async function initWorker(lang) {
  if (worker && currentLang === lang) {
    lastUsedTime = Date.now();
    return worker;
  }

  if (worker) {
    await worker.terminate();
    worker = null;
  }

  console.log(`OCREngine: Initializing worker for ${lang}...`);
  
  // Custom fetch to use IndexedDB cache
  const customFetch = async (url) => {
    const filename = url.split('/').pop();
    if (filename.endsWith('.traineddata.gz')) {
      const langCode = filename.replace('.traineddata.gz', '');
      const cachedData = await ocrCache.getModel(langCode);
      if (cachedData) {
        console.log(`OCREngine: Using cached model for ${langCode}`);
        return {
          ok: true,
          arrayBuffer: () => Promise.resolve(cachedData),
          status: 200
        };
      }
    }
    
    // Fallback to normal fetch
    const response = await fetch(url);
    
    // Save to cache if it's a language model
    if (response.ok && filename.endsWith('.traineddata.gz')) {
      const langCode = filename.replace('.traineddata.gz', '');
      const clone = response.clone();
      const data = await clone.arrayBuffer();
      await ocrCache.saveModel(langCode, data);
      console.log(`OCREngine: Cached model for ${langCode}`);
    }
    
    return response;
  };

  worker = await createWorker(lang, 1, {
    workerPath: browser.runtime.getURL('assets/ocr/worker.min.js'),
    corePath: browser.runtime.getURL('assets/ocr/tesseract-core-simd-lstm.js'), // Point to the loader script
    logger: m => console.debug('Tesseract:', m),
    // We can't easily override fetch in createWorker options in V5 in all environments,
    // but Tesseract.js V5 has better built-in caching.
    // If we need strict local-only, we might need a different approach.
  });

  currentLang = lang;
  lastUsedTime = Date.now();
  return worker;
}

/**
 * Perform OCR on an image
 * @param {string|Blob|File} image Image source
 * @param {string} lang Tesseract language code
 * @param {Object} [coordinates] Optional crop coordinates {x, y, width, height}
 * @returns {Promise<string>} Extracted text
 */
export async function recognize(image, lang = 'eng', coordinates = null) {
  try {
    const worker = await initWorker(lang);
    
    const options = {};
    if (coordinates) {
      options.rectangle = {
        top: coordinates.y,
        left: coordinates.x,
        width: coordinates.width,
        height: coordinates.height
      };
    }

    const { data: { text } } = await worker.recognize(image, options);
    lastUsedTime = Date.now();
    return text;
  } catch (error) {
    console.error('OCREngine: Recognition failed', error);
    throw error;
  }
}

/**
 * Terminate worker if idle
 */
export async function terminateIfIdle() {
  if (worker && (Date.now() - lastUsedTime > IDLE_TIMEOUT)) {
    console.log('OCREngine: Terminating idle worker');
    await worker.terminate();
    worker = null;
    currentLang = null;
  }
}

// Set up periodic idle check
setInterval(terminateIfIdle, 60000); // Check every minute
