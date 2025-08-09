// src/utils/helpers.js
import browser from "webextension-polyfill";
import { ErrorHandler } from "../../error-management/ErrorService.js";
import { ErrorTypes } from "../../error-management/ErrorTypes.js";
import { IsDebug } from "../../config.js";

// Lazy loader for ErrorHandler to break circular dependency
let errorHandlerInstance = null;
const getErrorHandler = () => {
  if (!errorHandlerInstance) {
    errorHandlerInstance = ErrorHandler.getInstance();
  }
  return errorHandlerInstance;
};

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Decorator for logging method calls for debugging purposes.
 */
export function logMethod(target, propertyKey, descriptor) {
  // This is disabled but kept for potential future debugging.
  void target;
  void propertyKey;
  void descriptor;
  return;
}

export const logME = (...args) => {
  // IsDebug().then((IsDebug) => {
  //   if (IsDebug) {
  console.debug(...args);
  //   }
  // });
};

/**
 * Injects a CSS file into the document's head.
 * @param {string} cssPath - The path to the CSS file from the extension's root.
 */
// Track injected CSS files globally to prevent duplicates across extension contexts
window.injectedCSSFiles = window.injectedCSSFiles || new Set();

// Track active extension IDs to detect duplicates  
window.activeExtensionIds = window.activeExtensionIds || new Set();

export function injectIconStyle(cssPath) {
  try {
    // Log call stack to see who's calling this function
    logME('[injectIconStyle] Called from:', new Error().stack?.split('\n')[2]?.trim());
    
    // Validate browser runtime context first
    if (!browser || !browser.runtime || typeof browser.runtime.getURL !== 'function') {
      logME('[injectIconStyle] Browser runtime not available, cannot inject CSS:', cssPath);
      return;
    }

    // Check if extension context is still valid (basic sync check)
    let manifest;
    try {
      manifest = browser.runtime.getManifest(); // This will throw if context is invalid
      if (!manifest || !manifest.version) {
        throw new Error('Invalid manifest');
      }
    } catch (contextError) {
      logME('[injectIconStyle] Extension context invalid, cannot inject CSS:', cssPath, contextError);
      return;
    }

    const cssURL = browser.runtime.getURL(cssPath);
    
    // Debug extension ID consistency  
    const manifestId = manifest.name || 'unknown';
    const urlExtensionId = cssURL.match(/chrome-extension:\/\/([^\/]+)/)?.[1];
    logME('[injectIconStyle] Extension info:', {
      manifestName: manifestId,
      manifestVersion: manifest.version,
      cssURL: cssURL,
      urlExtensionId: urlExtensionId
    });
    
    // Validate URL before using
    if (!cssURL || cssURL.includes('invalid')) {
      logME('[injectIconStyle] Invalid extension URL generated:', cssURL);
      return;
    }

    // Check if this specific URL has already been injected (by exact URL match)
    if (window.injectedCSSFiles.has(cssURL)) {
      logME('[injectIconStyle] CSS already injected, skipping:', cssPath, 'URL:', cssURL);
      return;
    }

    // Also check DOM for existing links with same URL (redundant safety check)  
    if (document.querySelector(`link[href="${cssURL}"]`)) {
      window.injectedCSSFiles.add(cssURL);
      logME('[injectIconStyle] CSS link found in DOM, marking as injected:', cssPath);
      return;
    }

    // Test if CSS file actually exists before injection
    const testLink = document.createElement('link');
    testLink.href = cssURL;
    testLink.type = 'text/css';
    testLink.rel = 'stylesheet';
    testLink.onerror = () => {
      const extensionId = cssURL.match(/chrome-extension:\/\/([^\/]+)/)?.[1];
      logME('[injectIconStyle] CSS file not found, trying alternative paths:', cssPath, 'Extension ID:', extensionId);
      testLink.remove(); // Clean up failed link
      
      // Try alternative path first - maybe it's in src/styles/ 
      if (cssPath === 'styles/icon.css') {
        const altPath = 'src/styles/icon.css';
        const altURL = browser.runtime.getURL(altPath);
        logME('[injectIconStyle] Trying alternative path:', altPath, 'URL:', altURL);
        
        const altLink = document.createElement('link');
        altLink.href = altURL;
        altLink.type = 'text/css';
        altLink.rel = 'stylesheet';
        altLink.onload = () => {
          window.injectedCSSFiles.add(altURL);
          logME('[injectIconStyle] Alternative CSS loaded successfully:', altPath);
        };
        altLink.onerror = () => {
          logME('[injectIconStyle] Alternative path also failed, using fallback inline CSS');
          altLink.remove();
          injectFallbackCSS();
        };
        (document.head || document.documentElement).appendChild(altLink);
        return;
      }
      
      // If not icon.css or alternative failed, use inline fallback
      injectFallbackCSS();
    };
    
    function injectFallbackCSS() {
      if (!document.getElementById('translate-icon-fallback-css')) {
        const fallbackStyle = document.createElement('style');
        fallbackStyle.id = 'translate-icon-fallback-css';
        fallbackStyle.textContent = `
          .AIWritingCompanion-translation-icon-extension,
          .translate-icon-fallback {
            position: absolute !important;
            display: none !important;
            background: white !important;
            border: 1px solid gray !important;
            border-radius: 4px !important;
            padding: 2px 5px !important;
            font-size: 12px !important;
            cursor: pointer !important;
            z-index: 9999999999 !important;
            pointer-events: auto !important;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
            font-family: system-ui, -apple-system, sans-serif !important;
          }
          .AIWritingCompanion-translation-icon-extension:hover {
            background: #f0f0f0 !important;
          }
          .fade-in { opacity: 1 !important; }
          .fade-out { opacity: 0 !important; transition: opacity 0.3s ease !important; }
        `;
        (document.head || document.documentElement).appendChild(fallbackStyle);
        logME('[injectIconStyle] Fallback inline CSS injected for translate icons');
      }
    }
    testLink.onload = () => {
      window.injectedCSSFiles.add(cssURL);
      logME('[injectIconStyle] CSS successfully loaded:', cssPath, 'URL:', cssURL);
    };

    // Add to DOM - let browser handle loading/error
    (document.head || document.documentElement).appendChild(testLink);
  } catch (error) {
    logME('[injectIconStyle] Error injecting CSS:', cssPath, error);
    getErrorHandler().handle(error, {
      type: ErrorTypes.UI,
      context: "injectIconStyle",
    });
  }
}

