<template>
  <div
    class="ti-m-input-view"
    :class="{ 'is-dark': settingsStore.isDarkTheme }"
  >
    <!-- Header -->
    <div class="ti-m-view-header">
      <button
        class="ti-m-back-btn"
        @click="goBack"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 6 4"
          fill="none"
        >
          <path
            d="M1 1L3 3L5 1"
            stroke="currentColor"
            stroke-width="0.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <span
        class="ti-m-header-title"
        @click="goBack"
      >{{ t('mobile_input_header_title') || 'Manual Input' }}</span>
    </div>

    <!-- Input Card -->
    <div class="ti-m-input-card">
      <div class="ti-m-card-label-row">
        <div class="ti-m-card-label">
          {{ t('mobile_input_source_text_label') || 'Source Text' }}
        </div>
        
        <div class="ti-m-card-actions">
          <button 
            class="ti-m-input-action-btn ti-m-paste-btn" 
            @click="handlePaste"
          >
            <img
              src="@/icons/ui/paste.png"
              class="ti-m-icon-img-small"
            >
            {{ t('action_paste_from_clipboard') || 'Paste' }}
          </button>
          
          <button 
            v-if="inputText"
            class="ti-m-input-action-btn ti-m-clear-btn" 
            @click="inputText = ''"
          >
            {{ t('mobile_input_clear_btn') || 'Clear' }}
          </button>
        </div>
      </div>
      
      <textarea
        v-model="inputText"
        :placeholder="t('mobile_input_placeholder') || 'Type here...'"
        :dir="inputDir"
        class="ti-m-textarea"
        @focus="onFocus"
      />
    </div>

    <!-- Controls -->
    <div class="ti-m-input-controls">
      <!-- Languages -->
      <div class="ti-m-language-controls-card">
        <LanguageSelector
          v-model:source-language="sourceLang"
          v-model:target-language="targetLang"
          compact
          :provider="currentProvider"
          :beta="settingsStore.settings.DEEPL_BETA_LANGUAGES_ENABLED"
          :source-title="t('popup_source_language_title') || 'Source'"
          :target-title="t('popup_target_language_title') || 'Target'"
          :swap-title="t('popup_swap_languages_title') || 'Swap'"
          :auto-detect-label="t('auto_detect') || 'Auto-Detect'"
        />
      </div>
      
      <!-- Provider and Translate -->
      <div class="ti-m-actions-row">
        <div class="ti-m-provider-wrapper">
          <ProviderSelector
            v-model="currentProvider"
            mode="mobile"
            :is-global="false"
            :show-sync="false"
            :loading="isLoading"
            @cancel="handleCancel"
          />
        </div>
        
        <button 
          :disabled="isTranslateDisabled && !isLoading"
          class="ti-m-translate-main-btn"
          :class="{ 'ti-m-stop-btn': isLoading }"
          @click="isLoading ? handleCancel() : handleTranslate()"
        >
          {{ isLoading ? (t('popup_stop_button_text') || 'توقف') : (t('mobile_input_translate_btn') || 'ترجمه') }}
        </button>
      </div>
    </div>

    <!-- Result Area -->
    <div class="ti-m-result-container">
      <div
        v-if="resultText || isLoading || isError"
        class="ti-m-result-wrapper"
      >
        <TranslationDisplay
          mode="mobile"
          :content="resultText"
          :target-language="targetLang"
          :is-loading="isLoading"
          :tts-status="tts.ttsState.value"
          :error="isError ? resultText : ''"
          :copy-title="t('mobile_selection_copy_tooltip') || 'Copy'"
          :tts-title="t('mobile_selection_speak_tooltip') || 'Speak'"
          @text-copied="onTextCopied"
          @tts-started="onSpeak"
          @tts-stopped="tts.stop()"
          @history-requested="onHistory"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import './InputView.scss'
import { ref, computed, watch } from 'vue'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { useMobileStore } from '@/store/modules/mobile.js'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { pageEventBus } from '@/core/PageEventBus.js'
import { useMessaging } from '@/shared/messaging/composables/useMessaging.js'
import { MessageActions, MessageContexts } from '@/shared/messaging/core/MessagingCore.js'
import { shouldApplyRtl } from "@/shared/utils/text/textAnalysis.js";
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js'
import { TranslationMode } from '@/shared/config/config.js'
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js'
import { useTTSSmart } from '@/features/tts/composables/useTTSSmart.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import TranslationDisplay from '@/components/shared/TranslationDisplay.vue'
import LanguageSelector from '@/components/shared/LanguageSelector.vue'
import ProviderSelector from '@/components/shared/ProviderSelector.vue'
import ExtensionContextManager from '@/core/extensionContext.js'

const mobileStore = useMobileStore()
const settingsStore = useSettingsStore()
const { t } = useUnifiedI18n()
const { sendMessage, createMessage } = useMessaging(MessageContexts.MOBILE_TRANSLATE)
const { getErrorForDisplay } = useErrorHandler()
const tts = useTTSSmart()
const logger = getScopedLogger(LOG_COMPONENTS.MOBILE, 'InputView')

