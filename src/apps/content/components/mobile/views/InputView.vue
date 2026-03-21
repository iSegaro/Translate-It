<template>
  <div class="input-view" style="display: flex; flex-direction: column; height: 100%; font-family: sans-serif; gap: 15px;">
    
    <!-- Header -->
    <div style="display: flex; align-items: center; padding-bottom: 10px; border-bottom: 1px solid #eee;">
      <button @click="goBack" style="background: none; border: none; display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 0;">
        <img src="@/icons/ui/dropdown-arrow.svg" style="width: 18px; height: 18px; transform: rotate(90deg); opacity: 0.6;" />
        <span style="font-weight: bold; font-size: 16px; color: #333;" class="header-title">Manual Input</span>
      </button>
    </div>

    <!-- Input Card -->
    <div class="input-card" style="background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 10px;">
      <div style="font-size: 11px; font-weight: 800; color: #adb5bd; text-transform: uppercase;">Source Text</div>
      <textarea
        v-model="inputText"
        placeholder="Type here..."
        :dir="inputDir"
        style="width: 100%; min-height: 80px; border: none; background: transparent; font-size: 16px; color: #495057; resize: none; outline: none; padding: 0; text-align: start;"
        @focus="onFocus"
      ></textarea>
      <div v-if="inputText" style="display: flex; justify-content: flex-end;">
        <button class="clear-btn" @click="inputText = ''" style="background: #eee; border: none; padding: 4px 10px; border-radius: 6px; font-size: 12px; color: #666; cursor: pointer;">Clear</button>
      </div>
    </div>

    <!-- Controls -->
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 14px; color: #868e96;">To:</span>
        <select v-model="targetLang" style="padding: 5px 10px; border-radius: 8px; border: 1px solid #ced4da; background: white; font-size: 14px;">
          <option value="en">English</option>
          <option value="fa">Persian</option>
          <option value="de">German</option>
          <option value="fr">French</option>
        </select>
      </div>
      
      <button 
        @click="handleTranslate"
        :disabled="!inputText || isLoading"
        style="background: #339af0; color: white; border: none; padding: 10px 20px; border-radius: 10px; font-weight: bold; cursor: pointer; opacity: (isLoading || !inputText) ? 0.6 : 1;"
      >
        {{ isLoading ? '...' : 'Translate' }}
      </button>
    </div>

    <!-- Result Card -->
    <div v-if="resultText" class="result-card" :class="{ 'is-error': isError }" style="background: #e7f5ff; border: 1px solid #d0ebff; border-radius: 12px; padding: 15px; animation: slideIn 0.3s ease;">
      <!-- Rendered Markdown Content -->
      <div 
        class="result-content markdown-body" 
        :dir="detectedDir"
        style="font-size: 16px; color: #1c7ed6; line-height: 1.5; margin-bottom: 12px; text-align: start;"
        :style="{ color: isError ? '#fa5252' : '#1c7ed6' }"
        v-html="sanitizedResult"
      ></div>
      
      <div v-if="!isError" style="display: flex; gap: 10px;">
        <button class="action-btn" @click="copyResult" style="width: 36px; height: 36px; border-radius: 50%; border: 1px solid #d0ebff; background: white; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          <img src="@/icons/ui/copy.png" style="width: 16px; height: 16px;" />
        </button>
        <button class="action-btn" @click="speakResult" style="width: 36px; height: 36px; border-radius: 50%; border: 1px solid #d0ebff; background: white; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          <img src="@/icons/ui/speaker.png" style="width: 16px; height: 16px;" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useMobileStore } from '@/store/modules/mobile.js'
import { pageEventBus } from '@/core/PageEventBus.js'
import { useMessaging } from '@/shared/messaging/composables/useMessaging.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'
import { SimpleMarkdown } from "@/shared/utils/text/markdown.js";
import { shouldApplyRtl } from "@/shared/utils/text/textAnalysis.js";
import { getTextDirection } from "@/features/element-selection/utils/textDirection.js";
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js'
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js'
import DOMPurify from "dompurify";

const mobileStore = useMobileStore()
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

const detectedDir = computed(() => {
  if (!resultText.value) return 'ltr'
  const direction = getTextDirection(targetLang.value, resultText.value)
  return direction === 'rtl' || shouldApplyRtl(resultText.value) ? 'rtl' : 'ltr'
})

const sanitizedResult = computed(() => {
  if (!resultText.value) return ''
  try {
    const markdownElement = SimpleMarkdown.render(resultText.value)
    const htmlContent = markdownElement ? markdownElement.innerHTML : resultText.value.replace(/\n/g, '<br>')
    return DOMPurify.sanitize(htmlContent)
  } catch (error) {
    console.error('[InputView] Markdown error:', error)
    return DOMPurify.sanitize(resultText.value.replace(/\n/g, '<br>'))
  }
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
  resultText.value = '' // Clear previous result immediately
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
        resultText.value = "No translation found. Please try again.";
      }
    } else {
      isError.value = true;
      const errorInfo = await getErrorForDisplay(response?.error || "Translation failed.", 'mobile-input');
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

const copyResult = () => {
  const plainText = SimpleMarkdown.strip ? SimpleMarkdown.strip(resultText.value) : resultText.value;
  navigator.clipboard.writeText(plainText)
  pageEventBus.emit('show-notification', { message: 'Copied', type: 'success' })
}

const speakResult = () => {
  pageEventBus.emit(MessageActions.GOOGLE_TTS_SPEAK, {
    text: resultText.value,
    lang: targetLang.value
  })
}
</script>

<style>
@keyframes slideIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.result-card.is-error {
  background: #fff5f5 !important;
  border-color: #ffe3e3 !important;
}

.result-content.markdown-body { word-wrap: break-word; }
.result-content.markdown-body p { margin-bottom: 8px; }
.result-content.markdown-body strong { font-weight: bold; }
.result-content.markdown-body ul, .result-content.markdown-body ol { padding-inline-start: 20px; margin-bottom: 8px; }

@media (prefers-color-scheme: dark) {
  .header-title { color: #adb5bd !important; }
  .input-card { background: #2d2d2d !important; border-color: #3d3d3d !important; }
  .input-card textarea { color: #dee2e6 !important; }
  .clear-btn { background: #3d3d3d !important; color: #adb5bd !important; }
  
  select { background-color: #2d2d2d !important; color: #dee2e6 !important; border-color: #444 !important; }
  
  .result-card:not(.is-error) { 
    background: rgba(28, 126, 214, 0.15) !important; 
    border-color: rgba(28, 126, 214, 0.3) !important; 
  }
  
  .result-card.is-error {
    background: rgba(250, 82, 82, 0.15) !important;
    border-color: rgba(250, 82, 82, 0.3) !important;
  }

  .result-content:not(.is-error) { color: #74c0fc !important; }
  .result-content.is-error { color: #ff8787 !important; }
  
  .result-content.markdown-body code { background: rgba(255,255,255,0.1); }
  
  .action-btn { background: #2d2d2d !important; border-color: #444 !important; }
  .action-btn img { filter: invert(0.8); }
}
</style>
