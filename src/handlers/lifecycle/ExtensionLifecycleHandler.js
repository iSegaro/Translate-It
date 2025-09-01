// src/handlers/extensionLifecycleHandler.js
import browser from "webextension-polyfill";
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'ExtensionLifecycle');

import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";

// removed legacy createLogger import


// Note: errorHandler is passed as an argument

export function handleExtensionLifecycle(
  message,
  sender,
  sendResponse,
  errorHandler,
) {
  const action = message.action || message.type;
  logger.debug('Handling action:', action);
  try {
    logger.debug('Reloading extension due to action:', action);
    browser.runtime.reload();
    // sendResponse might not be reached
  } catch (error) {
    logger.error('Reload failed, attempting content script injection:', error,
    );
    if (sender.tab?.id) {
      browser.scripting
        .executeScript({
          target: { tabId: sender.tab.id },
          files: ["content.bundle.js"],
        })
        .catch((injectionError) => {
          logger.error('Content script injection fallback failed:', injectionError,
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
