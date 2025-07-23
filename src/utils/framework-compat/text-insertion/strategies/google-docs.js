// src/utils/framework-compat/text-insertion/strategies/google-docs.js

import { logME } from "../../../helpers.js";
import { tryOptimizedPasteInsertion } from "./paste-optimized.js";

/**
 * روش خاص Google Docs
 */
export async function tryGoogleDocsInsertion(element, text) {
  try {
    logME("[tryGoogleDocsInsertion] Attempting Google Docs specific method");

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
    logME("[tryGoogleDocsInsertion] Error:", error);
    return false;
  }
}
