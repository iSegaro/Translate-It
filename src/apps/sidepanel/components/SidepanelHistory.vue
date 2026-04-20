<template>
  <div
    id="historyPanel"
    class="history-panel"
    :class="{ 'ti-active': isVisible }"
  >
    <div class="history-header">
      <h3>{{ t('SIDEPANEL_HISTORY_TITLE') || 'Translation History' }}</h3>
      <button
        id="closeHistoryBtn"
        class="close-btn"
        @click="handleClose"
        @keydown.enter.prevent="handleClose"
        @keydown.space.prevent="handleClose"
      >
        ✕
      </button>
    </div>
    <div
      id="historyList"
      class="history-list"
    >
      <template v-if="isLoading">
        <div class="loading-message">
          Loading history...
        </div>
      </template>
      <template v-else-if="historyError">
        <div class="error-message">
          {{ historyError }}
        </div>
      </template>
      <template v-else-if="!hasHistory">
        <div class="empty-message">
          No translation history yet
        </div>
      </template>
      <template v-else>
        <div
          v-for="item in formattedHistoryItems"
          :key="item.index"
          class="history-item"
          @click="handleHistoryItemClick(item)"
        >
          <div class="history-item-header">
            <div class="language-info">
              <span class="language-pair">{{ item.sourceLanguageName }} → {{ item.targetLanguageName }}</span>
            </div>
            <div class="history-item-actions">
              <span class="timestamp">{{ item.formattedTime }}</span>
              <button
                class="delete-btn"
                :title="t('history_delete_item') || 'Delete this item'"
                @click.stop="handleDeleteHistoryItem(item.index, $event)"
              >
                <img
                  src="@/icons/ui/trash-small.svg"
                  :alt="t('history_delete') || 'Delete'"
                  class="delete-icon"
                >
              </button>
            </div>
          </div>
          <div class="history-item-content">
            <div 
              class="source-text"
              :dir="shouldApplyRtl(item.sourceText) ? 'rtl' : 'ltr'"
            >
              {{ truncateText(item.sourceText) || '[No source text]' }}
            </div>
            <div class="arrow">
              ↓
            </div>
            <div 
              class="translated-text"
              :dir="shouldApplyRtl(item.translatedText) ? 'rtl' : 'ltr'"
            >
              {{ truncateText(item.translatedText) || '[No translation]' }}
            </div>
          </div>
        </div>
      </template>
    </div>
    <!-- Footer with clear all button -->
    <div class="history-footer">
      <BaseDropdown 
        position="top-start" 
        size="sm"
        :disabled="!hasHistory"
        :dir="t('IsRTL') === 'true' ? 'rtl' : 'ltr'"
      >
        <template #trigger="{ toggle }">
          <button
            class="export-btn"
            :title="t('SIDEPANEL_EXPORT_HISTORY_TOOLTIP') || 'Export history data'"
            :disabled="!hasHistory"
            @click.stop="toggle"
          >
            <img
              src="@/icons/ui/copy.png"
              alt="Export"
              class="export-icon"
            >
            <span>{{ t('SIDEPANEL_EXPORT_HISTORY') || 'Export' }}</span>
          </button>
        </template>
        
        <template #default="{ close }">
          <button
            class="dropdown-item"
            @click="handleExportHistory('json_clean'); close()"
          >
            {{ t('SIDEPANEL_EXPORT_JSON_CLEAN') || 'Export as JSON (Clean)' }}
          </button>
          <button
            class="dropdown-item"
            @click="handleExportHistory('json_raw'); close()"
          >
            {{ t('SIDEPANEL_EXPORT_JSON_RAW') || 'Export as JSON (Raw)' }}
          </button>
          <button
            class="dropdown-item"
            @click="handleExportHistory('csv'); close()"
          >
            {{ t('SIDEPANEL_EXPORT_CSV') || 'Export as CSV' }}
          </button>
          <button
            class="dropdown-item"
            @click="handleExportHistory('anki'); close()"
          >
            {{ t('SIDEPANEL_EXPORT_ANKI') || 'Export for Anki' }}
          </button>
        </template>
      </BaseDropdown>

      <button
        id="clearAllHistoryBtn"
        class="clear-all-btn"
        :title="t('SIDEPANEL_CLEAR_ALL_HISTORY_TOOLTIP')"
        :disabled="!hasHistory"
        @click="handleClearAllHistory"
      >
        <img
          src="@/icons/ui/trash.svg"
          :alt="t('history_delete') || 'Delete'"
          class="clear-all-icon"
        >
        <span>{{ t('SIDEPANEL_CLEAR_ALL_HISTORY') || 'Clear All History' }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import './SidepanelHistory.scss'
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { useHistory } from '@/features/history/composables/useHistory.js'
import { useUI } from '@/composables/ui/useUI.js'
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { useLanguages } from '@/composables/shared/useLanguages.js'
import { shouldApplyRtl } from "@/shared/utils/text/textAnalysis.js";
import BaseDropdown from '@/components/base/BaseDropdown.vue'
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'SidepanelHistory');

// Resource tracker for automatic cleanup

const { handleError } = useErrorHandler()
const { t } = useUnifiedI18n()
const languages = useLanguages()

// Extract text content from various data types
const extractTextContent = (content) => {
  if (!content) return ''
  
  // For current history format, content is already string
  if (typeof content === 'string') {
    return content
  }
  
  // Convert numbers to string
  if (typeof content === 'number') {
    return String(content)
  }
  
  // Handle legacy DOM elements (if any exist)
  if (content && typeof content === 'object' && 'textContent' in content) {
    return content.textContent || ''
  }
  
  // Handle objects with text properties
  if (content && typeof content === 'object' && 'text' in content) {
    return content.text
  }
  
  // Fallback: convert to string
  return String(content || '')
}

