<template>
  <div class="history-view" style="display: flex; flex-direction: column; height: 100%; font-family: sans-serif; gap: 15px;">
    
    <!-- Header -->
    <div style="display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px solid #eee; min-height: 48px;">
      <button @click="goBack" style="background: none; border: none; display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 0; height: 44px; min-width: 44px; -webkit-tap-highlight-color: transparent;">
        <img src="@/icons/ui/dropdown-arrow.svg" :alt="t('mobile_back_button_alt') || 'Back'" style="width: 20px; height: 20px; transform: rotate(90deg); opacity: 0.6;" />
        <span style="font-weight: bold; font-size: 17px; color: #333;" class="header-title">{{ t('history_title') || 'Translation History' }}</span>
      </button>
      
      <button 
        v-if="hasHistory"
        @click="clearAll" 
        style="background: #fff5f5; border: 1px solid #ffe3e3; padding: 6px 12px; border-radius: 8px; font-size: 12px; color: #fa5252; cursor: pointer; font-weight: 600;"
      >
        {{ t('history_clear_all') || 'Clear All' }}
      </button>
    </div>

    <!-- History List -->
    <div class="history-list" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding-bottom: 20px;">
      <div v-if="isLoading" class="loading-state" style="display: flex; justify-content: center; padding: 40px;">
        <div class="spinner"></div>
      </div>
      
      <div v-else-if="!hasHistory" class="empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; color: #adb5bd; gap: 10px; text-align: center;">
        <img src="@/icons/ui/history.svg" style="width: 48px; height: 48px; opacity: 0.2;" />
        <span style="font-size: 15px; font-weight: 500;">{{ t('history_no_history') || 'No translation history yet' }}</span>
      </div>

      <div 
        v-for="(item, index) in historyItems" 
        :key="item.timestamp || index"
        class="history-card"
        @click="selectItem(item)"
        style="background: white; border: 1px solid #e9ecef; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 8px; cursor: pointer; position: relative; box-shadow: 0 2px 4px rgba(0,0,0,0.02);"
      >
        <!-- Card Header: Languages & Delete -->
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div class="lang-badge" style="background: #f1f3f5; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 800; color: #868e96; text-transform: uppercase;">
            {{ getLangName(item.sourceLanguage) }} → {{ getLangName(item.targetLanguage) }}
          </div>
          <button 
            @click.stop="removeItem(index)"
            style="background: none; border: none; padding: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center;"
          >
            <img src="@/icons/ui/trash-small.svg" style="width: 16px; height: 16px; opacity: 0.4;" />
          </button>
        </div>

        <!-- Card Content -->
        <div 
          class="source-preview" 
          :dir="shouldApplyRtl(item.sourceText) ? 'rtl' : 'ltr'"
          style="font-size: 14px; color: #495057; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: start;"
        >
          {{ item.sourceText }}
        </div>
        <div 
          class="target-preview markdown-content" 
          v-html="createMarkdownContent(item.translatedText)"
          :dir="shouldApplyRtl(item.translatedText) ? 'rtl' : 'ltr'"
          style="font-size: 14px; color: #339af0; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; text-align: start;"
        >
        </div>
        
        <div class="timestamp" style="font-size: 10px; color: #adb5bd; margin-top: 2px;">
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
import { useHistory } from '@/features/history/composables/useHistory.js'
import { useLanguages } from '@/composables/shared/useLanguages.js'
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js'
import { shouldApplyRtl } from "@/shared/utils/text/textAnalysis.js";

const mobileStore = useMobileStore()
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
.history-card:active {
  background-color: #f8f9fa !important;
  transform: scale(0.98);
}

.history-list::-webkit-scrollbar {
  display: none;
}

:deep(.markdown-content) p {
  margin: 0 !important;
  padding: 0 !important;
  display: inline;
}

:deep(.markdown-content) strong {
  font-weight: 700;
}

@media (prefers-color-scheme: dark) {
  .header-title { color: #adb5bd !important; }
  .history-card { 
    background: #2d2d2d !important; 
    border-color: #3d3d3d !important; 
  }
  .lang-badge { background: #3d3d3d !important; color: #adb5bd !important; }
  .source-preview { color: #dee2e6 !important; }
  .target-preview { color: #74c0fc !important; }
  .timestamp { color: #868e96 !important; }
  .history-card:active { background-color: #333 !important; }
}
</style>