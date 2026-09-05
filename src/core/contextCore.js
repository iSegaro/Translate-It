// src/core/contextCore.js
// Core context validation logic without dependencies to prevent circular imports

import browser from "webextension-polyfill";

/**
 * Internal state for context invalidation, shared across modules.
 */
export const contextState = {
  isInvalidated: false,
  notificationShown: false
};

/**
 * Synchronous extension context validation.
 * @returns {boolean} True if context is valid
 */
export function isValidSync() {
  if (contextState.isInvalidated) return false;
  try {
    if (!browser || !browser.runtime) {
      contextState.isInvalidated = true;
      return false;
    }

    const url = browser.runtime.getURL("test");
    if (url && url.includes("://invalid/")) {
      contextState.isInvalidated = true;
      return false;
    }

    if (!browser.runtime.id) {
      contextState.isInvalidated = true;
      return false;
    }

    return true;
  } catch {
    contextState.isInvalidated = true;
    return false;
  }
}

function getContextErrorMessage(error) {
  return String(error?.message || error || '').toLowerCase();
}

/**
 * Determines whether an error proves that this extension context is gone.
 * @param {Error|string} error
 * @returns {boolean}
 */
export function isPermanentContextInvalidation(error) {
  const message = getContextErrorMessage(error);
  const type = String(error?.type || '').toLowerCase();

  return type === 'extension_context_invalidated'
    || message.includes('extension context invalidated')
    || message.includes('runtime api unavailable')
    || message.includes('runtime api missing')
    || message.includes('runtime.id missing')
    || message.includes('runtime.geturl invalid')
    || message.includes('runtime.geturl failed')
    || message.includes('runtime.geturl throws');
}

/**
 * Determines whether an error only describes a failed message transport.
 * @param {Error|string} error
 * @returns {boolean}
 */
export function isTransientMessagingError(error) {
  const message = getContextErrorMessage(error);

  return message.includes('receiving end does not exist')
    || message.includes('could not establish connection')
    || message.includes('no receiving end')
    || message.includes('no receiver')
    || message.includes('message channel closed')
    || message.includes('message port closed')
    || message.includes('listener indicated an asynchronous response');
}

/**
 * Check if an error is context-related.
 * Manual implementation to avoid circular dependency with ErrorMatcher.
 * @param {Error|string} error 
 * @returns {boolean}
 */
export function isContextError(error) {
  return isPermanentContextInvalidation(error) || isTransientMessagingError(error);
}

/**
 * Shared environments constants.
 */
export const ENVIRONMENTS = {
  BACKGROUND: "background",
  CONTENT: "content",
  POPUP: "popup",
  SIDEPANEL: "sidepanel",
  OPTIONS: "options",
  PDF: "pdf",
  OFFSCREEN: "offscreen",
};

/**
 * Detect current environment.
 */
export function getActiveEnvironment() {
  if (typeof document === "undefined") {
    return ENVIRONMENTS.BACKGROUND;
  }

  const protocol = globalThis.location?.protocol || "";
  const url = globalThis.location?.href || "";
  const isExtensionProtocol = protocol.endsWith("-extension:") || protocol === "extension:";

  if (isExtensionProtocol) {
    if (url.includes("popup.html")) return ENVIRONMENTS.POPUP;
    if (url.includes("sidepanel.html")) return ENVIRONMENTS.SIDEPANEL;
    if (url.includes("options.html")) return ENVIRONMENTS.OPTIONS;
    if (url.includes("pdf.html")) return ENVIRONMENTS.PDF;
    if (url.includes("offscreen.html")) return ENVIRONMENTS.OFFSCREEN;
    return ENVIRONMENTS.BACKGROUND;
  }

  return ENVIRONMENTS.CONTENT;
}
