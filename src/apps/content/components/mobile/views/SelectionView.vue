<template>
  <div class="selection-view" style="display: flex; flex-direction: column; height: 100%; font-family: sans-serif; gap: 12px;">
    
    <!-- Header -->
    <div class="selection-header" style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; border-bottom: 1px solid #f1f3f5; min-height: 48px;">
      <div style="display: flex; align-items: center; gap: 4px;">
        <button class="back-btn" @click="goBack" style="background: none; border: none; width: 44px; height: 44px; padding: 0; cursor: pointer; display: flex; align-items: center; justify-content: center; -webkit-tap-highlight-color: transparent;">
          <img src="@/icons/ui/dropdown-arrow.svg" :alt="t('mobile_back_button_alt') || 'Back'" style="width: 20px !important; height: 20px !important; transform: rotate(90deg); opacity: 0.6;" />
        </button>
        <div class="lang-pair" style="display: flex; align-items: center; gap: 8px; background: #f1f3f5; padding: 6px 14px; border-radius: 20px;">
          <span class="lang" style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #495057;">{{ selectionData.sourceLang && selectionData.sourceLang !== 'auto' ? selectionData.sourceLang : (t('mobile_selection_auto_label') || 'Auto') }}</span>
          <img src="@/icons/ui/swap.png" class="swap-icon" :alt="t('mobile_swap_languages_alt') || 'to'" style="width: 12px !important; height: 12px !important; opacity: 0.5;" />
          <span class="lang" style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #339af0;">{{ selectionData.targetLang }}</span>
        </div>
      </div>
      
      <div style="display: flex; align-items: center;">
        <button class="close-btn" @click="closeView" style="background: none; border: none; width: 44px; height: 44px; padding: 0; cursor: pointer; display: flex; align-items: center; justify-content: center; -webkit-tap-highlight-color: transparent;">
          <img src="@/icons/ui/close.png" :alt="t('mobile_close_button_alt') || 'Close'" style="width: 22px !important; height: 22px !important; opacity: 0.4;" />
        </button>
      </div>
    </div>

    <div class="content-area" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 15px;">
      <!-- Loading State -->
      <div v-if="selectionData.isLoading" class="loading-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 0; color: #adb5bd; gap: 10px;">
        <div class="spinner"></div>
        <span style="font-size: 14px; font-weight: 500;">{{ t('mobile_selection_translating_label') || 'Translating...' }}</span>
      </div>
      
      <!-- Error State handled by TranslationDisplay via error prop -->

      <!-- Combined Result and Original using Shared Component -->
      <div v-else class="translation-result" style="display: flex; flex-direction: column; gap: 12px;">
        
        <!-- Result Card using Shared Component -->
        <div style="width: 100%;">
          <TranslationDisplay
            mode="mobile"
            :content="selectionData.translation"
            :target-language="selectionData.targetLang"
            :is-loading="selectionData.isLoading"
            :error="selectionData.error"
            :copy-title="t('mobile_selection_copy_tooltip') || 'Copy'"
            :tts-title="t('mobile_selection_speak_tooltip') || 'Speak'"
            @text-copied="onTextCopied"
            @tts-started="onSpeak"
            @history-requested="onHistory"
            @content-click="expandSheet"
          />
        </div>

        <!-- Original Text Card (Now smaller and at the bottom) -->
        <div 
          v-if="selectionData.text"
          class="original-card" 
          @click="handleSourceTextClick"
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
import { shouldApplyRtl } from "@/shared/utils/text/textAnalysis.js";
import { getTextDirection } from "@/features/element-selection/utils/textDirection.js";
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js'
import { useTTSSmart } from '@/features/tts/composables/useTTSSmart.js'
import TranslationDisplay from '@/components/shared/TranslationDisplay.vue'

const mobileStore = useMobileStore()
const { selectionData, sheetState } = storeToRefs(mobileStore)
const { t } = useI18n()
const tts = useTTSSmart()

// Automatically expand to full if content is long
watch(() => selectionData.value.translation, (newTranslation) => {
  if (newTranslation && newTranslation.length > 200 && sheetState.value === MOBILE_CONSTANTS.SHEET_STATE.PEEK) {
    mobileStore.setSheetState(MOBILE_CONSTANTS.SHEET_STATE.FULL)
  }
}, { immediate: true })

const originalDir = computed(() => {
  if (!selectionData.value.text) return 'ltr'
  const lang = selectionData.value.sourceLang && selectionData.value.sourceLang !== 'auto' ? selectionData.value.sourceLang : null;
  const direction = getTextDirection(lang, selectionData.value.text)
  return direction === 'rtl' || shouldApplyRtl(selectionData.value.text) ? 'rtl' : 'ltr'
})

const expandSheet = () => {
  if (sheetState.value === MOBILE_CONSTANTS.SHEET_STATE.PEEK) {
    mobileStore.setSheetState(MOBILE_CONSTANTS.SHEET_STATE.FULL)
  }
}

const handleSourceTextClick = () => {
  if (sheetState.value === MOBILE_CONSTANTS.SHEET_STATE.FULL) {
    mobileStore.setView(MOBILE_CONSTANTS.VIEWS.INPUT)
  } else {
    expandSheet()
  }
}

const goBack = () => {
  mobileStore.setView(MOBILE_CONSTANTS.VIEWS.DASHBOARD)
  mobileStore.setSheetState(MOBILE_CONSTANTS.SHEET_STATE.PEEK)
}

const closeView = () => {
  mobileStore.closeSheet()
}

const onSpeak = async (data) => {
  const text = data?.text || selectionData.value.translation;
  const lang = data?.language || selectionData.value.targetLang;
  
  if (text) {
    await tts.speak(text, lang);
  }
}

const onTextCopied = () => {
  pageEventBus.emit(MessageActions.SHOW_NOTIFICATION_SIMPLE, {
    message: t('mobile_selection_copied_message') || 'Translation copied to clipboard',
    type: 'success'
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

/* Dark Mode Support */
@media (prefers-color-scheme: dark) {
  .selection-header { border-bottom-color: #333 !important; }
  .lang-pair { background: #2d2d2d !important; }
  .lang { color: #adb5bd !important; }
  .original-card { background: #2d2d2d !important; border-color: #3d3d3d !important; }
  .original-text { color: #dee2e6 !important; }
}
</style>