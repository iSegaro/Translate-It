<template>
  <div class="input-view" style="display: flex; flex-direction: column; height: 100%; font-family: sans-serif; gap: 15px;">
    
    <!-- Header -->
    <div style="display: flex; align-items: center; padding-bottom: 10px; border-bottom: 1px solid #eee;">
      <button @click="goBack" style="background: none; border: none; display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 0; height: 44px; min-width: 44px; -webkit-tap-highlight-color: transparent;">
        <img src="@/icons/ui/dropdown-arrow.svg" :alt="t('mobile_back_button_alt') || 'Back'" style="width: 20px; height: 20px; transform: rotate(90deg); opacity: 0.6;" />
        <span style="font-weight: bold; font-size: 17px; color: #333;" class="header-title">{{ t('mobile_input_header_title') || 'Manual Input' }}</span>
      </button>
    </div>

    <!-- Input Card -->
    <div class="input-card" style="background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 10px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="font-size: 11px; font-weight: 800; color: #adb5bd; text-transform: uppercase;">{{ t('mobile_input_source_text_label') || 'Source Text' }}</div>
        
        <div style="display: flex; gap: 8px;">
           <button 
            class="input-action-btn paste-btn" 
            @click="handlePaste" 
            style="background: #e7f5ff; border: 1px solid #d0ebff; padding: 6px 12px; border-radius: 8px; font-size: 12px; color: #1c7ed6; cursor: pointer; display: flex; align-items: center; gap: 5px; font-weight: 600;"
          >
            <img src="@/icons/ui/paste.png" style="width: 14px; height: 14px; filter: brightness(0.8);" />
            {{ t('action_paste_from_clipboard') || 'Paste' }}
          </button>
          
          <button 
            v-if="inputText"
            class="input-action-btn clear-btn" 
            @click="inputText = ''" 
            style="background: #fff5f5; border: 1px solid #ffe3e3; padding: 6px 12px; border-radius: 8px; font-size: 12px; color: #fa5252; cursor: pointer; font-weight: 600;"
          >
            {{ t('mobile_input_clear_btn') || 'Clear' }}
          </button>
        </div>
      </div>
      
      <textarea
        v-model="inputText"
        :placeholder="t('mobile_input_placeholder') || 'Type here...'"
        :dir="inputDir"
        style="width: 100%; min-height: 100px; border: none; background: transparent; font-size: 16px; color: #495057; resize: none; outline: none; padding: 4px 0; text-align: start; line-height: 1.5;"
        @focus="onFocus"
      ></textarea>
    </div>

    <!-- Controls -->
    <div style="display: flex; flex-direction: column; gap: 15px;">
      <!-- Languages -->
      <div class="language-controls-wrapper" style="border: 1px solid #ced4da; border-radius: 12px; background: white; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
        <LanguageSelector
          v-model:source-language="sourceLang"
          v-model:target-language="targetLang"
          :source-title="t('popup_source_language_title') || 'Source'"
          :target-title="t('popup_target_language_title') || 'Target'"
          :swap-title="t('popup_swap_languages_title') || 'Swap'"
          :auto-detect-label="t('auto_detect') || 'Auto-Detect'"
        />
      </div>
      
      <!-- Provider and Translate -->
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
        <div style="flex: 1; max-width: 50%;">
          <ProviderSelector
            v-model="currentProvider"
            mode="button"
            :is-global="false"
            :show-sync="false"
            style="width: 100%; border-radius: 12px;"
          />
        </div>
        
        <button 
          @click="handleTranslate"
          :disabled="!inputText || isLoading"
          class="translate-main-btn"
          style="background: #339af0; color: white; border: none; padding: 12px 20px; border-radius: 12px; font-weight: bold; cursor: pointer; font-size: 15px; display: flex; align-items: center; justify-content: center; flex: 1; transition: all 0.2s ease; box-shadow: 0 4px 10px rgba(51, 154, 240, 0.25);"
          :style="{ opacity: (isLoading || !inputText) ? 0.6 : 1 }"
        >
          <span v-if="isLoading" class="mini-spinner" style="width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.8s linear infinite; margin-right: 8px;"></span>
          {{ isLoading ? (t('popup_string_during_translate') || '...') : (t('mobile_input_translate_btn') || 'Translate') }}
        </button>
      </div>
    </div>

    <!-- Result Card using Shared Component -->
    <div v-if="resultText || isLoading || isError" style="animation: slideIn 0.3s ease;">
      <TranslationDisplay
        mode="mobile"
        :content="resultText"
        :target-language="targetLang"
        :is-loading="isLoading"
        :error="isError ? resultText : ''"
        :copy-title="t('mobile_selection_copy_tooltip') || 'Copy'"
        :tts-title="t('mobile_selection_speak_tooltip') || 'Speak'"
        @text-copied="onTextCopied"
        @tts-started="onSpeak"
        @history-requested="onHistory"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from '@/composables/shared/useI18n.js'
import { useMobileStore } from '@/store/modules/mobile.js'
import { pageEventBus } from '@/core/PageEventBus.js'
import { useMessaging } from '@/shared/messaging/composables/useMessaging.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'
import { shouldApplyRtl } from "@/shared/utils/text/textAnalysis.js";
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js'
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import TranslationDisplay from '@/components/shared/TranslationDisplay.vue'
import LanguageSelector from '@/components/shared/LanguageSelector.vue'
import ProviderSelector from '@/components/shared/ProviderSelector.vue'

