// Handler for testing provider connection from Vue apps
import { ErrorHandler } from "../../../error-management/ErrorHandler.js";

export async function handleTestProviderConnection(message) {
  const { provider, config } = message.data;

  try {
    const backgroundService = globalThis.backgroundService;
    if (!backgroundService || !backgroundService.translationEngine) {
      throw new Error(
        "Background service or translation engine not initialized."
      );
    }

    const testResult = await backgroundService.translationEngine.testProvider(
      provider,
      config
    );

    return {
      success: true,
      data: {
        success: true,
        message: "Connection successful",
        testResult: testResult,
      },
    };
  } catch (error) {
    return {
      success: true,
      data: {
        success: false,
        message: error.message || "Connection failed",
      },
    };
  }
}