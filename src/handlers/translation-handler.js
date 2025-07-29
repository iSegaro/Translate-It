/**
 * Translation Handler - Simple translation request processing
 * Based on OLD implementation pattern for reliability
 */

export async function handleTranslationRequest(payload, sender) {
  console.log("[TranslationHandler] Processing translation request:", payload);

  try {
    // Import translation engine dynamically
    const { TranslationEngine } = await import(
      "../background/translation-engine.js"
    );

    // Get the translation engine instance
    const engine = new TranslationEngine();

    // Format the request message for the engine
    const request = {
      action: "TRANSLATE",
      context: sender.context || "unknown",
      data: {
        text: payload.text,
        sourceLanguage: payload.sourceLanguage || "auto",
        targetLanguage: payload.targetLanguage,
        provider: payload.provider || "google",
        mode: payload.mode || "simple",
        ...payload.options,
      },
    };

    // Use the engine's handleTranslateMessage method
    const result = await engine.handleTranslateMessage(request, sender);

    console.log("[TranslationHandler] Translation completed:", result);

    // The engine already returns formatted result with success/error
    return result;
  } catch (error) {
    console.error("[TranslationHandler] Translation error:", error);

    return {
      success: false,
      error: {
        message: error.message,
        type: error.constructor.name,
        code: error.code || "TRANSLATION_ERROR",
      },
    };
  }
}