export const isEditable = (element) => {
  if (!element) return false;
  if (element.isContentEditable) return true;
  if (element.tagName === "TEXTAREA") return true;
  if (element.tagName === "INPUT") {
    const textEntryTypes = new Set([
      "text", "search", "url", "tel", "email", "password", "number",
      "date", "month", "week", "time", "datetime-local",
    ]);
    return textEntryTypes.has(element.type.toLowerCase());
  }
  if (element.closest && element.closest('[contenteditable="true"]')) return true;
  return false;
};

export const Is_Element_Need_to_RTL_Localize = (element) => {
  if (element?.isContentEditable) return true;
  if (element?.tagName === "TEXTAREA") return true;
  if (element?.tagName === "INPUT") {
    const inputType = element.getAttribute("type")?.toLowerCase() || "text";
    return ["text", "checkbox"].includes(inputType);
  }
  if (["H2", "LABEL", "SPAN"].includes(element?.tagName)) return true;
  if (element?.closest && element.closest('[contenteditable="true"]')) return true;
  return false;
};

export const isExtensionContextValid = async () => {
  try {
    return !!browser?.runtime?.id && !!browser?.storage?.local;
  } catch {
    return false;
  }
};

export const openOptionsPage = (anchor = null) => {
  browser.runtime
    .sendMessage({
      action: "open_options_page",
      data: { anchor: anchor },
    })
    .catch((err) => {
      console.error("Error sending open_options_page message:", err);
    });
};

export const openOptionsPage_from_Background = (message) => {
  const anchor = message.data?.anchor;
  const optionsPath = "html/options.html";
  const baseUrl = browser.runtime.getURL(optionsPath);
  const finalUrl = anchor ? `${baseUrl}#${anchor}` : baseUrl;
  focusOrCreateTab(finalUrl);
};

export function focusOrCreateTab(url) {
  const baseUrl = url.split("#")[0];
  browser.tabs.query({}).then((tabs) => {
    const targetPath = baseUrl.replace(/^chrome-extension:\/\/[^/]+/, "");
    const existingTabs = tabs.filter((tab) => {
      if (!tab.url) return false;
      const tabPath = tab.url.split("#")[0].replace(/^chrome-extension:\/\/[^/]+/, "");
      return tabPath === targetPath;
    });

    if (existingTabs.length > 0) {
      const firstTab = existingTabs[0];
      const duplicateTabIds = existingTabs.slice(1).map((tab) => tab.id);
      if (duplicateTabIds.length > 0) {
        browser.tabs.remove(duplicateTabIds).catch((err) => console.error("Error closing duplicate tabs:", err));
      }
      browser.tabs.update(firstTab.id, { active: true, url: url }).then((updatedTab) => {
        if (updatedTab) browser.windows.update(updatedTab.windowId, { focused: true });
      }).catch(() => browser.tabs.create({ url: url }));
    } else {
      browser.tabs.create({ url: url });
    }
  }).catch((err) => {
    console.error("Error in focusOrCreateTab:", err);
    browser.tabs.create({ url: url });
  });
}

export function taggleLinks(enable = true) {
  try {
    if (!document?.body) return;
    document.documentElement.classList.toggle("AIWritingCompanion-disable-links", enable);
  } catch (error) {
    const handlerError = getErrorHandler().handle(error, {
      type: ErrorTypes.CONTEXT,
      context: "taggleLinks",
      details: {
        errorType: error.message.includes("context invalidated") ? "CONTEXT_INVALIDATED" : "UNKNOWN_ERROR",
      },
    });
    throw handlerError;
  }
}

export const showStatus = (() => {
  let currentNotification = null;
  return (message, type, duration = 2000) => {
    if (currentNotification) {
      currentNotification.remove();
    }
    const notification = document.createElement("div");
    notification.className = `status-notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    currentNotification = notification;
    setTimeout(() => {
      notification.remove();
      currentNotification = null;
    }, duration);
  };
})();