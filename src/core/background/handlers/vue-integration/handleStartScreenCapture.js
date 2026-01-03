// Handler for starting screen capture from Vue apps
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { ErrorHandler } from "@/shared/error-management/ErrorHandler.js";
import browser from "webextension-polyfill";
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import ExtensionContextManager from '@/core/extensionContext.js';

const errorHandler = new ErrorHandler();

export async function handleStartScreenCapture(message) {
  try {
    // Get active tab
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab) {
      throw new Error("No active tab found");
    }

    // Send message to content script to start capture UI
    try {
      await browser.tabs.sendMessage(tab.id, {
        action: MessageActions.START_SCREEN_CAPTURE,
        source: "background",
      });
    } catch (sendError) {
      // Use centralized context error detection
      if (ExtensionContextManager.isContextError(sendError)) {
        ExtensionContextManager.handleContextError(sendError, 'screen-capture-start');
        throw new Error('Content script not available on this tab');
      }
      throw sendError;
    }

    return {
      success: true,
      data: {
        success: true,
        message: "Screen capture started",
      },
    };
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.SCREEN_CAPTURE,
      context: "handleStartScreenCapture",
      messageData: message.data,
    });
    throw error;
  }
}