// src/core/contextCore.js
// Core context validation logic without dependencies to prevent circular imports

import browser from "webextension-polyfill";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { matchErrorToType } from "@/shared/error-management/ErrorMatcher.js";

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
 * @param {Error|string} error 
 * @returns {boolean}
 */
export function isContextError(error) {
  const errorType = matchErrorToType(error);
  return (
    errorType === ErrorTypes.EXTENSION_CONTEXT_INVALIDATED ||
    errorType === ErrorTypes.CONTEXT
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
