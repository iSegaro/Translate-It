import { ref, onMounted, onUnmounted } from "vue";
import { generateMessageId } from "../utils/messaging/messageId.js";
import { isSingleWordOrShortPhrase } from "../utils/text/detection.js";
import { TranslationMode, getSettingsAsync } from "@/config.js";

import { useLanguages } from "@/composables/useLanguages.js";
import { AUTO_DETECT_VALUE } from "@/constants.js";
import { useMessaging } from '@/messaging/composables/useMessaging.js';
import browser from 'webextension-polyfill';
import { MessageActions } from '@/messaging/core/MessageActions.js';
import { createLogger } from '@/utils/core/logger.js';

const logger = createLogger('UI', 'useTranslationModes');

// Shared reactive state for select element mode (module-level so all callers share it)
const sharedIsSelectModeActive = ref(false);
let _selectStateListenerRegistered = false;
let _selectStateHandler = null;
let _currentTabId = null;
let _tabsActivatedHandler = null;
let _selectStateSubscriberCount = 0;

const _registerSelectStateListener = async () => {
  if (_selectStateListenerRegistered) return;
  _selectStateListenerRegistered = true;

  // Initialize from background via messaging
  try {
    const { sendMessage, MessageActions } = useMessaging('sidepanel');
    const response = await sendMessage(MessageActions.GET_SELECT_ELEMENT_STATE);
    if (response && response.success) {
      sharedIsSelectModeActive.value = !!response.active;
      _currentTabId = response.tabId;
    }
  } catch (err) {
    logger.warn('[useSelectElementTranslation] Failed to query background for select state:', err);
  }

  // Register runtime message listener for background broadcasts
  _selectStateHandler = async (message) => {
    try {
      if (message?.action === MessageActions.SELECT_ELEMENT_STATE_CHANGED) {
        const { tabId, active } = message.data || {};
        // Update only if the broadcast refers to our current tab
        try {
          if (!_currentTabId) {
            const tabs = await browser.tabs.query({ active: true, currentWindow: true });
            if (tabs && tabs.length) _currentTabId = tabs[0].id;
          }
        } catch {
          // ignore
        }

        if (_currentTabId && tabId && Number(tabId) === Number(_currentTabId)) {
          sharedIsSelectModeActive.value = !!active;
          logger.debug('selectElementState changed (broadcast for current tab):', tabId, active);
        }
      }
    } catch (e) {
      logger.warn('[useSelectElementTranslation] broadcast handler error:', e);
    }
  };

  try {
    browser.runtime.onMessage.addListener(_selectStateHandler);
  } catch (e) {
    logger.warn('[useSelectElementTranslation] Could not register runtime.onMessage listener:', e);
  }
};

const _unregisterSelectStateListener = () => {
  if (!_selectStateListenerRegistered) return;
  if (_selectStateHandler) {
    try {
      browser.runtime.onMessage.removeListener(_selectStateHandler);
    } catch {
      // ignore
    }
    _selectStateHandler = null;
  }
  _selectStateListenerRegistered = false;
};

export function useSidepanelTranslation() {
  const isLoading = ref(false);
  const result = ref(null);
  const error = ref(null);

  const translateText = async (text, sourceLang, targetLang) => {
    if (!text?.trim()) {
      error.value = "Text is required for translation";
      return null;
    }

    if (!targetLang || targetLang === AUTO_DETECT_VALUE) {
      error.value = "Target language is required";
      return null;
    }

    isLoading.value = true;
    error.value = null;
    result.value = null;

    try {
      const languages = useLanguages();
      const sourceLangCode =
        languages.getLanguagePromptName(sourceLang) || AUTO_DETECT_VALUE;
      const targetLangCode = languages.getLanguagePromptName(targetLang);

      logger.debug('Starting translation:', {
        text: text.substring(0, 50) + "...",
        sourceLangCode,
        targetLangCode,
      });

      // Get current provider from settings
      const settings = await getSettingsAsync();
      const currentProvider = settings.TRANSLATION_API || 'google';
      const messageId = generateMessageId('sidepanel-translate');
      
      // Determine translation mode (same logic as TranslationService.sidepanelTranslate)
      let mode = TranslationMode.Sidepanel_Translate;
      const isDictionaryCandidate = isSingleWordOrShortPhrase(text);
      if (settings.ENABLE_DICTIONARY && isDictionaryCandidate) {
        mode = TranslationMode.Dictionary_Translation;
      }
      
      const response = await browser.runtime.sendMessage({
        action: MessageActions.TRANSLATE,
        messageId: messageId,
        context: 'sidepanel',
        timestamp: Date.now(),
        data: {
          text: text,
          provider: currentProvider,
          sourceLanguage: sourceLangCode,
          targetLanguage: targetLangCode,
          mode: mode,
          options: {}
        }
      });

      if (response?.success) {
        result.value = response;
        logger.init('Translation successful');
        return response;
      } else {
        const errorMsg = response?.error || "Translation failed";
        error.value = errorMsg;
        logger.error('Translation failed:', errorMsg);
        return null;
      }
    } catch (err) {
      const errorMsg = err.message || "Translation error occurred";
      error.value = errorMsg;
      logger.error('Translation error:', err);
      return null;
    } finally {
      isLoading.value = false;
    }
  };

  const clearState = () => {
    result.value = null;
    error.value = null;
    isLoading.value = false;
  };

  return {
    isLoading,
    result,
    error,
    translateText,
    clearState,
  };
}

