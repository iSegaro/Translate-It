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
    console.log("OCREngine: Terminating existing worker...");
    await worker.terminate();
    worker = null;
  }

  // Use absolute URLs for all assets
  const workerPath = browser.runtime.getURL('assets/ocr/worker.min.js');
  const corePath = browser.runtime.getURL('assets/ocr/tesseract-core-simd-lstm.wasm.js');
  const langPath = 'https://tessdata.projectnaptha.com/4.0.0'; 

  console.log(`OCREngine: Initializing worker for ${lang}...`, {
    workerPath,
    corePath,
    langPath
  });

  try {
    // Import Tesseract module
    const { createWorker } = await import('tesseract.js');
    
    // Following EdgeTranslate pattern: (lang, oem, options)
    // workerBlobURL: false is critical for extensions to avoid blob: CSP issues
    worker = await createWorker(lang, 1, {
      workerPath: workerPath,
      corePath: corePath,
      langPath: langPath,
      workerBlobURL: false, 
      logger: m => console.debug('Tesseract:', m),
    });
    
    console.log(`OCREngine: Worker initialized successfully for ${lang}`);
    currentLang = lang;
  } catch (error) {
    console.error(`OCREngine: Failed to initialize worker for ${lang}:`, error);
    worker = null;
    throw error;
  }

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
