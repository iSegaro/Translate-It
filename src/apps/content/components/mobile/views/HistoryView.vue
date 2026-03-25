<template>
  <div class="history-view" style="display: flex !important; flex-direction: column !important; height: 100% !important; font-family: sans-serif !important; gap: 15px !important;">
    
    <!-- Header -->
    <div class="view-header" :style="`display: flex !important; align-items: center !important; justify-content: space-between !important; padding-bottom: 10px !important; border-bottom: ${settingsStore.isDarkTheme ? '1px solid #333' : '1px solid #eee'} !important; min-height: 48px !important;`" >
      <button @click="goBack" class="back-btn" :style="`background: none !important; border: none !important; display: flex !important; align-items: center !important; gap: 8px !important; cursor: pointer !important; padding: 0 !important; height: 44px !important; min-width: 44px !important; -webkit-tap-highlight-color: transparent !important; color: ${settingsStore.isDarkTheme ? '#adb5bd' : '#333'} !important;`" >
        <img src="@/icons/ui/dropdown-arrow.svg" :alt="t('mobile_back_button_alt') || 'Back'" :style="`width: 20px !important; height: 20px !important; transform: rotate(90deg) !important; opacity: 0.6 !important; ${settingsStore.isDarkTheme ? 'filter: brightness(0) invert(1) !important;' : ''}`" />
        <span class="header-title" :style="`font-weight: bold !important; font-size: 17px !important; color: ${settingsStore.isDarkTheme ? '#adb5bd' : '#333'} !important;`" >{{ t('history_title') || 'Translation History' }}</span>
      </button>
      
      <button 
        v-if="hasHistory"
        @click="clearAll" 
        class="clear-all-btn"
        :style="{ padding: '6px 12px !important', borderRadius: '8px !important', fontSize: '12px !important', cursor: 'pointer !important', fontWeight: '600 !important', background: settingsStore.isDarkTheme ? 'rgba(250, 82, 82, 0.1) !important' : '#fff5f5 !important', border: settingsStore.isDarkTheme ? '1px solid rgba(250, 82, 82, 0.2) !important' : '1px solid #ffe3e3 !important', color: '#fa5252 !important' }"
      >
        {{ t('history_clear_all') || 'Clear All' }}
      </button>
    </div>

    <!-- History List -->
    <div class="history-list" style="flex: 1 !important; overflow-y: auto !important; display: flex !important; flex-direction: column !important; gap: 12px !important; padding-bottom: 20px !important;">
      <div v-if="isLoading" style="display: flex !important; justify-content: center !important; padding: 40px !important;">
        <div class="spinner"></div>
      </div>
      
      <div v-else-if="!hasHistory" class="empty-state" style="display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; padding: 60px 20px !important; color: #adb5bd !important; gap: 10px !important; text-align: center !important;">
        <img src="@/icons/ui/history.svg" :style="{ width: '48px !important', height: '48px !important', opacity: '0.2 !important', filter: settingsStore.isDarkTheme ? 'brightness(0) invert(1) !important' : 'none !important' }" />
        <span style="font-size: 15px !important; font-weight: 500 !important;">{{ t('history_no_history') || 'No translation history yet' }}</span>
      </div>

      <div 
        v-for="(item, index) in historyItems" 
        :key="item.timestamp || index"
        class="history-card"
        @click="selectItem(item)"
        :style="{ background: settingsStore.isDarkTheme ? '#2d2d2d !important' : 'white !important', border: settingsStore.isDarkTheme ? '1px solid #3d3d3d !important' : '1px solid #e9ecef !important', borderRadius: '12px !important', padding: '12px !important', display: 'flex !important', flexDirection: 'column !important', gap: '8px !important', cursor: 'pointer !important', position: 'relative !important', boxShadow: '0 2px 4px rgba(0,0,0,0.02) !important' }"
      >
        <!-- Card Header: Languages & Delete -->
        <div style="display: flex !important; justify-content: space-between !important; align-items: center !important;">
          <div class="lang-badge" :style="{ background: settingsStore.isDarkTheme ? '#3d3d3d !important' : '#f1f3f5 !important', color: settingsStore.isDarkTheme ? '#adb5bd !important' : '#868e96 !important', padding: '2px 8px !important', borderRadius: '6px !important', fontSize: '10px !important', fontWeight: '800 !important', textTransform: 'uppercase !important' }">
            {{ getLangName(item.sourceLanguage) }} → {{ getLangName(item.targetLanguage) }}
          </div>
          <button 
            @click.stop="removeItem(index)"
            style="background: none !important; border: none !important; padding: 8px !important; cursor: pointer !important; display: flex !important; align-items: center !important; justify-content: center !important;"
          >
            <img src="@/icons/ui/trash-small.svg" :style="{ width: '16px !important', height: '16px !important', opacity: '0.4 !important', filter: settingsStore.isDarkTheme ? 'brightness(0) invert(1) !important' : 'none !important' }" />
          </button>
        </div>

        <!-- Card Content -->
        <div 
          class="source-preview" 
          :dir="shouldApplyRtl(item.sourceText) ? 'rtl' : 'ltr'"
          :style="{ fontSize: '14px !important', fontWeight: '500 !important', color: settingsStore.isDarkTheme ? '#dee2e6 !important' : '#495057 !important', whiteSpace: 'nowrap !important', overflow: 'hidden !important', textOverflow: 'ellipsis !important', textAlign: 'start !important' }"
        >
          {{ item.sourceText }}
        </div>
        <div 
          class="target-preview markdown-content" 
          v-html="createMarkdownContent(item.translatedText)"
          :dir="shouldApplyRtl(item.translatedText) ? 'rtl' : 'ltr'"
          :style="{ fontSize: '14px !important', color: settingsStore.isDarkTheme ? '#74c0fc !important' : '#339af0 !important', lineHeight: '1.4 !important', display: '-webkit-box !important', WebkitLineClamp: '3 !important', WebkitBoxOrient: 'vertical !important', overflow: 'hidden !important', textAlign: 'start !important' }"
        >
        </div>
        
        <div class="timestamp" :style="{ fontSize: '10px !important', color: settingsStore.isDarkTheme ? '#868e96 !important' : '#adb5bd !important', marginTop: '2px !important' }">
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
.history-list::-webkit-scrollbar { display: none !important; }
.history-list { scrollbar-width: none !important; -ms-overflow-style: none !important; }
.history-card:active { transform: scale(0.98) !important; filter: brightness(0.9) !important; }

:deep(.markdown-content) p {
  margin: 0 !important;
  padding: 0 !important;
  display: inline;
}

:deep(.markdown-content) strong {
  font-weight: 700;
}
</style>