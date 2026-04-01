<template>
  <div
    class="ti-m-history-view"
    :class="{ 'is-dark': settingsStore.isDarkTheme }"
  >
    <!-- Header -->
    <div class="ti-m-view-header">
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
      <span class="ti-m-header-title" @click="goBack">{{ t('history_title') || 'Translation History' }}</span>
      
      <div
        v-if="hasHistory"
        class="ti-m-header-actions"
      >
        <!-- Native Export Select Container -->
        <div class="ti-m-export-container">
          <div class="ti-m-export-btn">
            <img
              src="@/icons/ui/copy.png"
              :style="exportIconStyle"
            >
            {{ t('SIDEPANEL_EXPORT_HISTORY') || 'Export' }}
          </div>
          
          <!-- Native Select Overlay (Invisible but clickable) -->
          <select 
            class="ti-m-native-select"
            @change="handleNativeExport"
          >
            <option value="" disabled selected>{{ t('SIDEPANEL_EXPORT_HISTORY') || 'Export' }}</option>
            <option value="json_clean">{{ t('SIDEPANEL_EXPORT_JSON_CLEAN') || 'JSON (Clean)' }}</option>
            <option value="json_raw">{{ t('SIDEPANEL_EXPORT_JSON_RAW') || 'JSON (Raw)' }}</option>
            <option value="csv">{{ t('SIDEPANEL_EXPORT_CSV') || 'CSV' }}</option>
            <option value="anki">{{ t('SIDEPANEL_EXPORT_ANKI') || 'Anki' }}</option>
          </select>
        </div>

        <button 
          class="ti-m-clear-all-btn" 
          @click="clearAll"
        >
          {{ t('history_clear_all') || 'Clear All' }}
        </button>
      </div>
    </div>

    <!-- History List -->
    <div class="ti-m-history-list">
      <div
        v-if="isLoading"
        class="ti-m-spinner-container"
      >
        <div class="ti-m-spinner" />
      </div>
      
      <div
        v-else-if="!hasHistory"
        class="ti-m-empty-state"
      >
        <img
          src="@/icons/ui/history.svg"
          class="ti-m-empty-icon"
        >
        <span>{{ t('history_no_history') || 'No translation history yet' }}</span>
      </div>

      <div 
        v-for="(item, index) in historyItems" 
        :key="item.timestamp || index"
        class="ti-m-history-card"
        :style="historyCardStyle"
        @click="selectItem(item)"
      >
        <!-- Card Header: Languages & Delete -->
        <div class="ti-m-card-header">
          <div class="ti-m-lang-badge">
            {{ getLangName(item.sourceLanguage) }} → {{ getLangName(item.targetLanguage) }}
          </div>
          <button 
            class="ti-m-delete-btn"
            @click.stop="(e) => removeItem(index, e)"
          >
            <img
              src="@/icons/ui/trash-small.svg"
              class="ti-m-icon-img-small"
              :style="trashIconStyle"
            >
          </button>
        </div>

        <!-- Card Content -->
        <div 
          class="ti-m-source-preview" 
          :dir="shouldApplyRtl(item.sourceText) ? 'rtl' : 'ltr'"
        >
          {{ item.sourceText }}
        </div>
        <div 
          class="ti-m-target-preview" 
          :dir="shouldApplyRtl(item.translatedText) ? 'rtl' : 'ltr'"
        >
          {{ truncateText(item.translatedText) }}
        </div>
        
        <div class="ti-m-timestamp">
          {{ formatTime(item.timestamp) }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, computed } from 'vue'
import { useI18n } from '@/composables/shared/useI18n.js'
import { useMobileStore } from '@/store/modules/mobile.js'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useHistory } from '@/features/history/composables/useHistory.js'
import { useLanguages } from '@/composables/shared/useLanguages.js'
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js'
import { shouldApplyRtl } from "@/shared/utils/text/textAnalysis.js";
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

const mobileStore = useMobileStore()
const settingsStore = useSettingsStore()
const { t } = useI18n()
const languages = useLanguages()
const logger = getScopedLogger(LOG_COMPONENTS.MOBILE, 'HistoryView')
const { 
  historyItems, 
  isLoading, 
  hasHistory, 
  loadHistory, 
  deleteHistoryItem, 
  clearAllHistory,
  exportHistory,
  formatTime
} = useHistory()

onMounted(async () => {
  await languages.loadLanguages()
  await loadHistory(true)
})

// Truncate long text for display and handle dictionary results
const truncateText = (text, maxLength = 200) => {
  if (!text) return ''
  
  if (text.includes('\n**')) {
    const firstLine = text.split('\n')[0].trim()
    if (firstLine) {
      return firstLine.length > maxLength ? firstLine.substring(0, maxLength) + '...' : firstLine
    }
  }
  
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
}

const getLangName = (code) => {
  return languages.getLanguageName(code) || code
}

// Keep only truly dynamic style computations
const historyCardStyle = computed(() => {
  if (settingsStore.isDarkTheme) {
    return "background: #333333 !important; border: 1px solid #444444 !important; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;";
  }
  return "background: #fcfcfc !important; border: 1px solid #e0e6ed !important; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06) !important;";
});

const trashIconStyle = computed(() => {
  return settingsStore.isDarkTheme 
    ? "width: 16px !important; height: 16px !important; opacity: 0.7 !important; filter: brightness(1.5) !important;"
    : "width: 16px !important; height: 16px !important; opacity: 0.4 !important;";
});

const exportIconStyle = computed(() => {
  const filter = settingsStore.isDarkTheme ? 'invert(1) brightness(2)' : 'none';
  return `width: 14px !important; height: 14px !important; filter: ${filter} !important;`;
});

const handleNativeExport = (event) => {
  const format = event.target.value
  if (format) {
    logger.info('Exporting translation history', { format });
    exportHistory(format)
    event.target.value = ""
  }
}

const goBack = () => {
  mobileStore.navigate(MOBILE_CONSTANTS.VIEWS.DASHBOARD)
}

const removeItem = async (index, event) => {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  logger.debug('Deleting history item');
  await deleteHistoryItem(index)
}

const clearAll = async () => {
  logger.info('Clearing all translation history');
  await clearAllHistory()
}

const selectItem = (item) => {
  logger.info('History item selected for manual translation');
  mobileStore.updateSelectionData({
    text: item.sourceText,
    translation: item.translatedText,
    sourceLang: item.sourceLanguage,
    targetLang: item.targetLanguage
  })
  mobileStore.navigate(MOBILE_CONSTANTS.VIEWS.INPUT)
}
</script>
