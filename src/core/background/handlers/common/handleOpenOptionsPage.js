// src/background/handlers/common/handleOpenOptionsPage.js

import browser from 'webextension-polyfill';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'handleOpenOptionsPage');


export async function handleOpenOptionsPage(message) {
  try {
    const anchor = message?.data?.anchor;
    
    if (anchor) {
      // Use tabs API to open with anchor
      const optionsUrl = browser.runtime.getURL(`html/options.html#${anchor}`);
      
      // Try to find existing options tab and update it, or create new one
      const tabs = await browser.tabs.query({ url: browser.runtime.getURL('html/options.html*') });
      
      if (tabs.length > 0) {
        await browser.tabs.update(tabs[0].id, { url: optionsUrl, active: true });
        // Also focus the window
        if (tabs[0].windowId) {
          await browser.windows.update(tabs[0].windowId, { focused: true });
        }
      } else {
        await browser.tabs.create({ url: optionsUrl });
      }
    } else {
      // Standard way to open options page
      await browser.runtime.openOptionsPage();
    }
    
    return { success: true };
  } catch (error) {
    logger.error('Failed to open options page:', error);
    return { success: false, error: error.message };
  }
}