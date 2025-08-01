// Handler for getting extension info from Vue apps
import { ErrorTypes } from "../../../error-management/ErrorTypes.js";
import { ErrorHandler } from "../../../error-management/ErrorHandler.js";
import browser from "webextension-polyfill";

const errorHandler = new ErrorHandler();

export async function handleGetExtensionInfo() {
  try {
    const manifest = browser.runtime.getManifest();

    return {
      success: true,
      data: {
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        permissions: manifest.permissions || [],
        id: browser.runtime.id,
      },
    };
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.EXTENSION_INFO,
      context: "handleGetExtensionInfo",
    });
    return {
      success: false,
      error: error.message,
    };
  }
}