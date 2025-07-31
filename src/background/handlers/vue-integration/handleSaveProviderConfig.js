// Handler for saving provider config from Vue apps
import { ErrorTypes } from "../../../error-management/ErrorTypes.js";
import { ErrorHandler } from "../../../error-management/ErrorHandler.js";
import browser from "webextension-polyfill";

const errorHandler = new ErrorHandler();

export async function handleSaveProviderConfig(message, sender) {
  const { provider, apiKey, customUrl, model } = message.data;

  try {
    const config = {
      apiKey,
      customUrl,
      model,
      timestamp: Date.now(),
    };

    // Store configuration securely
    const key = `provider_config_${provider}`;
    await browser.storage.local.set({ [key]: config });

    return {
      success: true,
      data: {
        success: true,
        message: "Configuration saved",
      },
    };
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.PROVIDER_CONFIG,
      context: "handleSaveProviderConfig",
      messageData: message.data,
    });
    return {
      success: false,
      error: error.message,
    };
  }
}