import browser from "webextension-polyfill";
import { MessagingContexts, MessageFormat, MessageActions } from '../messaging/core/MessagingCore.js';

// Lazy logger to avoid initialization order issues
let _logger;
const getLogger = () => {
  if (!_logger) {
    _logger = createLogger(LOG_COMPONENTS.BACKGROUND, 'command-handler');
  }
  return _logger;
};

import { createLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';


async function handleCommand(tab, action, data = {}) {
  try {
    getLogger().debug('${action} command triggered');
    
    const message = MessageFormat.create(
      action,
      { ...data, source: 'keyboard_shortcut' },
      MessagingContexts.BACKGROUND
    );
    
    await browser.tabs.sendMessage(tab.id, message);
    getLogger().debug('${action} command sent to content script');
  } catch (error) {
    getLogger().error('Error handling ${action} command:', error);
    // Fallback logic for injection can be added here if needed
  }
}

async function handleBackgroundCommand(action, data = {}) {
    try {
        getLogger().debug('${action} background command triggered');
        await messenger.sendMessage({ action, data: { ...data, source: 'keyboard_shortcut' } });
        getLogger().debug('${action} background command sent');
    } catch (error) {
        getLogger().error('Error handling ${action} background command:', error);
    }
}

async function handleOptionsCommand() {
    try {
        getLogger().debug('Options command triggered');
        await messenger.sendMessage({ action: 'openOptionsPage' });
    } catch (error) {
        getLogger().error('Error handling options command:', error);
    }
}

export async function handleCommandEvent(command, tab) {
  getLogger().debug('Command received: ${command}', { tabId: tab?.id });

  const commandMap = {
    translate: () => handleCommand(tab, 'KEYBOARD_SHORTCUT_TRANSLATE'),
    quick_translate: () => handleCommand(tab, 'KEYBOARD_SHORTCUT_TRANSLATE'),
    select_element: () => handleCommand(tab, 'ACTIVATE_SELECT_ELEMENT_MODE'),
    activate_select_element: () => handleCommand(tab, 'ACTIVATE_SELECT_ELEMENT_MODE'),
    toggle_popup: () => handleBackgroundCommand('togglePopup', { tabId: tab.id }),
    open_popup: () => handleBackgroundCommand('togglePopup', { tabId: tab.id }),
    speak: () => handleCommand(tab, 'KEYBOARD_SHORTCUT_TTS'),
    tts: () => handleCommand(tab, 'KEYBOARD_SHORTCUT_TTS'),
    capture: () => handleBackgroundCommand('startAreaCapture', { tabId: tab.id }),
    screenshot: () => handleBackgroundCommand('startAreaCapture', { tabId: tab.id }),
    options: handleOptionsCommand,
    open_options: handleOptionsCommand,
  };

  const handler = commandMap[command];
  if (handler) {
    await handler();
    getLogger().init('Command ${command} handled successfully');
  } else {
    getLogger().debug('Unknown command: ${command}');
  }
}
