// src/handlers/extensionLifecycleHandler.js
import browser from "webextension-polyfill";
import { logME } from "../utils/core/helpers.js";
import { ErrorTypes } from "../error-management/ErrorTypes.js";

// Note: errorHandler is passed as an argument

export function handleExtensionLifecycle(
  message,
  sender,
  sendResponse,
  errorHandler,
) {
  const action = message.action || message.type;
  logME(`[Handler:Lifecycle] Handling action: ${action}`);
  try {
    logME(`[Handler:Lifecycle] Reloading extension due to action: ${action}`);
    browser.runtime.reload();
    // sendResponse might not be reached
  } catch (error) {
    logME(
      `[Handler:Lifecycle] Reload failed, attempting content script injection:`,
      error,
    );
    if (sender.tab?.id) {
      browser.scripting
        .executeScript({
          target: { tabId: sender.tab.id },
          files: ["content.bundle.js"],
        })
        .catch((injectionError) => {
          logME(
            "[Handler:Lifecycle] Content script injection fallback failed:",
            injectionError,
          );
          errorHandler.handle(injectionError, {
            type: ErrorTypes.INTEGRATION,
            context: "handler-lifecycle-injection-fallback",
          });
        });
    }
  }
  // Since reload interrupts, returning false is appropriate.
  // If only injection happened, might need true depending on if response is needed.
  return false;
}