const mobileStore = useMobileStore()
const settingsStore = useSettingsStore()
const { t } = useI18n()
const { sendMessage, createMessage } = useMessaging('mobile-input')
const { getErrorForDisplay } = useErrorHandler()

// Initialize with store text if available (from SelectionView)
const inputText = ref(mobileStore.selectionData.text || '')
const sourceLang = ref(mobileStore.selectionData.sourceLang || 'auto')
const targetLang = ref(mobileStore.selectionData.targetLang || 'en')
const currentProvider = ref(settingsStore.settings?.TRANSLATION_API || 'google')
const isLoading = ref(false)
const resultText = ref(mobileStore.selectionData.error || mobileStore.selectionData.translation || '')
const isError = ref(!!mobileStore.selectionData.error)

const inputDir = computed(() => {
  if (!inputText.value) return 'ltr'
  return shouldApplyRtl(inputText.value) ? 'rtl' : 'ltr'
})

const goBack = () => {
  mobileStore.setView(MOBILE_CONSTANTS.VIEWS.DASHBOARD)
  mobileStore.setSheetState(MOBILE_CONSTANTS.SHEET_STATE.PEEK)
}

const onFocus = () => {
  mobileStore.setSheetState(MOBILE_CONSTANTS.SHEET_STATE.FULL)
}

const handlePaste = async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      inputText.value = text;
      pageEventBus.emit(MessageActions.SHOW_NOTIFICATION_SIMPLE, { 
        message: t('mobile_input_pasted_message') || 'Pasted from clipboard', 
        type: 'success' 
      });
    }
  } catch (error) {
    console.error('[InputView] Paste failed:', error);
    pageEventBus.emit(MessageActions.SHOW_NOTIFICATION_SIMPLE, { 
      message: 'Paste failed. Please allow clipboard access.', 
      type: 'error' 
    });
  }
}

const handleTranslate = async () => {
  if (!inputText.value || isLoading.value) return
  
  isLoading.value = true
  resultText.value = '' 
  isError.value = false
  
  try {
    const payload = {
      text: inputText.value,
      sourceLanguage: sourceLang.value,
      targetLanguage: targetLang.value,
      api: currentProvider.value
    };

    const message = createMessage(MessageActions.TRANSLATE, payload);
    
    if (typeof message.messageId !== 'string') {
      message.messageId = `input-${Date.now()}`;
    }

    const response = await sendMessage(message);

    if (response && response.success) {
      const translated = response.translatedText || 
                         (response.data && response.data.translatedText) || 
                         (response.result && response.result.translatedText);
                         
      if (translated) {
        resultText.value = translated;
      } else {
        resultText.value = t('mobile_input_no_result_error') || "No translation found. Please try again.";
      }
    } else {
      isError.value = true;
      const errorInfo = await getErrorForDisplay(response?.error || (t('mobile_input_default_error') || "Translation failed."), 'mobile-input');
      resultText.value = errorInfo.message;
    }
  } catch (error) {
    console.error('[MobileInput] Unexpected error:', error);
    isError.value = true;
    const errorInfo = await getErrorForDisplay(error, 'mobile-input');
    resultText.value = errorInfo.message;
  } finally {
    isLoading.value = false;
  }
}

const onTextCopied = () => {
  pageEventBus.emit(MessageActions.SHOW_NOTIFICATION_SIMPLE, { 
    message: t('mobile_input_copied_message') || 'Copied', 
    type: 'success' 
  })
}

const onSpeak = (data) => {
  // Use data from event or fallback to local state
  const text = data?.text || resultText.value;
  const lang = data?.language || targetLang.value;
  
  pageEventBus.emit(MessageActions.GOOGLE_TTS_SPEAK, {
    text: text,
    lang: lang
  })
}

const onHistory = () => {
  mobileStore.setView(MOBILE_CONSTANTS.VIEWS.HISTORY)
  mobileStore.setSheetState(MOBILE_CONSTANTS.SHEET_STATE.FULL)
}
</script>

<style>
@keyframes slideIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-color-scheme: dark) {
  .header-title { color: #adb5bd !important; }
  .input-card { background: #2d2d2d !important; border-color: #3d3d3d !important; }
  .input-card textarea { color: #dee2e6 !important; }
  
  .paste-btn { 
    background: rgba(28, 126, 214, 0.1) !important; 
    border-color: rgba(28, 126, 214, 0.3) !important; 
    color: #74c0fc !important; 
  }
  .paste-btn img { filter: invert(0.8) sepia(1) saturate(5) hue-rotate(180deg); }
  
  .clear-btn { 
    background: rgba(250, 82, 82, 0.1) !important; 
    border-color: rgba(250, 82, 82, 0.3) !important; 
    color: #ff8787 !important; 
  }
  
  select { background-color: #2d2d2d !important; color: #dee2e6 !important; border-color: #444 !important; }
  .translate-main-btn { background: #1971c2 !important; box-shadow: 0 4px 10px rgba(0,0,0,0.3) !important; }
}
</style>