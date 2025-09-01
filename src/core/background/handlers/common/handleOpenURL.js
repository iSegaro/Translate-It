// src/background/handlers/common/handleOpenURL.js

import browser from 'webextension-polyfill';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'handleOpenURL');


export async function handleOpenURL(message) {
  try {
    const anchor = message.data?.anchor;
    const optionsUrl = browser.runtime.getURL(
      `html/options.html${anchor ? `#${anchor}` : ""}`
    );
    browser.tabs.create({ url: optionsUrl });
    return { success: true };
  } catch (error) {
  logger.error('Failed to open URL:', error);
    return { success: false, error: error.message };
  }
}