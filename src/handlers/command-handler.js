import { MessageContexts, MessagingCore } from '../messaging/core/MessagingCore.js';
import { logME } from "../utils/core/helpers.js";

const messenger = MessagingCore.getMessenger(MessageContexts.BACKGROUND);

async function handleCommand(tab, action, data = {}) {
  try {
    logME(`[CommandHandler] ${action} command triggered`);
    await messenger.sendMessageToTab(tab.id, { action, data: { ...data, source: 'keyboard_shortcut' } });
    logME(`[CommandHandler] ${action} command sent to content script`);
  } catch (error) {
    logME(`[CommandHandler] Error handling ${action} command:`, error);
    // Fallback logic for injection can be added here if needed
  }
}

async function handleBackgroundCommand(action, data = {}) {
    try {
        logME(`[CommandHandler] ${action} background command triggered`);
        await messenger.sendMessage({ action, data: { ...data, source: 'keyboard_shortcut' } });
        logME(`[CommandHandler] ${action} background command sent`);
    } catch (error) {
        logME(`[CommandHandler] Error handling ${action} background command:`, error);
    }
}

async function handleOptionsCommand() {
    try {
        logME("[CommandHandler] Options command triggered");
        await messenger.sendMessage({ action: 'openOptionsPage' });
    } catch (error) {
        logME("[CommandHandler] Error handling options command:", error);
    }
}

export async function handleCommandEvent(command, tab) {
  logME(`[CommandHandler] Command received: ${command}`, { tabId: tab?.id });

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
    logME(`[CommandHandler] Command ${command} handled successfully`);
  } else {
    logME(`[CommandHandler] Unknown command: ${command}`);
  }
}
