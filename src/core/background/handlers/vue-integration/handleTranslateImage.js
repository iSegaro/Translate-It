// Handler for image translation from Vue apps
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { ErrorHandler } from "@/shared/error-management/ErrorHandler.js";

const errorHandler = new ErrorHandler();

export async function handleTranslateImage(message) {
  const {
    imageData,
    from = "auto",
    to = "en", 
    provider = "gemini",
    mode = "simple",
  } = message.data;

  if (!imageData) {
    throw new Error("Image data cannot be empty");
  }

  try {
    const backgroundService = globalThis.backgroundService;
    if (!backgroundService || !backgroundService.translationEngine) {
      throw new Error(
        "Background service or translation engine not initialized."
      );
    }

    const translatedText =
      await backgroundService.translationEngine.translateImage(
        imageData,
        from,
        to,
        provider,
        mode
      );

    return {
      success: true,
      data: {
        text: translatedText,
        sourceText: "[Image]",
        fromLanguage: from,
        toLanguage: to,
        provider: provider,
        mode: mode,
        timestamp: Date.now(),
        isImageTranslation: true,
      },
    };
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.IMAGE_TRANSLATION,
      context: "handleTranslateImage",
      messageData: message.data,
    });
    throw new Error(`Image translation failed: ${error.message}`);
  }
}