// src/utils/framework-compat/text-insertion/strategies/google-docs.js

import { tryOptimizedPasteInsertion } from "./paste-optimized.js";

// Lazy logger to avoid initialization order issues
let _logger;
const getLogger = () => {
  if (!_logger) {
    _logger = createLogger(LOG_COMPONENTS.BACKGROUND, 'google-docs');
  }
  return _logger;
};

import { createLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';


/**
 * روش خاص Google Docs
 */
export async function tryGoogleDocsInsertion(element, text) {
  try {
    getLogger().debug('Attempting Google Docs specific method');

    // پیدا کردن iframe Google Docs
    const iframe = document.querySelector(".docs-texteventtarget-iframe");
    if (iframe && iframe.contentDocument) {
      const editableElement = iframe.contentDocument.querySelector(
        "[contenteditable=true]"
      );
      if (editableElement) {
        // استفاده از روش بهینه‌شده paste برای Google Docs
        return await tryOptimizedPasteInsertion(editableElement, text, false);
      }
    }

    // fallback: تلاش روی المان اصلی
    if (element && window.location.hostname.includes("docs.google.com")) {
      return await tryOptimizedPasteInsertion(element, text, false);
    }

    return false;
  } catch (error) {
    getLogger().error('Error:', error);
    return false;
  }
}
