<template>
  <div
    class="ti-m-history-view"
    :class="{ 'is-dark': settingsStore.isDarkTheme }"
    style="display: flex !important; flex-direction: column !important; height: 100% !important; font-family: sans-serif !important; gap: 15px !important; background-color: inherit !important;"
  >
    <!-- Header -->
    <div
      class="ti-m-view-header"
      style="display: flex !important; align-items: center !important; justify-content: space-between !important; padding-bottom: 10px !important; border-bottom: 1px solid var(--ti-mobile-header-border) !important; min-height: 48px !important;"
    >
      <button
        class="ti-m-back-btn"
        style="background: none !important; border: none !important; display: flex !important; align-items: center !important; gap: 8px !important; cursor: pointer !important; padding: 0 !important; height: 44px !important; min-width: 44px !important; -webkit-tap-highlight-color: transparent !important; color: var(--ti-mobile-text) !important;"
        @click="goBack"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 6 4"
          fill="none"
          style="transform: rotate(90deg) !important;"
        >
          <path
            d="M1 1L3 3L5 1"
            stroke="currentColor"
            stroke-width="0.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span
          class="ti-m-header-title"
          style="font-weight: bold !important; font-size: 17px !important; color: var(--ti-mobile-text) !important;"
        >{{ t('history_title') || 'Translation History' }}</span>
      </button>
      
      <div
        v-if="hasHistory"
        style="display: flex !important; gap: 8px !important; align-items: center !important;"
      >
        <!-- Native Export Select Container -->
        <div style="position: relative !important; display: flex !important; align-items: center !important;">
          <div 
            class="ti-m-export-btn"
            style="padding: 6px 10px !important; border-radius: 8px !important; font-size: 12px !important; font-weight: 600 !important; background: var(--ti-mobile-accent-bg) !important; color: var(--ti-mobile-accent) !important; border: 1px solid var(--ti-mobile-accent-bg) !important; display: flex !important; align-items: center !important; gap: 4px !important; pointer-events: none !important;"
          >
            <img
              src="@/icons/ui/copy.png"
              style="width: 14px !important; height: 14px !important; filter: var(--ti-mobile-icon-filter) !important;"
            >
            {{ t('SIDEPANEL_EXPORT_HISTORY') || 'Export' }}
          </div>
          
          <!-- Native Select Overlay (Invisible but clickable) -->
          <select 
            style="position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; opacity: 0 !important; cursor: pointer !important; -webkit-appearance: none !important;"
            @change="handleNativeExport"
          >
            <option
              value=""
              disabled
              selected
            >
              {{ t('SIDEPANEL_EXPORT_HISTORY') || 'Export' }}
            </option>
            <option value="json_clean">
              {{ t('SIDEPANEL_EXPORT_JSON_CLEAN') || 'JSON (Clean)' }}
            </option>
            <option value="json_raw">
              {{ t('SIDEPANEL_EXPORT_JSON_RAW') || 'JSON (Raw)' }}
            </option>
            <option value="csv">
              {{ t('SIDEPANEL_EXPORT_CSV') || 'CSV' }}
            </option>
            <option value="anki">
              {{ t('SIDEPANEL_EXPORT_ANKI') || 'Anki' }}
            </option>
          </select>
        </div>

        <button 
          class="ti-m-clear-all-btn" 
          style="padding: 6px 12px !important; border-radius: 8px !important; font-size: 12px !important; cursor: pointer !important; font-weight: 600 !important; background: var(--ti-mobile-error-bg) !important; color: var(--ti-mobile-error) !important; border: 1px solid var(--ti-mobile-error-bg) !important;"
          @click="clearAll"
        >
          {{ t('history_clear_all') || 'Clear All' }}
        </button>
      </div>
    </div>

    <!-- History List -->
    <div
      class="ti-m-history-list"
      style="flex: 1 !important; overflow-y: auto !important; display: flex !important; flex-direction: column !important; gap: 12px !important; padding-bottom: 20px !important;"
    >
      <div
        v-if="isLoading"
        style="display: flex !important; justify-content: center !important; padding: 40px !important;"
      >
        <div
          class="ti-m-spinner"
          style="width: 28px !important; height: 28px !important; border-radius: 50% !important; border: 3px solid var(--ti-mobile-border) !important; border-top-color: var(--ti-mobile-accent) !important;"
        />
      </div>
      
      <div
        v-else-if="!hasHistory"
        class="ti-m-empty-state"
        style="display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; padding: 60px 20px !important; color: var(--ti-mobile-text-muted) !important; gap: 10px !important; text-align: center !important;"
      >
        <img
          src="@/icons/ui/history.svg"
          class="ti-m-empty-icon"
          style="width: 48px !important; height: 48px !important; opacity: 0.2 !important;"
        >
        <span style="font-size: 15px !important; font-weight: 500 !important;">{{ t('history_no_history') || 'No translation history yet' }}</span>
      </div>

      <div 
        v-for="(item, index) in historyItems" 
        :key="item.timestamp || index"
        class="ti-m-history-card"
        style="border-radius: 12px !important; padding: 12px !important; display: flex !important; flex-direction: column !important; gap: 8px !important; cursor: pointer !important; position: relative !important; box-shadow: 0 2px 4px rgba(0,0,0,0.02) !important; transition: all 0.2s ease !important;"
        @click="selectItem(item)"
      >
        <!-- Card Header: Languages & Delete -->
        <div style="display: flex !important; justify-content: space-between !important; align-items: center !important;">
          <div
            class="ti-m-lang-badge"
            style="padding: 2px 8px !important; border-radius: 6px !important; font-size: 10px !important; font-weight: 800 !important; text-transform: uppercase !important; background: var(--ti-mobile-card-bg) !important; color: var(--ti-mobile-accent) !important; border: 1px solid var(--ti-mobile-border) !important;"
          >
            {{ getLangName(item.sourceLanguage) }} → {{ getLangName(item.targetLanguage) }}
          </div>
          <button 
            class="ti-m-delete-btn"
            style="background: none !important; border: none !important; padding: 8px !important; cursor: pointer !important; display: flex !important; align-items: center !important; justify-content: center !important;"
            @click.stop="removeItem(index)"
          >
            <img
              src="@/icons/ui/trash-small.svg"
              class="ti-m-icon-img-small"
              style="width: 16px !important; height: 16px !important; opacity: 0.4 !important; filter: var(--ti-mobile-icon-filter) !important;"
            >
          </button>
        </div>

        <!-- Card Content -->
        <div 
          class="ti-m-source-preview" 
          :dir="shouldApplyRtl(item.sourceText) ? 'rtl' : 'ltr'"
          style="font-size: 14px !important; font-weight: 500 !important; color: var(--ti-mobile-text-secondary) !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; text-align: start !important;"
        >
          {{ item.sourceText }}
        </div>
        <div 
          class="ti-m-target-preview ti-m-markdown-content" 
          :dir="shouldApplyRtl(item.translatedText) ? 'rtl' : 'ltr'"
          style="font-size: 14px !important; color: var(--ti-mobile-accent) !important; line-height: 1.4 !important; display: -webkit-box !important; -webkit-line-clamp: 3 !important; -webkit-box-orient: vertical !important; overflow: hidden !important; text-align: start !important;"
          v-html="createMarkdownContent(item.translatedText)"
        />
        
        <div
          class="ti-m-timestamp"
          style="font-size: 10px !important; color: var(--ti-mobile-text-muted) !important; margin-top: 2px !important;"
        >
          {{ formatTime(item.timestamp) }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useI18n } from '@/composables/shared/useI18n.js'
