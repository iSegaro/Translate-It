import browser from 'webextension-polyfill';
import { ocrCache } from '../utils/ocrCache.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.SCREEN_CAPTURE, 'OCREngine');
const REMOTE_LANG_PATH = 'https://tessdata.projectnaptha.com/4.0.0_fast';
const TESSERACT_CACHE_PATH = '.';

let worker = null;
let currentLang = null;
let lastUsedTime = Date.now();
const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
let idleInterval = null;

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
    logger.debug("Terminating existing worker");
    await worker.terminate();
    worker = null;
  }

  // Use absolute URLs for all assets
  const workerPath = browser.runtime.getURL('assets/ocr/worker.min.js');
  // In v7, corePath should ideally point to the directory containing the WASM files.
  // The library will automatically select the best core (e.g. simd-lstm) from the folder.
  const corePath = browser.runtime.getURL('assets/ocr/');
  
  // Strictly use read-only mode to prevent unexpected background downloads.
  // Models must be pre-downloaded from the OCR settings tab.
  const cacheMethod = 'readOnly';

  logger.debug(`Initializing Tesseract.js v7 worker for ${lang}`, {
    workerPath,
    corePath,
    langPath: REMOTE_LANG_PATH,
    cachePath: TESSERACT_CACHE_PATH,
    cacheMethod
  });

  try {
    // Migration: Ensure models are in Uint8Array format (required for Tesseract.js v5+)
    await ocrCache.migrateTesseractCache();

    // Check if model is in our manual cache
    const isCached = await ocrCache.hasModel(lang);
    if (!isCached) {
      logger.warn(`Model for ${lang} not found in ocrCache. Refusing to download automatically.`);
      throw new Error("model-not-installed");
    }

    // Import Tesseract module
    const { createWorker } = await import('tesseract.js');
    
    // Tesseract.js v7: (langs, oem, options)
    // workerBlobURL: false is critical for extensions to avoid blob: CSP issues
    worker = await createWorker(lang, 1, {
      workerPath,
      corePath,
      langPath: REMOTE_LANG_PATH,
      cachePath: TESSERACT_CACHE_PATH,
      cacheMethod,
      workerBlobURL: false,
      logger: m => logger.debug('Tesseract:', m),
    });

    logger.debug(`Worker initialized successfully for ${lang}`);
    currentLang = lang;
  } catch (error) {
    logger.error(`Failed to initialize worker for ${lang}:`, error);
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
        top: Math.round(coordinates.y),
        left: Math.round(coordinates.x),
        width: Math.round(coordinates.width),
        height: Math.round(coordinates.height)
      };
    }

    const { data: { text } } = await worker.recognize(image, options);
    lastUsedTime = Date.now();
    return text;
  } catch (error) {
    logger.error('Recognition failed', error);
    throw error;
  }
}

/**
 * Terminate worker if idle
 */
export async function terminateIfIdle() {
  if (worker && (Date.now() - lastUsedTime > IDLE_TIMEOUT)) {
    logger.debug('Terminating idle worker');
    await worker.terminate();
    worker = null;
    currentLang = null;
  }
}

// Set up periodic idle check
if (!idleInterval) {
  idleInterval = setInterval(terminateIfIdle, 60000); // Check every minute
}

/**
 * Cleanup OCR engine resources
 * Call this when the feature is deactivated or extension is shutting down
 */
export async function cleanupOCREngine() {
  logger.debug('Cleaning up OCR engine resources');

  // Clear idle check interval
  if (idleInterval) {
    clearInterval(idleInterval);
    idleInterval = null;
    logger.debug('Cleared idle check interval');
  }

  // Terminate worker if active
  if (worker) {
    try {
      await worker.terminate();
      logger.debug('OCR worker terminated');
    } catch (error) {
      logger.warn('Error terminating OCR worker:', error);
    }
    worker = null;
  }

  // Reset state
  currentLang = null;
  lastUsedTime = Date.now();

  logger.debug('OCR engine cleanup completed');
}
