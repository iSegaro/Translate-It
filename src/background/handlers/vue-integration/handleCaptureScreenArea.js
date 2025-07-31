// Handler for capturing screen area from Vue apps
import { ErrorTypes } from "../../../error-management/ErrorTypes.js";
import { ErrorHandler } from "../../../error-management/ErrorHandler.js";
import browser from "webextension-polyfill";

const errorHandler = new ErrorHandler();

export async function handleCaptureScreenArea(message, sender) {
  const { coordinates } = message.data;

  try {
    // Capture visible tab
    const imageData = await browser.tabs.captureVisibleTab({
      format: "png",
    });

    // If coordinates are provided, we would crop the image here
    // For now, return the full screenshot
    return {
      success: true,
      data: {
        imageData,
        coordinates,
        timestamp: Date.now(),
      },
    };
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.SCREEN_CAPTURE,
      context: "handleCaptureScreenArea",
      messageData: message.data,
    });
    throw error;
  }
}