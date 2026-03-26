<template>
  <div class="ti-m-selection-view" style="display: flex !important; flex-direction: column !important; height: 100% !important; font-family: sans-serif !important; gap: 12px !important; background-color: inherit !important;">
    
    <!-- Header -->
    <div class="ti-m-selection-header" style="display: flex !important; justify-content: space-between !important; align-items: center !important; padding-bottom: 12px !important; min-height: 48px !important; border-bottom: 1px solid var(--ti-mobile-header-border) !important;">
      <div style="display: flex !important; align-items: center !important; gap: 4px !important;">
        <button class="ti-m-back-btn" @click="goBack" style="background: none !important; border: none !important; width: 44px !important; height: 44px !important; padding: 0 !important; cursor: pointer !important; display: flex !important; align-items: center !important; justify-content: center !important; -webkit-tap-highlight-color: transparent !important;">
          <img src="@/icons/ui/dropdown-arrow.svg" :alt="t('mobile_back_button_alt') || 'Back'" class="ti-m-icon-img ti-m-back-icon" style="width: 20px !important; height: 20px !important; transform: rotate(90deg) !important; opacity: 0.6 !important;" />
        </button>
        <div class="ti-m-lang-pair" style="display: flex !important; align-items: center !important; gap: 8px !important; padding: 6px 14px !important; border-radius: 20px !important; background-color: var(--ti-mobile-card-bg) !important;">
          <span style="font-size: 11px !important; font-weight: 800 !important; text-transform: uppercase !important; color: var(--ti-mobile-accent) !important;">{{ selectionData.targetLang }}</span>
          <img src="@/icons/ui/swap.png" class="ti-m-swap-icon ti-m-icon-img" :alt="t('mobile_swap_languages_alt') || 'to'" style="width: 12px !important; height: 12px !important; opacity: 0.5 !important;" />
          <span class="ti-m-lang-source" style="font-size: 11px !important; font-weight: 800 !important; text-transform: uppercase !important; color: var(--ti-mobile-text-secondary) !important;">{{ selectionData.sourceLang && selectionData.sourceLang !== 'auto' ? selectionData.sourceLang : (t('mobile_selection_auto_label') || 'Auto') }}</span>
        </div>
      </div>
      
      <div style="display: flex !important; align-items: center !important;">
        <button class="ti-m-close-btn" @click="closeView" style="background: none !important; border: none !important; width: 44px !important; height: 44px !important; padding: 0 !important; cursor: pointer !important; display: flex !important; align-items: center !important; justify-content: center !important; -webkit-tap-highlight-color: transparent !important;">
          <img src="@/icons/ui/close.png" :alt="t('mobile_close_button_alt') || 'Close'" class="ti-m-icon-img ti-m-close-icon" style="width: 22px !important; height: 22px !important; opacity: 0.4 !important;" />
        </button>
      </div>
    </div>

    <div class="ti-m-content-area" style="flex: 1 !important; overflow-y: auto !important; display: flex !important; flex-direction: column !important; gap: 15px !important;">
      <!-- Loading State -->
      <div v-if="selectionData.isLoading" style="display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; padding: 40px 0 !important; color: var(--ti-mobile-text-muted) !important; gap: 10px !important;">
        <div class="ti-m-spinner" style="width: 28px !important; height: 28px !important; border-radius: 50% !important; border: 3px solid var(--ti-mobile-border) !important; border-top-color: var(--ti-mobile-accent) !important;"></div>
        <span style="font-size: 14px !important; font-weight: 500 !important;">{{ t('mobile_selection_translating_label') || 'Translating...' }}</span>
      </div>
      
      <!-- Combined Result and Original using Shared Component -->
      <div v-else style="display: flex !important; flex-direction: column !important; gap: 12px !important;">
        
        <!-- Result Card -->
        <div style="width: 100% !important;">
          <TranslationDisplay
            mode="mobile"
            :content="selectionData.translation"
            :target-language="selectionData.targetLang"
            :is-loading="selectionData.isLoading"
            :tts-status="tts.ttsState.value"
            :error="selectionData.error"
            :copy-title="t('mobile_selection_copy_tooltip') || 'Copy'"
            :tts-title="t('mobile_selection_speak_tooltip') || 'Speak'"
            @text-copied="onTextCopied"
            @tts-started="onSpeak"
            @tts-stopped="tts.stop()"
            @history-requested="onHistory"
            @content-click="expandSheet"
          />
        </div>

        <!-- Original Text Card -->
        <div 
          v-if="selectionData.text"
          class="ti-m-original-card" 
          @click="handleSourceTextClick"
          style="border: 1px solid var(--ti-mobile-border) !important; border-radius: 12px !important; padding: 12px !important; display: flex !important; flex-direction: column !important; gap: 6px !important; cursor: pointer !important; background: var(--ti-mobile-card-bg) !important;"
        >
          <div style="font-size: 10px !important; font-weight: 800 !important; color: var(--ti-mobile-text-muted) !important; text-transform: uppercase !important; letter-spacing: 0.5px !important;">{{ t('mobile_selection_source_text_title') || 'Source Text' }}</div>
          <div 
            class="ti-m-original-text" 
            :dir="originalDir"
            style="font-size: 14px !important; line-height: 1.5 !important; text-align: start !important; word-wrap: break-word !important; color: var(--ti-mobile-text-secondary) !important;"
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

const expandSheet = () => { if (sheetState.value === MOBILE_CONSTANTS.SHEET_STATE.PEEK) mobileStore.setSheetState(MOBILE_CONSTANTS.SHEET_STATE.FULL) }
const handleSourceTextClick = () => { if (sheetState.value === MOBILE_CONSTANTS.SHEET_STATE.FULL) mobileStore.navigate(MOBILE_CONSTANTS.VIEWS.INPUT); else expandSheet() }
const goBack = () => { mobileStore.navigate(MOBILE_CONSTANTS.VIEWS.DASHBOARD) }
const closeView = () => { mobileStore.closeSheet() }
const onSpeak = async (data) => { const text = data?.text || selectionData.value.translation; const lang = data?.language || selectionData.value.targetLang; if (text) await tts.speak(text, lang); }
const onTextCopied = () => { pageEventBus.emit(MessageActions.SHOW_NOTIFICATION_SIMPLE, { message: t('mobile_selection_copied_message') || 'Copied', type: 'success' }) }
const onHistory = () => { mobileStore.navigate(MOBILE_CONSTANTS.VIEWS.HISTORY) }
</script>

<style scoped>
@keyframes spin-mobile { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
.ti-m-spinner { animation: spin-mobile 1s linear infinite !important; }

.ti-m-icon-img {
  object-fit: contain !important;
  filter: var(--ti-mobile-icon-filter) !important;
}
</style>