import browser from "webextension-polyfill";
import { MessagingContexts, MessageFormat } from '../messaging/core/MessagingCore.js';
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
import { simpleMessageHandler } from '../core/SimpleMessageHandler.js';
const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'command-handler');


async function handleCommand(tab, action, data = {}) {
  try {
    logger.debug(action, 'command triggered');
    
    const message = MessageFormat.create(
      action,
      { ...data, source: 'keyboard_shortcut' },
      MessagingContexts.BACKGROUND
    );
    
    await browser.tabs.sendMessage(tab.id, message);
  logger.debug(action, 'command sent to content script');
  } catch (error) {
  logger.error('Error handling command', action, error);
    // Fallback logic for injection can be added here if needed
  }
}

async function handleBackgroundCommand(action, data = {}) {
  try {
    logger.debug(action, 'background command triggered');
        await simpleMessageHandler.sendMessage({ action, data: { ...data, source: 'keyboard_shortcut' } });
  logger.debug(action, 'background command sent');
  } catch (error) {
    logger.error('Error handling background command', action, error);
    }
}

async function handleOptionsCommand() {
  try {
    logger.debug('Options command triggered');
        await simpleMessageHandler.sendMessage({ action: 'openOptionsPage' });
  } catch (error) {
    logger.error('Error handling options command:', error);
    }
}

export async function handleCommandEvent(command, tab) {
  logger.debug('Command received:', command, { tabId: tab?.id });

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
  logger.init('Command handled successfully', command);
  } else {
  logger.debug('Unknown command:', command);
  }
}
