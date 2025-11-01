import browser from "webextension-polyfill";
import { MessagingContexts, MessageFormat } from '@/shared/messaging/core/MessagingCore.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { sendMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'command-handler');


async function handleCommand(tab, action, data = {}) {
  try {
    // Validate tab before proceeding
    if (!tab || !tab.id) {
      logger.warn(`[CommandHandler] Invalid tab provided for command ${action}:`, tab);
      return false;
    }

    // Check if tab URL is accessible (exclude special pages)
    if (tab.url && (tab.url.startsWith('chrome://') ||
                    tab.url.startsWith('chrome-extension://') ||
                    tab.url.startsWith('moz-extension://') ||
                    tab.url.startsWith('about:') ||
                    tab.url.startsWith('edge://'))) {
      logger.debug(`[CommandHandler] Command ${action} ignored on restricted page:`, tab.url);
      return false;
    }

    logger.debug(action, 'command triggered', { tabId: tab.id, url: tab.url });

    // Use UnifiedMessaging for all commands
    const message = MessageFormat.create(
      action,
      { ...data, source: 'keyboard_shortcut' },
      MessagingContexts.BACKGROUND
    );

    await browser.tabs.sendMessage(tab.id, message);
    logger.debug(`[CommandHandler] Command ${action} sent to content script`);
    return true;
  } catch (error) {
    logger.error(`[CommandHandler] Error handling command ${action}:`, error);

    // Provide specific error context
    if (error.message && error.message.includes('Receiving end does not exist')) {
      logger.warn(`[CommandHandler] Content script not available in tab ${tab?.id} for command ${action}`);
    } else if (error.message && error.message.includes('Could not establish connection')) {
      logger.warn(`[CommandHandler] Cannot connect to tab ${tab?.id} for command ${action}`);
    }

    return false;
  }
}

async function handleBackgroundCommand(action, data = {}) {
  try {
    logger.debug(action, 'background command triggered');
        await sendMessage({ action, data: { ...data, source: 'keyboard_shortcut' }, context: 'background' });
  logger.debug(action, 'background command sent');
  } catch (error) {
    logger.error('Error handling background command', action, error);
    }
}

async function handleOptionsCommand() {
  try {
    logger.debug('Options command triggered');
        await sendMessage({ action: 'openOptionsPage', context: 'background' });
  } catch (error) {
    logger.error('Error handling options command:', error);
    }
}

export async function handleCommandEvent(command, tab) {
  const startTime = Date.now();
  logger.info(`[CommandHandler] Processing command: ${command}`, {
    tabId: tab?.id,
    url: tab?.url,
    timestamp: startTime
  });

  try {
    // Validate command input
    if (!command || typeof command !== 'string') {
      logger.error(`[CommandHandler] Invalid command received:`, command);
      return false;
    }

    // Enhanced command map with better logging
    const commandMap = {
      // Translation commands
      translate: () => handleCommand(tab, 'KEYBOARD_SHORTCUT_TRANSLATE'),
      quick_translate: () => handleCommand(tab, 'KEYBOARD_SHORTCUT_TRANSLATE'),

      // Element selection commands (Chrome shortcut support)
      'SELECT-ELEMENT-COMMAND': () => handleCommand(tab, MessageActions.ACTIVATE_SELECT_ELEMENT_MODE),
      select_element: () => handleCommand(tab, MessageActions.ACTIVATE_SELECT_ELEMENT_MODE),
      activate_select_element: () => handleCommand(tab, MessageActions.ACTIVATE_SELECT_ELEMENT_MODE),

      // UI commands
      toggle_popup: () => handleBackgroundCommand('togglePopup', { tabId: tab.id }),
      open_popup: () => handleBackgroundCommand('togglePopup', { tabId: tab.id }),

      // TTS commands
      speak: () => handleCommand(tab, 'KEYBOARD_SHORTCUT_TTS'),
      tts: () => handleCommand(tab, 'KEYBOARD_SHORTCUT_TTS'),

      // Screen capture commands
      capture: () => handleBackgroundCommand('startAreaCapture', { tabId: tab.id }),
      screenshot: () => handleBackgroundCommand('startAreaCapture', { tabId: tab.id }),

      // Options commands
      options: handleOptionsCommand,
      open_options: handleOptionsCommand,
    };

    const handler = commandMap[command];
    if (handler) {
      logger.debug(`[CommandHandler] Executing handler for command: ${command}`);

      try {
        const result = await handler();
        const duration = Date.now() - startTime;

        if (result === false) {
          logger.warn(`[CommandHandler] Command ${command} handler returned false (likely validation failure)`);
        } else {
          logger.info(`[CommandHandler] Command handled successfully: ${command}`, {
            duration: `${duration}ms`,
            tabId: tab?.id
          });
        }
        return result;
      } catch (handlerError) {
        logger.error(`[CommandHandler] Handler execution failed for command ${command}:`, handlerError);
        return false;
      }
    } else {
      logger.warn(`[CommandHandler] Unknown command received: ${command}`, {
        availableCommands: Object.keys(commandMap)
      });
      return false;
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`[CommandHandler] Critical error processing command ${command}:`, error, {
      duration: `${duration}ms`,
      tabId: tab?.id,
      url: tab?.url
    });
    return false;
  }
}
