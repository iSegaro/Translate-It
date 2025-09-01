// Handler for getting provider config from Vue apps
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { ErrorHandler } from "@/shared/error-management/ErrorHandler.js";
import { storageManager } from "@/shared/storage/core/StorageCore.js";

const errorHandler = new ErrorHandler();

export async function handleGetProviderConfig(message) {
  const { provider } = message.data;

  try {
    const key = `provider_config_${provider}`;
    const result = await storageManager.get([key]);
    const config = result[key] || null;
    
    return {
      success: true,
      data: {
        config: config || {},
      },
    };
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.PROVIDER_CONFIG,
      context: "handleGetProviderConfig",
      messageData: message.data,
    });
    return {
      success: false,
      error: error.message,
    };
  }
}