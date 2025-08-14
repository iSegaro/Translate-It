// src/background/handlers/lifecycle/handleExtensionLifecycle.js
import browser from 'webextension-polyfill';

// Lazy logger to avoid initialization order issues
let _logger;
const getLogger = () => {
  if (!_logger) {
    _logger = createLogger(LOG_COMPONENTS.BACKGROUND, 'handleExtensionLifecycle');
  }
  return _logger;
};

import { ErrorTypes } from "../../../error-management/ErrorTypes.js"; // Changed from services

import { createLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';


// Note: errorHandler is passed as an argument

export async function handleExtensionLifecycle(
  message,
  sender,
  sendResponse,
  errorHandler
) {
  const action = message.action || message.type;
  getLogger().debug('Handling action: ${action}');
  try {
    getLogger().debug('Reloading extension due to action: ${action}');
    browser.runtime.reload();
    // sendResponse might not be reached
  } catch (error) {
    getLogger().error('Reload failed, attempting content script injection:', error
    );
    if (sender.tab?.id) {
      browser.scripting
        .executeScript({
          target: { tabId: sender.tab.id },
          files: ["content.bundle.js"],
        })
        .catch((injectionError) => {
          getLogger().error('Content script injection fallback failed:', injectionError
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
