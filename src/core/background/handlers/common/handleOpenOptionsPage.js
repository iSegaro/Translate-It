// src/background/handlers/common/handleOpenOptionsPage.js

import browser from 'webextension-polyfill';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'handleOpenOptionsPage');


export async function handleOpenOptionsPage() {
  try {
    browser.runtime.openOptionsPage();
    return { success: true };
  } catch (error) {
  logger.error('Failed to open options page:', error);
    return { success: false, error: error.message };
  }
}