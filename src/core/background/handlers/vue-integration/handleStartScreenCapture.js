// Handler for starting screen capture from Vue apps
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { ErrorHandler } from "@/shared/error-management/ErrorHandler.js";
import browser from "webextension-polyfill";
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";

const errorHandler = new ErrorHandler();

export async function handleStartScreenCapture(message, sender, sendResponse) {
  try {
    // Get active tab
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab) {
      throw new Error("No active tab found");
    }

    // Directly send start command to content script
    await browser.tabs.sendMessage(tab.id, {
      action: MessageActions.START_SCREEN_CAPTURE,
      source: "background",
      data: message.data || {}
    });

    const response = {
      success: true,
      data: {
        success: true,
        message: "Screen capture started",
      },
    };

    if (sendResponse && typeof sendResponse === 'function') {
      sendResponse(response);
    }

    return response;
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.SCREEN_CAPTURE,
      context: "handleStartScreenCapture",
      messageData: message.data,
    });
    const errorResponse = { success: false, error: error.message };
    if (sendResponse && typeof sendResponse === 'function') {
      sendResponse(errorResponse);
    }
    return errorResponse;
  }
}