<template>
  <div
    class="ti-m-input-view"
    :class="{ 'is-dark': settingsStore.isDarkTheme }"
    style="display: flex !important; flex-direction: column !important; height: 100% !important; font-family: sans-serif !important; gap: 15px !important; background-color: inherit !important;"
  >
    <!-- Header -->
    <div
      class="ti-m-view-header"
      style="display: flex !important; align-items: center !important; padding-bottom: 10px !important; border-bottom: 1px solid var(--ti-mobile-header-border) !important;"
    >
      <button
        class="ti-m-back-btn"
        style="background: none !important; border: none !important; display: flex !important; align-items: center !important; gap: 8px !important; cursor: pointer !important; padding: 0 !important; height: 44px !important; min-width: 44px !important; -webkit-tap-highlight-color: transparent !important; color: var(--ti-mobile-text) !important;"
        @click="goBack"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 6 4"
          fill="none"
          style="transform: rotate(90deg) !important;"
        >
          <path
            d="M1 1L3 3L5 1"
            stroke="currentColor"
            stroke-width="0.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span
          class="ti-m-header-title"
          style="font-weight: bold !important; font-size: 17px !important; color: var(--ti-mobile-text) !important;"
        >{{ t('mobile_input_header_title') || 'Manual Input' }}</span>
      </button>
    </div>

    <!-- Input Card -->
    <div
      class="ti-m-input-card"
      style="border: 1px solid var(--ti-mobile-border) !important; background: var(--ti-mobile-card-bg) !important; border-radius: 12px !important; padding: 12px !important; display: flex !important; flex-direction: column !important; gap: 10px !important;"
    >
      <div style="display: flex !important; justify-content: space-between !important; align-items: center !important;">
        <div style="font-size: 11px !important; font-weight: 800 !important; color: var(--ti-mobile-text-muted) !important; text-transform: uppercase !important;">
          {{ t('mobile_input_source_text_label') || 'Source Text' }}
        </div>
        
        <div style="display: flex !important; gap: 8px !important;">
          <button 
            class="ti-m-input-action-btn ti-m-paste-btn" 
            style="padding: 6px 12px !important; border-radius: 8px !important; font-size: 12px !important; cursor: pointer !important; display: flex !important; align-items: center !important; gap: 5px !important; font-weight: 600 !important; transition: all 0.2s ease !important; background: var(--ti-mobile-accent-bg) !important; color: var(--ti-mobile-accent) !important; border: 1px solid var(--ti-mobile-accent-bg) !important;" 
            @click="handlePaste"
          >
            <img
              src="@/icons/ui/paste.png"
              class="ti-m-icon-img-small"
              style="width: 14px !important; height: 14px !important; object-fit: contain !important; filter: var(--ti-mobile-icon-filter) !important;"
            >
            {{ t('action_paste_from_clipboard') || 'Paste' }}
          </button>
          
          <button 
            v-if="inputText"
            class="ti-m-input-action-btn ti-m-clear-btn" 
            style="padding: 6px 12px !important; border-radius: 8px !important; font-size: 12px !important; cursor: pointer !important; font-weight: 600 !important; transition: all 0.2s ease !important; background: var(--ti-mobile-error-bg) !important; color: var(--ti-mobile-error) !important; border: 1px solid var(--ti-mobile-error-bg) !important;" 
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
        style="width: 100% !important; min-height: 100px !important; border: none !important; background: transparent !important; font-size: 16px !important; color: var(--ti-mobile-text-secondary) !important; resize: none !important; outline: none !important; padding: 4px 0 !important; text-align: start !important; line-height: 1.5 !important;"
        @focus="onFocus"
      />
    </div>

    <!-- Controls -->
    <div
      class="ti-m-input-controls"
      style="display: flex !important; flex-direction: column !important; gap: 12px !important; position: relative !important;"
    >
      <!-- Languages -->
      <div
        class="ti-m-language-controls-card"
        style="border: 1px solid var(--ti-mobile-btn-border) !important; border-radius: 12px !important; background: var(--ti-mobile-btn-bg) !important; overflow: hidden !important; box-shadow: 0 2px 4px rgba(0,0,0,0.02) !important; margin-top: 5px !important;"
      >
        <LanguageSelector
          v-model:source-language="sourceLang"
          v-model:target-language="targetLang"
          compact
          :source-title="t('popup_source_language_title') || 'Source'"
          :target-title="t('popup_target_language_title') || 'Target'"
          :swap-title="t('popup_swap_languages_title') || 'Swap'"
          :auto-detect-label="t('auto_detect') || 'Auto-Detect'"
        />
      </div>
      
      <!-- Provider and Translate -->
      <div
        class="ti-m-actions-row"
        style="display: flex !important; justify-content: space-between !important; align-items: center !important; gap: 10px !important;"
      >
        <div
          class="ti-m-provider-wrapper"
          style="flex: 1 !important; max-width: 48% !important; position: relative !important;"
        >
          <ProviderSelector
            v-model="currentProvider"
            mode="compact"
            :is-global="false"
            :show-sync="false"
            class="mobile-native-provider"
          />
        </div>
        
        <button 
          :disabled="isTranslateDisabled"
          class="ti-m-translate-main-btn"
          :style="{
            'border': 'none !important',
            'padding': '0 20px !important',
            'border-radius': '12px !important',
            'font-weight': '600 !important',
            'font-size': '15px !important',
            'height': '46px !important',
            'display': 'flex !important',
            'align-items': 'center !important',
            'justify-content': 'center !important',
            'flex': '1.2 !important',
            'transition': 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important',
            'letter-spacing': '0.3px !important',
            'background-color': isTranslateDisabled ? '#ccc !important' : '#339af0 !important',
            'color': isTranslateDisabled ? '#888 !important' : 'white !important',
            'cursor': isTranslateDisabled ? 'not-allowed !important' : 'pointer !important',
            'box-shadow': isTranslateDisabled ? 'none !important' : '0 4px 12px rgba(51, 154, 240, 0.25) !important'
          }"
          @click="handleTranslate"
        >
          {{ t('mobile_input_translate_btn') || 'Translate' }}
        </button>
      </div>
    </div>

    <!-- Result Area -->
    <div
      class="ti-m-result-container"
      style="min-height: 120px !important; position: relative !important; margin-top: 5px !important;"
    >
      <div
        v-if="resultText || isLoading || isError"
        style="animation: ti-m-slideIn 0.3s ease;"
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
import { ref, computed, watch } from 'vue'
import { useI18n } from '@/composables/shared/useI18n.js'
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
import TranslationDisplay from '@/components/shared/TranslationDisplay.vue'
import LanguageSelector from '@/components/shared/LanguageSelector.vue'
import ProviderSelector from '@/components/shared/ProviderSelector.vue'

