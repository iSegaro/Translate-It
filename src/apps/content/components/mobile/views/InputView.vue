<template>
  <div class="input-view" style="display: flex; flex-direction: column; height: 100%; font-family: sans-serif; gap: 15px;">
    
    <!-- Header -->
    <div style="display: flex; align-items: center; padding-bottom: 10px; border-bottom: 1px solid #eee;">
      <button @click="goBack" style="background: none; border: none; display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 0;">
        <img src="@/icons/ui/dropdown-arrow.svg" style="width: 18px; height: 18px; transform: rotate(90deg); opacity: 0.6;" />
        <span style="font-weight: bold; font-size: 16px; color: #333;">Manual Input</span>
      </button>
    </div>

    <!-- Input Card -->
    <div style="background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 10px;">
      <div style="font-size: 11px; font-weight: 800; color: #adb5bd; text-transform: uppercase;">Source Text</div>
      <textarea
        v-model="inputText"
        placeholder="Type here..."
        style="width: 100%; min-height: 80px; border: none; background: transparent; font-size: 16px; color: #495057; resize: none; outline: none; padding: 0;"
        @focus="onFocus"
      ></textarea>
      <div v-if="inputText" style="display: flex; justify-content: flex-end;">
        <button @click="inputText = ''" style="background: #eee; border: none; padding: 4px 10px; border-radius: 6px; font-size: 12px; color: #666;">Clear</button>
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
    <div v-if="resultText" style="background: #e7f5ff; border: 1px solid #d0ebff; border-radius: 12px; padding: 15px; animation: slideIn 0.3s ease;">
      <!-- Rendered Markdown Content -->
      <div 
        class="result-content markdown-body" 
        :dir="detectedDir"
        style="font-size: 16px; color: #1c7ed6; line-height: 1.5; margin-bottom: 12px; text-align: start;"
        v-html="sanitizedResult"
      ></div>
      
      <div style="display: flex; gap: 10px;">
        <button @click="copyResult" style="width: 36px; height: 36px; border-radius: 50%; border: 1px solid #d0ebff; background: white; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          <img src="@/icons/ui/copy.png" style="width: 16px; height: 16px;" />
        </button>
        <button @click="speakResult" style="width: 36px; height: 36px; border-radius: 50%; border: 1px solid #d0ebff; background: white; display: flex; align-items: center; justify-content: center; cursor: pointer;">
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
import DOMPurify from "dompurify";

const mobileStore = useMobileStore()
const { sendMessage, createMessage } = useMessaging('mobile-input')

const inputText = ref('')
const targetLang = ref('en')
const isLoading = ref(false)
const resultText = ref('')

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
  mobileStore.setView('dashboard')
  mobileStore.setSheetState('peek')
}

const onFocus = () => {
  mobileStore.setSheetState('full')
}

const handleTranslate = async () => {
  if (!inputText.value || isLoading.value) return
  
  isLoading.value = true
  resultText.value = '' // Clear previous result immediately
  
  try {
    // Standardize message sending with explicit string ID
    const payload = {
      text: inputText.value,
      sourceLanguage: 'auto',
      targetLanguage: targetLang.value
    };

    const message = createMessage(MessageActions.TRANSLATE, payload);
    
    // Ensure messageId is a string if it got populated as an object by any middleware
    if (typeof message.messageId !== 'string') {
      message.messageId = `input-${Date.now()}`;
    }

    const response = await sendMessage(message);

    if (response && response.success) {
      // Robust response parsing
      const translated = response.translatedText || 
                         (response.data && response.data.translatedText) || 
                         (response.result && response.result.translatedText);
                         
      if (translated) {
        resultText.value = translated;
      } else {
        resultText.value = "No translation found. Please try again.";
      }
    } else {
      const errorMsg = response?.error?.message || response?.error || "Translation failed.";
      resultText.value = `Error: ${errorMsg}`;
    }
  } catch (error) {
    console.error('[MobileInput] Unexpected error:', error);
    resultText.value = "Service temporarily unavailable.";
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
.result-content.markdown-body { word-wrap: break-word; }
.result-content.markdown-body p { margin-bottom: 8px; }
.result-content.markdown-body strong { font-weight: bold; }
.result-content.markdown-body ul, .result-content.markdown-body ol { padding-inline-start: 20px; margin-bottom: 8px; }
@media (prefers-color-scheme: dark) {
  .result-content.markdown-body code { background: rgba(255,255,255,0.1); }
}
</style>