// Truncate long text for display
const truncateText = (text, maxLength = 100) => {
  if (!text) return ''
  
  // For dictionary results, extract just the main translation (first line)
  if (text.includes('\n**')) {
    const firstLine = text.split('\n')[0].trim()
    if (firstLine) {
      return firstLine.length > maxLength ? firstLine.substring(0, maxLength) + '...' : firstLine
    }
  }
  
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
}

// Props
const props = defineProps({
  isVisible: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits(['close', 'selectHistoryItem', 'update:isVisible'])

// Composables
const { 
  historyItems,
  sortedHistoryItems,
  hasHistory,
  isLoading,
  historyError,
  deleteHistoryItem,
  clearAllHistory,
  exportHistory,
  formatTime,
  createMarkdownContent,
  loadHistory
} = useHistory()

const { showVisualFeedback } = useUI()

// Local state
const isClosing = ref(false)

// Computed
const isVisible = computed(() => props.isVisible)

const formattedHistoryItems = computed(() => {
  return sortedHistoryItems.value.map((item, index) => {
    // Handle different field names from different sources (background uses originalText)
    const rawSourceText = item.sourceText || item.originalText || ''
    const rawTranslatedText = item.translatedText || ''
    
    const processedSourceText = extractTextContent(rawSourceText)
    const processedTranslatedText = extractTextContent(rawTranslatedText)
    
    return {
      ...item,
      index,
      formattedTime: formatTime(item.timestamp),
      sourceLanguageName: languages.getLanguageName(item.sourceLanguage) || item.sourceLanguage,
      targetLanguageName: languages.getLanguageName(item.targetLanguage) || item.targetLanguage,
      markdownContent: createMarkdownContent(processedTranslatedText),
      // Ensure we have normalized field names
      sourceText: processedSourceText,
      translatedText: processedTranslatedText
    }
  })
})

// Handle close button click
const handleClose = () => {
  isClosing.value = true

  // Emit both events to ensure proper closing
  emit('update:isVisible', false)
  emit('close')

  // Set isClosing back to false after animation
  setTimeout(() => {
    isClosing.value = false
  }, 300)
}

// Handle clear all history
const handleClearAllHistory = async () => {
  try {
    const cleared = await clearAllHistory()
    
    if (cleared) {
      const button = document.getElementById('clearAllHistoryBtn')
      showVisualFeedback(button, 'success')
      logger.debug('[SidepanelHistory] All history cleared')
    }
  } catch (error) {
    await handleError(error, 'sidepanel-history-clear-all')
    const button = document.getElementById('clearAllHistoryBtn')
    showVisualFeedback(button, 'error')
  }
}

// Handle export history
const handleExportHistory = (format) => {
  try {
    exportHistory(format)
    logger.debug(`[SidepanelHistory] History exported as ${format}`)
  } catch (error) {
    handleError(error, 'sidepanel-history-export')
  }
}

// Handle history item click
const handleHistoryItemClick = (item) => {
  const historyData = {
    sourceText: item.sourceText, // Already processed in formattedHistoryItems
    translatedText: item.translatedText, // Full translation including dictionary
    sourceLanguage: item.sourceLanguage,
    targetLanguage: item.targetLanguage
  }
  
  emit('selectHistoryItem', historyData)
  logger.debug('[SidepanelHistory] History item selected:', historyData)
  
  // Visual feedback
  const itemElement = document.querySelector(`[data-history-index="${item.index}"]`)
  if (itemElement) {
    showVisualFeedback(itemElement, 'success', 400)
  }
}

// Handle delete history item
const handleDeleteHistoryItem = async (index, event) => {
  event.stopPropagation() // Prevent item click
  
  try {
    await deleteHistoryItem(index)
    
    const button = event.target.closest('.delete-btn')
    if (button) {
      showVisualFeedback(button, 'success', 400)
    }
    
  logger.debug(`[SidepanelHistory] History item ${index} deleted`)
  } catch (error) {
    await handleError(error, 'sidepanel-history-delete-item')
    const button = event.target.closest('.delete-btn')
    if (button) {
      showVisualFeedback(button, 'error')
    }
  }
}

// Render history items
const renderHistoryItems = () => {
  // No longer manually rendering, Vue will handle it
  logger.debug('[SidepanelHistory] Finished rendering', formattedHistoryItems.value.length, 'items')
}

// Initialize component
const initialize = async () => {
  try {
    await languages.loadLanguages();
    await loadHistory()
    renderHistoryItems()
    
    logger.debug('[SidepanelHistory] Component initialized')
  } catch (error) {
    await handleError(error, 'sidepanel-history-init')
  }
}

// Watch for visibility changes
watch(isVisible, async (visible) => {
  if (visible) {
    // Force reload history when panel becomes visible
    await loadHistory()
    await nextTick()
    renderHistoryItems()
  }
})

// Watch for history changes
watch(historyItems, () => {
  renderHistoryItems()
}, { deep: true })

// Watch for loading state changes
watch(isLoading, () => {
  renderHistoryItems()
})

// Watch for error changes
watch(historyError, () => {
  renderHistoryItems() 
})

// Lifecycle
onMounted(() => {
  initialize()
})

onUnmounted(() => {
  // No cleanup needed, Vue handles event listeners automatically
});
</script>
