<template>
  <div class="selection-view">
    <div class="selection-header">
      <div style="display: flex; align-items: center; gap: 8px;">
        <button class="back-btn" @click="goBack">
          <img src="@/icons/ui/dropdown-arrow.svg" alt="Back" style="width: 18px !important; height: 18px !important; transform: rotate(90deg); opacity: 0.6;" />
        </button>
        <div class="lang-pair">
          <span class="lang">{{ selectionData.sourceLang || 'Auto' }}</span>
          <img src="@/icons/ui/swap.png" class="swap-icon" alt="to" style="width: 14px !important; height: 14px !important; margin: 0 5px !important;" />
          <span class="lang">{{ selectionData.targetLang }}</span>
        </div>
      </div>
      <button class="close-btn" @click="closeView">
        <img src="@/icons/ui/close.png" alt="Close" style="width: 20px !important; height: 20px !important;" />
      </button>
    </div>

    <div class="content-area">
      <div v-if="selectionData.isLoading" class="loading-state">
        <div class="spinner"></div>
        <span>Translating...</span>
      </div>
      
      <div v-else-if="selectionData.error" class="error-state">
        <p>{{ selectionData.error }}</p>
      </div>

      <div v-else class="translation-result">
        <div class="original-text">
          {{ selectionData.text }}
        </div>
        <div 
          class="translated-text markdown-body" 
          :dir="detectedDir"
          v-html="sanitizedResult"
        ></div>
      </div>
    </div>

    <div class="action-bar" v-if="!selectionData.isLoading && !selectionData.error">
      <button class="icon-btn" @click="speak">
        <img src="@/icons/ui/speaker.png" alt="Speak" style="width: 20px !important; height: 20px !important;" />
      </button>
      <button class="icon-btn" @click="copy">
        <img src="@/icons/ui/copy.png" alt="Copy" style="width: 20px !important; height: 20px !important;" />
      </button>
      <button class="icon-btn" @click="toggleHistory">
        <img src="@/icons/ui/history.svg" alt="History" style="width: 20px !important; height: 20px !important;" />
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useMobileStore } from '@/store/modules/mobile.js'
import { pageEventBus } from '@/core/PageEventBus.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'
import { SimpleMarkdown } from "@/shared/utils/text/markdown.js";
import { shouldApplyRtl } from "@/shared/utils/text/textAnalysis.js";
import { getTextDirection } from "@/features/element-selection/utils/textDirection.js";
import DOMPurify from "dompurify";

const mobileStore = useMobileStore()
const { selectionData } = storeToRefs(mobileStore)

const detectedDir = computed(() => {
  if (!selectionData.value.translation) return 'ltr'
  const direction = getTextDirection(selectionData.value.targetLang, selectionData.value.translation)
  return direction === 'rtl' || shouldApplyRtl(selectionData.value.translation) ? 'rtl' : 'ltr'
})

const sanitizedResult = computed(() => {
  if (!selectionData.value.translation) return ''
  try {
    const markdownElement = SimpleMarkdown.render(selectionData.value.translation)
    const htmlContent = markdownElement ? markdownElement.innerHTML : selectionData.value.translation.replace(/\n/g, '<br>')
    return DOMPurify.sanitize(htmlContent)
  } catch (error) {
    console.error('[SelectionView] Markdown error:', error)
    return DOMPurify.sanitize(selectionData.value.translation.replace(/\n/g, '<br>'))
  }
})

const goBack = () => {
  mobileStore.setView('dashboard')
  mobileStore.setSheetState('peek')
}

const closeView = () => {
  mobileStore.closeSheet()
  mobileStore.resetSelectionData()
}

const speak = () => {
  pageEventBus.emit(MessageActions.GOOGLE_TTS_SPEAK, {
    text: selectionData.value.translation,
    lang: selectionData.value.targetLang
  })
}

const copy = () => {
  const plainText = SimpleMarkdown.strip ? SimpleMarkdown.strip(selectionData.value.translation) : selectionData.value.translation;
  navigator.clipboard.writeText(plainText)
  // Show toast via EventBus (handled by existing notification system)
  pageEventBus.emit(MessageActions.SHOW_NOTIFICATION_SIMPLE, {
    message: 'Translation copied to clipboard',
    type: 'success'
  })
}

const toggleHistory = () => {
  // Navigation to history view can be added later
  pageEventBus.emit(MessageActions.SHOW_NOTIFICATION_SIMPLE, {
    message: 'History feature coming soon to mobile',
    type: 'info'
  })
}
</script>

<style>
.selection-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.selection-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f1f3f5;
}

.back-btn {
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.lang-pair {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f1f3f5;
  padding: 4px 12px;
  border-radius: 20px;
}

.lang {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  color: #495057;
}

.swap-icon {
  width: 14px;
  height: 14px;
  opacity: 0.6;
}

.close-btn {
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
}

.close-btn img {
  width: 20px;
  height: 20px;
  opacity: 0.5;
}

.content-area {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 16px;
}

.original-text {
  font-size: 14px;
  color: #868e96;
  margin-bottom: 16px;
  line-height: 1.4;
  padding: 8px;
  background: #f8f9fa;
  border-radius: 8px;
}

.translated-text {
  font-size: 18px;
  font-weight: 500;
  color: #212529;
  line-height: 1.5;
  text-align: start;
}

.translated-text.markdown-body {
  word-wrap: break-word;
}

.translated-text.markdown-body p {
  margin-bottom: 8px;
}

.translated-text.markdown-body strong {
  font-weight: bold;
}

.translated-text.markdown-body ul, .translated-text.markdown-body ol {
  padding-inline-start: 20px;
  margin-bottom: 8px;
}

.action-bar {
  display: flex;
  justify-content: space-around;
  padding: 12px 0;
  border-top: 1px solid #f1f3f5;
}

.icon-btn {
  background: #f8f9fa;
  border: none;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.icon-btn img {
  width: 20px;
  height: 20px;
  opacity: 0.7;
}

.loading-state, .error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100px;
  color: #868e96;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #339af0;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 8px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Dark Mode */
@media (prefers-color-scheme: dark) {
  .selection-header { border-bottom-color: #333; }
  .back-btn img { filter: invert(1); }
  .lang-pair { background: #2d2d2d; }
  .lang { color: #adb5bd; }
  .close-btn img { filter: invert(1); }
  .original-text { background: #2d2d2d; color: #adb5bd; }
  .translated-text { color: #f8f9fa; }
  .translated-text.markdown-body code { background: rgba(255,255,255,0.1); }
  .action-bar { border-top-color: #333; }
  .icon-btn { background: #2d2d2d; }
  .icon-btn img { filter: invert(1); opacity: 0.8; }
}
</style>
