// src/background/handlers/common/handleOpenURL.js

import browser from 'webextension-polyfill';

// Lazy logger to avoid initialization order issues
let _logger;
const getLogger = () => {
  if (!_logger) {
    _logger = createLogger(LOG_COMPONENTS.BACKGROUND, 'handleOpenURL');
  }
  return _logger;
};

import { createLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';


export async function handleOpenURL(message) {
  try {
    const anchor = message.data?.anchor;
    const optionsUrl = browser.runtime.getURL(
      `html/options.html${anchor ? `#${anchor}` : ""}`
    );
    browser.tabs.create({ url: optionsUrl });
    return { success: true };
  } catch (error) {
    getLogger().error('Failed to open URL:', error);
    return { success: false, error: error.message };
  }
}