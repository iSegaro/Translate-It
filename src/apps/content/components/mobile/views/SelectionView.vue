<template>
  <div class="selection-view" style="display: flex; flex-direction: column; height: 100%; font-family: sans-serif; gap: 12px;">
    
    <!-- Header -->
    <div class="selection-header" style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; border-bottom: 1px solid #f1f3f5;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <button class="back-btn" @click="goBack" style="background: none; border: none; padding: 4px; cursor: pointer; display: flex; align-items: center;">
          <img src="@/icons/ui/dropdown-arrow.svg" :alt="t('mobile_back_button_alt') || 'Back'" style="width: 18px !important; height: 18px !important; transform: rotate(90deg); opacity: 0.6;" />
        </button>
        <div class="lang-pair" style="display: flex; align-items: center; gap: 6px; background: #f1f3f5; padding: 4px 12px; border-radius: 20px;">
          <span class="lang" style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #495057;">{{ selectionData.sourceLang && selectionData.sourceLang !== 'auto' ? selectionData.sourceLang : (t('mobile_selection_auto_label') || 'Auto') }}</span>
          <img src="@/icons/ui/swap.png" class="swap-icon" :alt="t('mobile_swap_languages_alt') || 'to'" style="width: 12px !important; height: 12px !important; opacity: 0.5;" />
          <span class="lang" style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #339af0;">{{ selectionData.targetLang }}</span>
        </div>
      </div>
      
      <div style="display: flex; align-items: center; gap: 10px;">
        <button class="close-btn" @click="closeView" style="background: none; border: none; padding: 4px; cursor: pointer; display: flex; align-items: center;">
          <img src="@/icons/ui/close.png" :alt="t('mobile_close_button_alt') || 'Close'" style="width: 20px !important; height: 20px !important; opacity: 0.4;" />
        </button>
      </div>
    </div>

    <div class="content-area" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 15px;">
      <!-- Loading State -->
      <div v-if="selectionData.isLoading" class="loading-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 0; color: #adb5bd; gap: 10px;">
        <div class="spinner"></div>
        <span style="font-size: 14px; font-weight: 500;">{{ t('mobile_selection_translating_label') || 'Translating...' }}</span>
      </div>
      
      <!-- Error State -->
      <div v-else-if="selectionData.error" class="error-state" style="background: #fff5f5; border: 1px solid #ffe3e3; border-radius: 12px; padding: 15px; color: #fa5252; font-size: 14px; text-align: center;">
        <p style="margin: 0;">{{ selectionData.error }}</p>
      </div>

      <!-- Success State -->
      <div v-else class="translation-result" style="display: flex; flex-direction: column; gap: 12px;">
        <!-- Translated Text Card (Moved to TOP for better visibility) -->
        <div 
          v-if="selectionData.translation" 
          class="result-card" 
          @click="expandSheet"
          style="background: #e7f5ff; border: 1px solid #d0ebff; border-radius: 12px; padding: 15px; animation: slideIn 0.3s ease; display: flex; flex-direction: column; gap: 8px; cursor: pointer;"
        >
          <div style="font-size: 10px; font-weight: 800; color: #74c0fc; text-transform: uppercase; letter-spacing: 0.5px;">{{ t('mobile_selection_translation_title') || 'Translation' }}</div>
          <div 
            class="translated-text markdown-body" 
            :dir="detectedDir"
            style="font-size: 17px; color: #1c7ed6; line-height: 1.6; text-align: start;"
            v-html="sanitizedResult"
          ></div>
          
          <!-- Quick Actions In Card -->
          <div style="display: flex; gap: 10px; margin-top: 10px; padding-top: 12px; border-top: 1px solid rgba(51, 154, 240, 0.1);" @click.stop>
            <button class="action-btn" @click="speak" :title="t('mobile_selection_speak_tooltip') || 'Speak'">
              <img src="@/icons/ui/speaker.png" :alt="t('mobile_speak_button_alt') || 'Speak'" style="width: 16px !important; height: 16px !important;" />
            </button>
            <button class="action-btn" @click="copy" :title="t('mobile_selection_copy_tooltip') || 'Copy'">
              <img src="@/icons/ui/copy.png" :alt="t('mobile_copy_button_alt') || 'Copy'" style="width: 16px !important; height: 16px !important;" />
            </button>
            <button class="action-btn" @click="toggleHistory" :title="t('mobile_selection_history_tooltip') || 'History'">
              <img src="@/icons/ui/history.svg" :alt="t('mobile_history_button_alt') || 'History'" style="width: 16px !important; height: 16px !important;" />
            </button>
          </div>
        </div>

        <!-- Original Text Card (Moved to BOTTOM) -->
        <div 
          class="original-card" 
          @click="expandSheet"
          style="background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 6px; cursor: pointer;"
        >
          <div style="font-size: 10px; font-weight: 800; color: #adb5bd; text-transform: uppercase; letter-spacing: 0.5px;">{{ t('mobile_selection_source_text_title') || 'Source Text' }}</div>
          <div 
            class="original-text" 
            :dir="originalDir"
            style="font-size: 14px; color: #495057; line-height: 1.5; text-align: start; word-wrap: break-word;"
          >
            {{ selectionData.text }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from '@/composables/shared/useI18n.js'
import { useMobileStore } from '@/store/modules/mobile.js'
import { pageEventBus } from '@/core/PageEventBus.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'
import { SimpleMarkdown } from "@/shared/utils/text/markdown.js";
import { shouldApplyRtl } from "@/shared/utils/text/textAnalysis.js";
import { getTextDirection } from "@/features/element-selection/utils/textDirection.js";
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js'
import DOMPurify from "dompurify";

const mobileStore = useMobileStore()
const { selectionData, sheetState } = storeToRefs(mobileStore)
const { t } = useI18n()

// Automatically expand to full if content is long
watch(() => selectionData.value.translation, (newTranslation) => {
  if (newTranslation && newTranslation.length > 200 && sheetState.value === MOBILE_CONSTANTS.SHEET_STATE.PEEK) {
    mobileStore.setSheetState(MOBILE_CONSTANTS.SHEET_STATE.FULL)
  }
}, { immediate: true })

const detectedDir = computed(() => {
  if (!selectionData.value.translation) return 'ltr'
  const direction = getTextDirection(selectionData.value.targetLang, selectionData.value.translation)
  return direction === 'rtl' || shouldApplyRtl(selectionData.value.translation) ? 'rtl' : 'ltr'
})

const originalDir = computed(() => {
  if (!selectionData.value.text) return 'ltr'
  const lang = selectionData.value.sourceLang && selectionData.value.sourceLang !== 'auto' ? selectionData.value.sourceLang : null;
  const direction = getTextDirection(lang, selectionData.value.text)
  return direction === 'rtl' || shouldApplyRtl(selectionData.value.text) ? 'rtl' : 'ltr'
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

const expandSheet = () => {
  if (sheetState.value === MOBILE_CONSTANTS.SHEET_STATE.PEEK) {
    mobileStore.setSheetState(MOBILE_CONSTANTS.SHEET_STATE.FULL)
  }
}

const goBack = () => {
  mobileStore.setView(MOBILE_CONSTANTS.VIEWS.DASHBOARD)
  mobileStore.setSheetState(MOBILE_CONSTANTS.SHEET_STATE.PEEK)
}

const closeView = () => {
  mobileStore.closeSheet()
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
  pageEventBus.emit(MessageActions.SHOW_NOTIFICATION_SIMPLE, {
    message: t('mobile_selection_copied_message') || 'Translation copied to clipboard',
    type: 'success'
  })
}

const toggleHistory = () => {
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

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #339af0;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.action-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid rgba(51, 154, 240, 0.2);
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn:active {
  transform: scale(0.9);
  background: #f1f3f5;
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

/* Dark Mode Support */
@media (prefers-color-scheme: dark) {
  .selection-header { border-bottom-color: #333 !important; }
  .lang-pair { background: #2d2d2d !important; }
  .lang { color: #adb5bd !important; }
  .original-card { background: #2d2d2d !important; border-color: #3d3d3d !important; }
  .original-text { color: #dee2e6 !important; }
  .result-card { background: rgba(28, 126, 214, 0.15) !important; border-color: rgba(28, 126, 214, 0.3) !important; }
  .translated-text { color: #74c0fc !important; }
  .action-btn { background: #2d2d2d !important; border-color: #444 !important; }
  .action-btn img { filter: invert(0.8); }
  .translated-text.markdown-body code { background: rgba(255,255,255,0.1); }
}
</style>
