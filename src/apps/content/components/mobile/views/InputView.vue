<template>
  <div class="input-view" style="display: flex; flex-direction: column; height: 100%; font-family: sans-serif; gap: 15px;">
    
    <!-- Header -->
    <div style="display: flex; align-items: center; padding-bottom: 10px; border-bottom: 1px solid #eee;">
      <button @click="goBack" style="background: none; border: none; display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 0;">
        <img src="@/icons/ui/dropdown-arrow.svg" :alt="t('mobile_back_button_alt') || 'Back'" style="width: 18px; height: 18px; transform: rotate(90deg); opacity: 0.6;" />
        <span style="font-weight: bold; font-size: 16px; color: #333;" class="header-title">{{ t('mobile_input_header_title') || 'Manual Input' }}</span>
      </button>
    </div>

    <!-- Input Card -->
    <div class="input-card" style="background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 10px;">
      <div style="font-size: 11px; font-weight: 800; color: #adb5bd; text-transform: uppercase;">{{ t('mobile_input_source_text_label') || 'Source Text' }}</div>
      <textarea
        v-model="inputText"
        :placeholder="t('mobile_input_placeholder') || 'Type here...'"
        :dir="inputDir"
        style="width: 100%; min-height: 80px; border: none; background: transparent; font-size: 16px; color: #495057; resize: none; outline: none; padding: 0; text-align: start;"
        @focus="onFocus"
      ></textarea>
      <div v-if="inputText" style="display: flex; justify-content: flex-end;">
        <button class="clear-btn" @click="inputText = ''" style="background: #eee; border: none; padding: 4px 10px; border-radius: 6px; font-size: 12px; color: #666; cursor: pointer;">{{ t('mobile_input_clear_btn') || 'Clear' }}</button>
      </div>
    </div>

    <!-- Controls -->
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 14px; color: #868e96;">{{ t('mobile_input_to_label') || 'To:' }}</span>
        <select v-model="targetLang" style="padding: 5px 10px; border-radius: 8px; border: 1px solid #ced4da; background: white; font-size: 14px;">
          <option value="en">English</option>
          <option value="fa">Persian</option>
          <option value="de">German</option>
          <option value="fr">French</option>
          <option value="ja">Japanese</option>
        </select>
      </div>
      
      <button 
        @click="handleTranslate"
        :disabled="!inputText || isLoading"
        style="background: #339af0; color: white; border: none; padding: 10px 20px; border-radius: 10px; font-weight: bold; cursor: pointer; opacity: (isLoading || !inputText) ? 0.6 : 1;"
      >
        {{ isLoading ? '...' : (t('mobile_input_translate_btn') || 'Translate') }}
      </button>
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
import TranslationDisplay from '@/components/shared/TranslationDisplay.vue'

const mobileStore = useMobileStore()
const { t } = useI18n()
const { sendMessage, createMessage } = useMessaging('mobile-input')
const { getErrorForDisplay } = useErrorHandler()

const inputText = ref('')
const targetLang = ref('en')
const isLoading = ref(false)
const resultText = ref('')
const isError = ref(false)

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

const handleTranslate = async () => {
  if (!inputText.value || isLoading.value) return
  
  isLoading.value = true
  resultText.value = '' 
  isError.value = false
  
  try {
    const payload = {
      text: inputText.value,
      sourceLanguage: 'auto',
      targetLanguage: targetLang.value
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
  pageEventBus.emit(MessageActions.SHOW_NOTIFICATION_SIMPLE, {
    message: t('mobile_selection_history_unavailable') || 'History feature coming soon to mobile',
    type: 'info'
  })
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
  .clear-btn { background: #3d3d3d !important; color: #adb5bd !important; }
  
  select { background-color: #2d2d2d !important; color: #dee2e6 !important; border-color: #444 !important; }
}
</style>