const mobileStore = useMobileStore()
const settingsStore = useSettingsStore()
const { t } = useI18n()
const { sendMessage, createMessage } = useMessaging(MessageContexts.MOBILE_TRANSLATE)
const { getErrorForDisplay } = useErrorHandler()
const tts = useTTSSmart()

const inputText = ref(mobileStore.selectionData.text || '')
const sourceLang = ref(mobileStore.selectionData.sourceLang || settingsStore.settings.SOURCE_LANGUAGE || 'auto')
const targetLang = ref(mobileStore.selectionData.targetLang || settingsStore.settings.TARGET_LANGUAGE || 'fa')
const currentProvider = ref(settingsStore.settings.TRANSLATION_API || 'google')
const isLoading = ref(false)
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
  } catch (error) {
    pageEventBus.emit(MessageActions.SHOW_NOTIFICATION_SIMPLE, { message: t('mobile_input_paste_failed'), type: 'error' });
  }
}

const handleTranslate = async () => {
  if (!inputText.value || isLoading.value) return
  isLoading.value = true
  isError.value = false
  try {
    const payload = { text: inputText.value, sourceLanguage: sourceLang.value, targetLanguage: targetLang.value, provider: currentProvider.value, mode: TranslationMode.Mobile_Translate };
    const message = createMessage(MessageActions.TRANSLATE, payload);
    const response = await sendMessage(message);
    if (response && response.success) {
      const translated = response.translatedText || (response.data && response.data.translatedText) || (response.result && response.result.translatedText);
      if (translated) resultText.value = translated;
      else resultText.value = t('mobile_input_no_result_error') || "No translation found.";
    } else {
      isError.value = true;
      const errorInfo = await getErrorForDisplay(response?.error || "Translation failed.", 'mobile-input');
      resultText.value = errorInfo.message;
    }
  } catch (error) {
    isError.value = true;
    const errorInfo = await getErrorForDisplay(error, 'mobile-input');
    resultText.value = errorInfo.message;
  } finally { isLoading.value = false; }
}

const onTextCopied = () => { pageEventBus.emit(MessageActions.SHOW_NOTIFICATION_SIMPLE, { message: t('mobile_input_copied_message') || 'Copied', type: 'success' }) }
const onSpeak = async (data) => { const text = data?.text || resultText.value; const lang = data?.language || targetLang.value; if (text) await tts.speak(text, lang); }
const onHistory = () => { mobileStore.setView(MOBILE_CONSTANTS.VIEWS.HISTORY); mobileStore.setSheetState(MOBILE_CONSTANTS.SHEET_STATE.FULL); }
</script>

<style scoped>
@keyframes ti-m-slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

.ti-m-icon-img, .ti-m-icon-img-small {
  object-fit: contain !important;
}

.ti-m-back-icon {
  transform: rotate(90deg) !important;
}

.ti-m-paste-btn {
  background: var(--ti-mobile-accent-bg) !important;
  color: var(--ti-mobile-accent) !important;
  border: 1px solid var(--ti-mobile-accent-bg) !important;
}

.ti-m-clear-btn {
  background: var(--ti-mobile-error-bg) !important;
  color: var(--ti-mobile-error) !important;
  border: 1px solid var(--ti-mobile-error-bg) !important;
}

.ti-m-translate-main-btn {
  background-color: #339af0 !important;
  color: white !important;
  cursor: pointer !important;
  box-shadow: 0 4px 12px rgba(51, 154, 240, 0.25) !important;
}

.ti-m-translate-main-btn:disabled {
  background-color: #ccc !important;
  color: #888 !important;
  cursor: not-allowed !important;
  box-shadow: none !important;
  opacity: 0.6 !important;
}

.ti-m-translate-main-btn:active:not(:disabled) {
  transform: scale(0.96) !important;
  filter: brightness(0.9) !important;
}

/* Ensure consistent look in dark mode */
.is-dark .ti-m-translate-main-btn:not(:disabled) {
  background-color: #339af0 !important;
  color: white !important;
}

.is-dark .ti-m-translate-main-btn:disabled {
  background-color: #2a2a2a !important;
  color: #555555 !important;
}
</style>