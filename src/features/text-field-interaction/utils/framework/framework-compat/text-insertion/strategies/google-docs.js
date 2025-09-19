// src/utils/framework-compat/text-insertion/strategies/google-docs.js

import { tryOptimizedPasteInsertion } from "./paste-optimized.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.FRAMEWORK, 'google-docs');


/**
 * روش خاص Google Docs
 */
export async function tryGoogleDocsInsertion(element, text) {
  try {
  logger.debug('Attempting Google Docs specific method');

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
    if (element && typeof window !== 'undefined' && window.location.hostname.includes("docs.google.com")) {
      return await tryOptimizedPasteInsertion(element, text, false);
    }

    return false;
  } catch (error) {
  logger.error('Error:', error);
    return false;
  }
}
