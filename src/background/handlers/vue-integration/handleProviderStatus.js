// Handler for provider status from Vue apps
import { ErrorHandler } from "../../../error-management/ErrorHandler.js";

export async function handleProviderStatus(message) {
  const { provider } = message.data;

  try {
    const backgroundService = globalThis.backgroundService;
    if (!backgroundService || !backgroundService.translationEngine) {
      throw new Error(
        "Background service or translation engine not initialized."
      );
    }

    const status =
      await backgroundService.translationEngine.getProviderStatus(provider);
    
    return {
      success: true,
      data: status,
    };
  } catch (error) {
    return {
      success: false,
      data: {
        status: "error",
        message: error.message,
      },
    };
  }
}