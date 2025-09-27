export async function handleTranslateLazy(message, sender, sendResponse) {
    const { handleTranslate } = await import('@/features/translation/handlers/handleTranslate.js');
    return handleTranslate(message, sender, sendResponse);
}

export async function handleTranslateTextLazy(message, sender, sendResponse) {
    const { handleTranslateText } = await import('@/features/translation/handlers/handleTranslateText.js');
    return handleTranslateText(message, sender, sendResponse);
}

export async function handleTranslationResultLazy(message, sender, sendResponse) {
    const { handleTranslationResult } = await import('../translation/handleTranslationResult.js');
    return handleTranslationResult(message, sender, sendResponse);
}

export async function handleRevertTranslationLazy(message, sender, sendResponse) {
    const { handleRevertTranslation } = await import('@/features/translation/handlers/handleRevertTranslation.js');
    return handleRevertTranslation(message, sender, sendResponse);
}

export async function handleCancelTranslationLazy(message, sender, sendResponse) {
    const { handleCancelTranslation } = await import('@/features/translation/handlers/handleCancelTranslation.js');
    return handleCancelTranslation(message, sender, sendResponse);
}
