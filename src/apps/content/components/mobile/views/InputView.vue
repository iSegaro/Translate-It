<template>
  <div class="input-view">
    <div class="input-header">
      <button class="back-btn" @click="goBack">
        <img src="@/icons/ui/dropdown-arrow.svg" class="back-icon" alt="Back" style="width: 20px !important; height: 20px !important; transform: rotate(90deg) !important;" />
        <span>Manual Translation</span>
      </button>
    </div>

    <div class="input-container">
      <textarea
        v-model="inputText"
        placeholder="Type or paste text to translate..."
        class="text-input"
        @focus="onFocus"
        ref="inputRef"
      ></textarea>
      
      <div class="input-actions" v-if="inputText">
        <button class="clear-btn" @click="inputText = ''">
          <img src="@/icons/ui/clear.png" alt="Clear" style="width: 12px !important; height: 12px !important;" />
        </button>
      </div>
    </div>

    <div class="translate-bar">
      <div class="target-lang-selector">
        <span>To: </span>
        <select v-model="targetLang" class="lang-select">
          <option value="en">English</option>
          <option value="fa">Persian</option>
          <option value="ja">Japanese</option>
        </select>
      </div>
      
      <button 
        class="translate-btn" 
        :disabled="!inputText || isLoading"
        @click="handleTranslate"
      >
        <span v-if="!isLoading">Translate</span>
        <div v-else class="mini-spinner"></div>
      </button>
    </div>

    <div v-if="resultText" class="result-area">
      <div class="result-label">Result:</div>
      <div class="result-content">{{ resultText }}</div>
      <div class="result-actions">
        <button class="mini-icon-btn" @click="copyResult">
          <img src="@/icons/ui/copy.png" alt="Copy" style="width: 16px !important; height: 16px !important;" />
        </button>
        <button class="mini-icon-btn" @click="speakResult">
          <img src="@/icons/ui/speaker.png" alt="Speak" style="width: 16px !important; height: 16px !important;" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useMobileStore } from '@/store/modules/mobile.js'
import { pageEventBus } from '@/core/PageEventBus.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'

const mobileStore = useMobileStore()
const inputText = ref('')
const targetLang = ref('en')
const isLoading = ref(false)
const resultText = ref('')
const inputRef = ref(null)

const goBack = () => {
  mobileStore.setView('dashboard')
  mobileStore.setSheetState('peek')
}

const onFocus = () => {
  mobileStore.setSheetState('full')
}

const handleTranslate = async () => {
  if (!inputText.value) return
  isLoading.value = true
  
  pageEventBus.emit(MessageActions.TRANSLATE_TEXT, {
    text: inputText.value,
    targetLang: targetLang.value,
    callback: (response) => {
      isLoading.value = false
      if (response && response.translation) {
        resultText.value = response.translation
      }
    }
  });
  
  setTimeout(() => {
    if (isLoading.value) {
      isLoading.value = false
      resultText.value = "This is a simulated translation."
    }
  }, 1000)
}

const copyResult = () => {
  navigator.clipboard.writeText(resultText.value)
}

const speakResult = () => {
  pageEventBus.emit(MessageActions.GOOGLE_TTS_SPEAK, {
    text: resultText.value,
    lang: targetLang.value
  })
}
</script>

<style>
.input-view { display: flex; flex-direction: column; height: 100%; }
.input-header { margin-bottom: 16px; }
.back-btn { display: flex; align-items: center; gap: 8px; background: none; border: none; padding: 0; font-size: 16px; font-weight: 600; color: #212529; cursor: pointer; }
.input-container { position: relative; flex: 1; min-height: 120px; max-height: 200px; background: #f8f9fa; border-radius: 12px; border: 1px solid #e9ecef; margin-bottom: 16px; overflow: hidden; }
.text-input { width: 100%; height: 100%; border: none; background: transparent; padding: 12px; font-size: 16px; resize: none; outline: none; color: #495057; }
.input-actions { position: absolute; top: 8px; right: 8px; }
.clear-btn { background: #e9ecef; border: none; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.translate-bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 20px; }
.target-lang-selector { display: flex; align-items: center; gap: 8px; font-size: 14px; color: #868e96; }
.lang-select { border: 1px solid #ced4da; border-radius: 6px; padding: 4px 8px; font-size: 14px; background: #fff; }
.translate-btn { background: #339af0; color: #fff; border: none; padding: 10px 24px; border-radius: 8px; font-weight: 600; cursor: pointer; }
.translate-btn:disabled { background: #adb5bd; cursor: not-allowed; }
.result-area { background: #e7f5ff; border-radius: 12px; padding: 16px; margin-top: auto; }
.result-label { font-size: 12px; font-weight: 700; color: #1864ab; text-transform: uppercase; margin-bottom: 8px; }
.result-content { font-size: 16px; color: #212529; line-height: 1.5; margin-bottom: 12px; }
.result-actions { display: flex; gap: 12px; }
.mini-icon-btn { background: #fff; border: 1px solid #d0ebff; border-radius: 6px; padding: 6px; display: flex; align-items: center; justify-content: center; }
.mini-spinner { width: 16px; height: 16px; border: 2px solid #fff; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
@media (prefers-color-scheme: dark) {
  .back-btn { color: #f8f9fa; }
  .input-container { background: #2d2d2d; border-color: #444; }
  .text-input { color: #e0e0e0; }
  .lang-select { background: #2d2d2d; color: #e0e0e0; border-color: #444; }
  .result-area { background: #1864ab22; }
  .result-label { color: #74c0fc; }
  .result-content { color: #f8f9fa; }
  .mini-icon-btn { background: #2d2d2d; border-color: #444; }
}
</style>