import { useMobileStore } from '@/store/modules/mobile.js'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useHistory } from '@/features/history/composables/useHistory.js'
import { useLanguages } from '@/composables/shared/useLanguages.js'
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js'
import { shouldApplyRtl } from "@/shared/utils/text/textAnalysis.js";

const mobileStore = useMobileStore()
const settingsStore = useSettingsStore()
const { t } = useI18n()
const languages = useLanguages()
const { 
  historyItems, 
  isLoading, 
  hasHistory, 
  loadHistory, 
  deleteHistoryItem, 
  clearAllHistory,
  exportHistory,
  formatTime,
  createMarkdownContent
} = useHistory()

onMounted(async () => {
  await languages.loadLanguages()
  await loadHistory(true)
})

const getLangName = (code) => {
  return languages.getLanguageName(code) || code
}

const handleNativeExport = (event) => {
  const format = event.target.value
  if (format) {
    exportHistory(format)
    // Reset selection to placeholder
    event.target.value = ""
  }
}

const goBack = () => {
  mobileStore.navigate(MOBILE_CONSTANTS.VIEWS.DASHBOARD)
}

const removeItem = async (index) => {
  await deleteHistoryItem(index)
}

const clearAll = async () => {
  await clearAllHistory()
}

const selectItem = (item) => {
  // Fill manual input with this history item
  mobileStore.updateSelectionData({
    text: item.sourceText,
    translation: item.translatedText,
    sourceLang: item.sourceLanguage,
    targetLang: item.targetLanguage
  })
  mobileStore.navigate(MOBILE_CONSTANTS.VIEWS.INPUT)
}
</script>

<style scoped>
.ti-m-history-list::-webkit-scrollbar { display: none !important; }
.ti-m-history-list { scrollbar-width: none !important; -ms-overflow-style: none !important; }

.ti-m-history-card {
  background: var(--ti-mobile-bg) !important;
  border: 1px solid var(--ti-mobile-border) !important;
}

.ti-m-history-card:active {
  transform: scale(0.98) !important;
  filter: brightness(0.9) !important;
}

.ti-m-icon-img, .ti-m-icon-img-small, .ti-m-empty-icon {
  object-fit: contain !important;
}

.ti-m-back-icon {
  transform: rotate(90deg) !important;
}

@keyframes spin-mobile { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
.ti-m-spinner { animation: spin-mobile 1s linear infinite !important; }

.ti-m-clear-all-btn {
  background: var(--ti-m-error-bg) !important;
  border: 1px solid var(--ti-m-error-bg) !important;
  color: var(--ti-m-error) !important;
}

.ti-m-menu-item {
  padding: 12px 16px !important;
  background: none !important;
  border: none !important;
  border-bottom: 1px solid var(--ti-mobile-header-border) !important;
  color: var(--ti-mobile-text) !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  text-align: left !important;
  cursor: pointer !important;
  width: 100% !important;
  -webkit-tap-highlight-color: transparent !important;
}

.ti-m-menu-item:last-child {
  border-bottom: none !important;
}

.ti-m-menu-item:active {
  background: var(--ti-mobile-card-bg) !important;
}

.ti-m-lang-badge {
  background: var(--ti-mobile-card-bg) !important;
  color: var(--ti-mobile-text-muted) !important;
}

:deep(.ti-m-markdown-content) p {
  margin: 0 !important;
  padding: 0 !important;
  display: inline;
}

:deep(.ti-m-markdown-content) strong {
  font-weight: 700;
}
</style>