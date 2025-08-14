// src/background/handlers/common/handleOpenOptionsPage.js

import browser from 'webextension-polyfill';

// Lazy logger to avoid initialization order issues
let _logger;
const getLogger = () => {
  if (!_logger) {
    _logger = createLogger(LOG_COMPONENTS.BACKGROUND, 'handleOpenOptionsPage');
  }
  return _logger;
};

import { createLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';


export async function handleOpenOptionsPage() {
  try {
    browser.runtime.openOptionsPage();
    return { success: true };
  } catch (error) {
    getLogger().error('Failed to open options page:', error);
    return { success: false, error: error.message };
  }
}