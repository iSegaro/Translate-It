import { MessageContexts, MessagingCore } from "../messaging/core/MessagingCore.js";
import { TranslationMode, getREPLACE_SPECIAL_SITESAsync, getCOPY_REPLACEAsync } from "../config.js";
import { detectPlatform, Platform } from "../utils/browser/platform.js";
import { getTranslationString } from "../utils/i18n/i18n.js";
import { logME } from "../utils/core/helpers.js";
import { ErrorTypes } from "../error-management/ErrorTypes.js";
import { isComplexEditor } from "../utils/framework/framework-compat/index.js";

const messenger = MessagingCore.getMessenger(MessageContexts.BACKGROUND);

function hasActiveElementTextSelection() {
  try {
    const activeElement = document.activeElement;
    if (!activeElement) return false;
    if (activeElement.isContentEditable) {
      const selection = window.getSelection();
      return selection && !selection.isCollapsed && selection.toString().trim().length > 0;
    } else if (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA") {
      return activeElement.selectionStart !== activeElement.selectionEnd;
    }
    return false;
  } catch (error) {
    return false;
  }
}

export async function translateFieldViaSmartHandler({ text, target, selectionRange = null, tabId }) {
  if (!text) return;

  const mode = selectionRange ? TranslationMode.SelectElement : TranslationMode.Field;
  const platform = detectPlatform(target);

  try {
    const response = await messenger.specialized.translation.translate(text, { translationMode: mode });
    const translated = response.translatedText?.trim();

    if (!translated) {
      throw new Error(ErrorTypes.TRANSLATION_NOT_FOUND);
    }

    let isReplaceMode = await determineReplaceMode(mode, platform);

    if (isReplaceMode) {
      const wasApplied = await applyTranslation(translated, selectionRange, platform, tabId);
      if (!wasApplied) {
        await copyToClipboard(translated);
      }
    } else {
      await copyToClipboard(translated);
    }
  } catch (err) {
    messenger.sendMessage({ action: 'handleError', data: { error: err, context: 'smartTranslate-handler' } });
  }
}

async function determineReplaceMode(mode, platform) {
  if (mode === TranslationMode.SelectElement) return true;

  const isCopy = await getCOPY_REPLACEAsync();
  if (isCopy === "replace") return true;
  if (isCopy === "copy") return false;

  if (platform !== Platform.Default) {
    return await getREPLACE_SPECIAL_SITESAsync();
  }

  const activeElement = document.activeElement;
  return !activeElement || !isComplexEditor(activeElement);
}

async function applyTranslation(translatedText, selectionRange, platform, tabId) {
  // Direct update strategies would be complex to manage here.
  // We will rely on messaging the content script.
  try {
    const res = await messenger.sendMessageToTab(tabId, {
      action: "applyTranslationToActiveElement",
      payload: { translatedText, copyOnly: false },
    });
    return res?.success === true;
  } catch (err) {
    return false;
  }
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    messenger.sendMessage({ action: 'showNotification', data: { message: await getTranslationString("STATUS_SMART_TRANSLATE_COPIED"), type: 'success' } });
  } catch (error) {
    messenger.sendMessage({ action: 'handleError', data: { error, context: 'smartTranslation-clipboard' } });
  }
}
