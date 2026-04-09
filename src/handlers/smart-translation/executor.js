/**
 * Execution logic for applying translations
 */
import { TranslationMode, getREPLACE_SPECIAL_SITESAsync, getCOPY_REPLACEAsync } from "@/shared/config/config.js";
import { OS_PLATFORMS as Platform } from "@/utils/browser/compatibility.js";
import { isComplexEditor } from "@/features/text-field-interaction/utils/framework/framework-compat/index.js";
import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { resourceTracker } from './state.js';
import { getPendingTranslationData } from './dataStore.js';
import { isEditableElement } from './elementHelper.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'SmartTranslationExecutor');

/**
 * Determine if we should replace text or copy to clipboard
 */
export async function determineReplaceMode(mode, platform) {
  logger.debug('Determining replace mode', { mode, platform });

  if (mode === TranslationMode.Select_Element || mode === TranslationMode.LEGACY_SELECT_ELEMENT_UNDERSCORE) {
    return true;
  }

  if (platform !== Platform.Default) {
    const replaceSpecial = await getREPLACE_SPECIAL_SITESAsync();
    if (replaceSpecial) return true;
  }

  if (mode === TranslationMode.Field || mode === TranslationMode.LEGACY_FIELD) {
    const isCopy = await getCOPY_REPLACEAsync();
    return isCopy === "replace";
  }

  const isCopy = await getCOPY_REPLACEAsync();
  if (isCopy === "replace") return true;
  if (isCopy === "copy") return false;

  const activeElement = document.activeElement;
  const isComplex = isComplexEditor(activeElement);
  return !activeElement || !isComplex;
}

/**
 * Apply translation directly to element using a strategy
 */
export async function applyTranslation(translatedText, selectionRange, platform, tabId, targetElement = null, toastId = null) {
  logger.debug('Applying translation directly to element', { platform, tabId });
  
  try {
    const pendingData = getPendingTranslationData(document.activeElement, toastId);
    const target = targetElement || pendingData?.target || document.activeElement;
    
    if (!target || !isEditableElement(target) || !target.isConnected) {
      logger.warn('No valid target element connected to DOM');
      return false;
    }
    
    if (target.focus && typeof target.focus === 'function') {
      target.focus();
      await new Promise(resolve => resourceTracker.trackTimeout(resolve, 10));
    }
    
    let strategyName;
    switch (platform) {
      case Platform.Twitter: strategyName = 'TwitterStrategy'; break;
      case Platform.WhatsApp: strategyName = 'WhatsAppStrategy'; break;
      case Platform.Instagram: strategyName = 'InstagramStrategy'; break;
      case Platform.Telegram: strategyName = 'TelegramStrategy'; break;
      case Platform.Medium: strategyName = 'MediumStrategy'; break;
      case Platform.ChatGPT: strategyName = 'ChatGPTStrategy'; break;
      case Platform.Youtube: strategyName = 'YoutubeStrategy'; break;
      case Platform.Discord: strategyName = 'DiscordStrategy'; break;
      default: strategyName = 'DefaultStrategy';
    }

    logger.debug('Translation strategy selected', { strategy: strategyName, platform });
    
    // eslint-disable-next-line noUnsanitized/method
    const strategyModule = await import(`@/features/text-field-interaction/strategies/${strategyName}.js`);
    const strategy = new strategyModule.default();
    
    const success = await strategy.updateElement(target, translatedText);
    logger.debug('Translation strategy completed', { success });
    
    return success;
  } catch (err) {
    logger.error('Error in applyTranslation', err);
    return false;
  }
}