const inputText = ref(mobileStore.selectionData.text || '')
const sourceLang = ref(mobileStore.selectionData.sourceLang || settingsStore.settings.SOURCE_LANGUAGE || 'auto')
const targetLang = ref(mobileStore.selectionData.targetLang || settingsStore.settings.TARGET_LANGUAGE || 'fa')
const currentProvider = ref(settingsStore.settings.TRANSLATION_API || 'google')
const isLoading = ref(false)
const currentMessageId = ref(null)
const resultText = ref(mobileStore.selectionData.error || mobileStore.selectionData.translation || '')
const isError = ref(!!mobileStore.selectionData.error)

const isTranslateDisabled = computed(() => {
  const text = inputText.value || '';
  return text.trim().length === 0 || isLoading.value;
})

watch(() => settingsStore.isInitialized, (initialized) => {
  if (initialized) {
    if (!mobileStore.selectionData.text) {
      sourceLang.value = settingsStore.settings.SOURCE_LANGUAGE || 'auto'
      targetLang.value = settingsStore.settings.TARGET_LANGUAGE || 'fa'
      currentProvider.value = settingsStore.settings.TRANSLATION_API || 'google'
    }
  }
}, { immediate: true })

const inputDir = computed(() => {
  if (!inputText.value) return 'ltr'
  return shouldApplyRtl(inputText.value) ? 'rtl' : 'ltr'
})

const goBack = () => { mobileStore.navigate(MOBILE_CONSTANTS.VIEWS.DASHBOARD) }
const onFocus = () => { mobileStore.setSheetState(MOBILE_CONSTANTS.SHEET_STATE.FULL) }

const handlePaste = async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      inputText.value = text;
      pageEventBus.emit(MessageActions.SHOW_NOTIFICATION_SIMPLE, { message: t('mobile_input_pasted_message'), type: 'success' });
    }
  } catch (err) {
    if (ExtensionContextManager.isContextError(err)) {
      ExtensionContextManager.handleContextError(err, 'mobile-input:paste');
    } else {
      pageEventBus.emit(MessageActions.SHOW_NOTIFICATION_SIMPLE, { message: t('mobile_input_paste_failed'), type: 'error' });
    }
  }
}

const handleTranslate = async () => {
  if (!inputText.value || isLoading.value) return
  isLoading.value = true
  isError.value = false
  
  // Generate a unique message ID for this request
  currentMessageId.value = `mobile-input-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  logger.info('Manual translation requested', { 
    sourceLang: sourceLang.value, 
    targetLang: targetLang.value,
    provider: currentProvider.value,
    messageId: currentMessageId.value
  });

  try {
    const payload = { 
      text: inputText.value, 
      sourceLanguage: sourceLang.value, 
      targetLanguage: targetLang.value, 
      provider: currentProvider.value, 
      mode: TranslationMode.Mobile_Translate,
      messageId: currentMessageId.value
    };
    
    const message = createMessage(MessageActions.TRANSLATE, payload);
    const response = await sendMessage(message);
    
    if (response && response.success) {
      const translated = response.translatedText || (response.data && response.data.translatedText) || (response.result && response.result.translatedText);
      if (translated) {
        logger.debug('Manual translation successful');
        resultText.value = translated;
      } else {
        logger.info('Manual translation returned empty result');
        resultText.value = t('mobile_input_no_result_error') || "No translation found.";
      }
    } else {
      // Check if it was cancelled
      const errorMsg = response?.error || "Translation failed.";
      if (errorMsg.includes('cancelled') || response?.type === 'USER_CANCELLED') {
        logger.debug('Manual translation cancelled by user');
        return;
      }

      isError.value = true;
      const errorInfo = await getErrorForDisplay(errorMsg, 'mobile-input');
      logger.error('Manual translation failed', { error: errorInfo.message });
      resultText.value = errorInfo.message;
    }
  } catch (error) {
    // Check for cancellation in exception too
    if (error.message?.includes('cancelled') || error.type === 'USER_CANCELLED') {
      logger.debug('Manual translation exception: cancelled');
      return;
    }

    if (ExtensionContextManager.isContextError(error)) {
      mobileStore.closeSheet();
      ExtensionContextManager.handleContextError(error, 'mobile-input:translate');
      resultText.value = t('mobile_input_context_error') || "Extension context unavailable. Please refresh the page.";
    } else {
      isError.value = true;
      const errorInfo = await getErrorForDisplay(error, 'mobile-input');
      logger.error('Manual translation exception', { error: errorInfo.message });
      resultText.value = errorInfo.message;
    }
  } finally { 
    isLoading.value = false;
    currentMessageId.value = null;
  }
}

const handleCancel = async () => {
  if (!currentMessageId.value) return;
  
  logger.info('Cancelling manual translation:', currentMessageId.value);
  
  try {
    const cancelMessage = createMessage(MessageActions.CANCEL_TRANSLATION, {
      messageId: currentMessageId.value
    });
    await sendMessage(cancelMessage);
  } catch (error) {
    logger.error('Failed to send cancel message:', error);
  }
}

const onTextCopied = () => { pageEventBus.emit(MessageActions.SHOW_NOTIFICATION_SIMPLE, { message: t('mobile_input_copied_message') || 'Copied', type: 'success' }) }
const onSpeak = async (data) => { const text = data?.text || resultText.value; const lang = data?.language || targetLang.value; if (text) await tts.speak(text, lang); }
const onHistory = () => { mobileStore.setView(MOBILE_CONSTANTS.VIEWS.HISTORY); mobileStore.setSheetState(MOBILE_CONSTANTS.SHEET_STATE.FULL); }
</script>
