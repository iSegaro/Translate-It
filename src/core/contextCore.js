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

/**
 * Check if an error is context-related.
 * Manual implementation to avoid circular dependency with ErrorMatcher.
 * @param {Error|string} error 
 * @returns {boolean}
 */
export function isContextError(error) {
  const message = (error?.message || error || "").toLowerCase();
  
  return (
    message.includes("extension context invalidated") ||
    message.includes("message channel closed") ||
    message.includes("receiving end does not exist") ||
    message.includes("could not establish connection") ||
    message.includes("message port closed")
  );
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
    if (url.includes("offscreen.html")) return ENVIRONMENTS.OFFSCREEN;
    return ENVIRONMENTS.BACKGROUND;
  }

  return ENVIRONMENTS.CONTENT;
}
