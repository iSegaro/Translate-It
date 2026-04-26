<template>
  <div
    class="ti-m-selection-view"
    :class="{ 'is-dark': settingsStore.isDarkTheme }"
  >
    <!-- Header -->
    <div class="ti-m-selection-header">
      <div class="ti-m-header-left">
        <button
          class="ti-m-back-btn"
          @click="goBack"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 6 4"
            fill="none"
          >
            <path
              d="M1 1L3 3L5 1"
              stroke="currentColor"
              stroke-width="0.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <div
          class="ti-m-lang-pair"
          @click="goBack"
        >
          <span class="ti-m-lang-source">{{ sourceName }}</span>
          <img
            src="@/icons/ui/swap.png"
            class="ti-m-swap-icon ti-m-icon-img"
            :alt="t('mobile_swap_languages_alt') || 'to'"
          >
          <span class="ti-m-lang-target">{{ targetName }}</span>
        </div>
      </div>
      
      <div class="ti-m-header-right">
        <button
          class="ti-m-close-btn"
          @click="closeView"
        >
          <img
            src="@/icons/ui/close.png"
            :alt="t('mobile_close_button_alt') || 'Close'"
            class="ti-m-icon-img ti-m-close-icon"
          >
        </button>
      </div>
    </div>

    <div class="ti-m-content-area">
      <!-- Loading State -->
      <div
        v-if="selectionData.isLoading"
        class="ti-m-loading-container"
      >
        <div class="ti-m-spinner" />
        <span>{{ t('mobile_selection_translating_label') || 'Translating...' }}</span>
      </div>
      
      <!-- Combined Result and Original using Shared Component -->
      <div
        v-else
        class="ti-m-results-stack"
      >
        <!-- Result Card -->
        <div class="ti-m-result-wrapper">
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
        >
          <div class="ti-m-original-title">
            {{ t('mobile_selection_source_text_title') || 'Source Text' }}
          </div>
          <div 
            class="ti-m-original-text" 
            :dir="originalDir"
          >
            {{ selectionData.text }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import './SelectionView.scss'
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { useMobileStore } from '@/store/modules/mobile.js'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { pageEventBus } from '@/core/PageEventBus.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'
import { shouldApplyRtl } from "@/shared/utils/text/textAnalysis.js";
import { getTextDirection } from "@/features/element-selection/utils/textDirection.js";
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js'
import { useTTSSmart } from '@/features/tts/composables/useTTSSmart.js'
import { getLanguageNameFromCode } from '@/shared/config/languageConstants.js'
import TranslationDisplay from '@/components/shared/TranslationDisplay.vue'

const mobileStore = useMobileStore()
const settingsStore = useSettingsStore()
const { selectionData, sheetState } = storeToRefs(mobileStore)
const { t } = useUnifiedI18n()
const tts = useTTSSmart()

const sourceName = computed(() => {
  const code = selectionData.value.sourceLang;
  if (!code || code === 'auto') return t('mobile_selection_auto_label') || 'Auto';
  const name = getLanguageNameFromCode(code);
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : code;
});

const targetName = computed(() => {
  const code = selectionData.value.targetLang;
  if (!code) return '';
  const name = getLanguageNameFromCode(code);
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : code;
});

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