export function useSelectElementTranslation() {
  const isActivating = ref(false);
  const error = ref(null);

  // Use shared reactive ref so multiple components reflect same state
  const isSelectModeActive = sharedIsSelectModeActive;

  // Lifecycle-aware subscription: increment subscriber count on mount, decrement on unmount
  onMounted(() => {
    _selectStateSubscriberCount++;
    if (_selectStateSubscriberCount === 1) {
      _registerSelectStateListener();
    }
    // Listen to tab activation changes so we can refresh current tab state
    try {
      _tabsActivatedHandler = async (activeInfo) => {
        try {
          _currentTabId = activeInfo.tabId;
          const { selection } = useMessaging('sidepanel');
          const response = await selection.getSelectionState();
          if (response && response.success) {
            sharedIsSelectModeActive.value = !!response.active;
          }
        } catch {
          // ignore
        }
      };
      browser.tabs.onActivated.addListener(_tabsActivatedHandler);
    } catch {
      // ignore if tabs API not available
    }
  });

  // Also register a keydown listener in the sidepanel context so that
  // when the user presses ESC while the sidepanel has focus, we forward
  // the intent to deactivate select mode. This covers the case where
  // the sidepanel UI steals focus and ESC wouldn't reach content script.
  let _sidepanelEscHandler = null;
  onMounted(() => {
    _sidepanelEscHandler = (ev) => {
      if (!ev) return;
      if (ev.key === 'Escape' || ev.code === 'Escape') {
        try {
          // Always attempt to deactivate select mode when ESC pressed in sidepanel
          // This ensures content script is instructed even if shared state is out-of-sync.
          deactivateSelectMode().catch(() => {});
        } catch {}
      }
    };
    try { window.addEventListener('keydown', _sidepanelEscHandler, { capture: true }) } catch {}
  });

  onUnmounted(() => {
    try { window.removeEventListener('keydown', _sidepanelEscHandler, { capture: true }) } catch {}
  });

  onUnmounted(() => {
    _selectStateSubscriberCount = Math.max(0, _selectStateSubscriberCount - 1);
    if (_selectStateSubscriberCount === 0) {
      _unregisterSelectStateListener();
    }
    try {
      if (_tabsActivatedHandler) {
        browser.tabs.onActivated.removeListener(_tabsActivatedHandler);
        _tabsActivatedHandler = null;
      }
    } catch {
      // ignore
    }
  });

  const activateSelectMode = async () => {
    isActivating.value = true;
    error.value = null;

    try {
      logger.debug('Activating select element mode');
      const result = await browser.runtime.sendMessage({
        action: MessageActions.ACTIVATE_SELECT_ELEMENT_MODE,
        context: 'sidepanel',
        timestamp: Date.now(),
        data: { active: true }
      });
      
      // Check if activation actually succeeded
      if (result && result.success === false) {
        // Handle graceful failures (e.g., restricted pages).
        // The background script now provides a user-friendly message.
        const errorMsg = result.message || "Failed to activate select element mode";
        error.value = errorMsg;
        logger.error('Select mode activation failed:', { errorMsg, result });
        return false;
      }
      
      logger.debug('Select element mode activated');
      return true;
    } catch (err) {
      const errorMsg = err.message || "Failed to activate select element mode";
      error.value = errorMsg;
      logger.error('Error activating select mode:', err);
      return false;
    } finally {
      isActivating.value = false;
    }
  };

  const deactivateSelectMode = async () => {
    try {
      logger.debug('Deactivating select element mode');
      await browser.runtime.sendMessage({
        action: MessageActions.DEACTIVATE_SELECT_ELEMENT_MODE,
        context: 'sidepanel',
        timestamp: Date.now(),
        data: { active: false }
      });
      logger.debug('Select element mode deactivated');
      return true;
    } catch (err) {
      const errorMsg =
        err.message || "Failed to deactivate select element mode";
      error.value = errorMsg;
      logger.error('Error deactivating select mode:', err,
      );
      return false;
    }
  };

  const toggleSelectElement = async () => {
    if (isSelectModeActive.value) {
      const result = await deactivateSelectMode();
      // state will be updated via storage listener when content script actually deactivates
      return result;
    } else {
      const result = await activateSelectMode();
      // state will be updated via storage listener when content script actually activates
      return result;
    }
  };

  return {
    isActivating,
    isSelectModeActive,
    error,
    activateSelectMode,
    deactivateSelectMode,
    toggleSelectElement,
  };
}

export function useSidepanelActions() {
  const isProcessing = ref(false);
  const error = ref(null);

  const revertTranslation = async () => {
    isProcessing.value = true;
    error.value = null;

    try {
      logger.debug('Reverting translation');
      await browser.runtime.sendMessage({
        action: MessageActions.REVERT_SELECT_ELEMENT_MODE,
        context: 'sidepanel',
        timestamp: Date.now()
      });
      logger.init('Translation reverted successfully');
      return true;
    } catch (err) {
      const errorMsg = err.message || "Failed to revert translation";
      error.value = errorMsg;
      logger.error('Error reverting translation:', err);
      return false;
    } finally {
      isProcessing.value = false;
    }
  };

  const stopTTS = async () => {
    try {
      logger.debug('Stopping TTS');
      await browser.runtime.sendMessage({
        action: MessageActions.TTS_STOP,
        context: 'sidepanel',
        timestamp: Date.now()
      });
    } catch (err) {
      logger.error('TTS stop failed (might not be active):', err,
      );
    }
  };

  return {
    isProcessing,
    error,
    revertTranslation,
    stopTTS,
  };
}

export function useFieldTranslation() {
  return {};
}

export function useSelectionTranslation() {
  return {};
}