/**
 * Command Handler - Unified handler for commands.onCommand events
 * Handles keyboard shortcuts and extension commands
 */

import browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";

/**
 * Handle translation shortcut command
 */
async function handleTranslateCommand(tab) {
  try {
    logME("[CommandHandler] Translate command triggered");

    // Send message to content script to handle translation
    await browser.tabs.sendMessage(tab.id, {
      action: "KEYBOARD_SHORTCUT_TRANSLATE",
      shortcut: "translate",
      timestamp: Date.now(),
    });

    logME("[CommandHandler] Translate command sent to content script");
  } catch (error) {
    logME("[CommandHandler] Error handling translate command:", error);

    // If content script not ready, try to inject it
    try {
      await browser.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["src/content-scripts/index.js"],
      });

      // Retry the command
      setTimeout(async () => {
        try {
          await browser.tabs.sendMessage(tab.id, {
            action: "KEYBOARD_SHORTCUT_TRANSLATE",
            shortcut: "translate",
            timestamp: Date.now(),
          });
        } catch (retryError) {
          logME("[CommandHandler] Retry failed:", retryError);
        }
      }, 500);
    } catch (injectError) {
      logME("[CommandHandler] Failed to inject content script:", injectError);
    }
  }
}

/**
 * Handle select element mode command
 */
async function handleSelectElementCommand(tab) {
  try {
    logME("[CommandHandler] Select element command triggered");

    // Send message to content script to activate element selection
    await browser.tabs.sendMessage(tab.id, {
      action: "ACTIVATE_SELECT_ELEMENT_MODE",
      source: "keyboard_shortcut",
      timestamp: Date.now(),
    });

    logME("[CommandHandler] Select element command sent to content script");
  } catch (error) {
    logME("[CommandHandler] Error handling select element command:", error);
  }
}

/**
 * Handle popup toggle command
 */
async function handlePopupToggleCommand(tab) {
  try {
    logME("[CommandHandler] Popup toggle command triggered");

    // Get current popup state and toggle
    const windows = await browser.windows.getAll({ populate: true });
    const currentWindow = windows.find((w) => w.focused);

    if (currentWindow) {
      // Try to open popup or sidepanel
      try {
        await browser.action.openPopup();
        logME("[CommandHandler] Popup opened via command");
      } catch (popupError) {
        // Fallback to sidepanel if available
        try {
          await browser.sidePanel.open({ windowId: currentWindow.id });
          logME("[CommandHandler] Sidepanel opened via command");
        } catch (sidepanelError) {
          logME("[CommandHandler] Failed to open popup or sidepanel:", {
            popupError,
            sidepanelError,
          });
        }
      }
    }
  } catch (error) {
    logME("[CommandHandler] Error handling popup toggle command:", error);
  }
}

/**
 * Handle TTS (Text-to-Speech) command
 */
async function handleTTSCommand(tab) {
  try {
    logME("[CommandHandler] TTS command triggered");

    // Send message to content script to handle TTS
    await browser.tabs.sendMessage(tab.id, {
      action: "KEYBOARD_SHORTCUT_TTS",
      shortcut: "speak",
      timestamp: Date.now(),
    });

    logME("[CommandHandler] TTS command sent to content script");
  } catch (error) {
    logME("[CommandHandler] Error handling TTS command:", error);
  }
}

/**
 * Handle screenshot/capture command
 */
async function handleCaptureCommand(tab) {
  try {
    logME("[CommandHandler] Capture command triggered");

    // Send message to background to start area capture
    await browser.runtime.sendMessage({
      action: "startAreaCapture",
      source: "keyboard_shortcut",
      tabId: tab.id,
      timestamp: Date.now(),
    });

    logME("[CommandHandler] Capture command processed");
  } catch (error) {
    logME("[CommandHandler] Error handling capture command:", error);
  }
}

/**
 * Handle options page command
 */
async function handleOptionsCommand() {
  try {
    logME("[CommandHandler] Options command triggered");

    const optionsUrl = browser.runtime.getURL("options.html");

    // Check if options page is already open
    const tabs = await browser.tabs.query({ url: optionsUrl });

    if (tabs.length > 0) {
      // Focus existing options tab
      await browser.tabs.update(tabs[0].id, { active: true });
      await browser.windows.update(tabs[0].windowId, { focused: true });
      logME("[CommandHandler] Focused existing options tab");
    } else {
      // Create new options tab
      await browser.tabs.create({ url: optionsUrl });
      logME("[CommandHandler] Created new options tab");
    }
  } catch (error) {
    logME("[CommandHandler] Error handling options command:", error);
  }
}

/**
 * Main command event handler
 */
export async function handleCommandEvent(command, tab) {
  logME(`[CommandHandler] Command received: ${command}`, {
    tabId: tab?.id,
    url: tab?.url,
  });

  try {
    switch (command) {
      case "translate":
      case "quick_translate":
        await handleTranslateCommand(tab);
        break;

      case "select_element":
      case "activate_select_element":
        await handleSelectElementCommand(tab);
        break;

      case "toggle_popup":
      case "open_popup":
        await handlePopupToggleCommand(tab);
        break;

      case "speak":
      case "tts":
        await handleTTSCommand(tab);
        break;

      case "capture":
      case "screenshot":
        await handleCaptureCommand(tab);
        break;

      case "options":
      case "open_options":
        await handleOptionsCommand();
        break;

      default:
        logME(`[CommandHandler] Unknown command: ${command}`);
        break;
    }

    logME(`[CommandHandler] Command ${command} handled successfully`);
  } catch (error) {
    logME(`[CommandHandler] Error handling command ${command}:`, error);
    throw error;
  }
}
