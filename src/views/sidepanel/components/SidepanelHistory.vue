<template>
  <div
    id="historyPanel"
    class="history-panel"
  >
    <div class="history-header">
      <h3 :data-i18n="$i18n('SIDEPANEL_HISTORY_TITLE')">
        Translation History
      </h3>
      <button
        id="closeHistoryBtn"
        class="close-btn"
        @click="handleClose"
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
                title="Delete this item"
                @click.stop="handleDeleteHistoryItem(item.index, $event)"
              >
                <img
                  src="@/assets/icons/trash-small.svg"
                  alt="Delete"
                  class="delete-icon"
                >
              </button>
            </div>
          </div>
          <div class="history-item-content">
            <div class="source-text">
              {{ truncateText(item.sourceText) || '[No source text]' }}
            </div>
            <div class="arrow">
              ↓
            </div>
            <div class="translated-text">
              {{ truncateText(item.translatedText) || '[No translation]' }}
            </div>
          </div>
        </div>
      </template>
    </div>
    <!-- Footer with clear all button -->
    <div class="history-footer">
      <button
        id="clearAllHistoryBtn"
        class="clear-all-btn"
        :title="$i18n('SIDEPANEL_CLEAR_ALL_HISTORY_TOOLTIP')"
        @click="handleClearAllHistory"
      >
        <img
          src="@assets/icons/trash.svg"
          alt="Clear All"
          class="clear-all-icon"
        >
        <span :data-i18n="$i18n('SIDEPANEL_CLEAR_ALL_HISTORY')">Clear All History</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { useHistory } from '@/composables/useHistory.js'
import { useUI } from '@/composables/useUI.js'
import { useErrorHandler } from '@/composables/useErrorHandler.js'
import { languageList } from '@/utils/i18n/languages.js'
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'SidepanelHistory');


const { handleError } = useErrorHandler()

// Helper function
const getLanguageNameByCode = (code) => {
  const lang = languageList.find(l => l.code === code)
  return lang?.name || code
}

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
  formatTime,
  createMarkdownContent,
  loadHistory
} = useHistory()

const { showVisualFeedback } = useUI()

// Template refs
const historyPanel = ref(null)
const historyList = ref(null)

// Local state
const isClosing = ref(false)

// Computed
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
      sourceLanguageName: getLanguageNameByCode(item.sourceLanguage) || item.sourceLanguage,
      targetLanguageName: getLanguageNameByCode(item.targetLanguage) || item.targetLanguage,
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
  
  // Emit update:isVisible to sync with parent (SidepanelLayout)
  emit('update:isVisible', false)
  logger.debug('[SidepanelHistory] handleClose: Emitting update:isVisible(false)')
  
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

// Setup event listeners
const setupEventListeners = () => {
  const closeBtn = document.getElementById('closeHistoryBtn')
  if (closeBtn) {
    closeBtn.addEventListener('click', handleClose)
  }

  const clearAllBtn = document.getElementById('clearAllHistoryBtn')
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', handleClearAllHistory)
  }
}

// Cleanup event listeners
const cleanupEventListeners = () => {
  const closeBtn = document.getElementById('closeHistoryBtn')
  if (closeBtn) {
    closeBtn.removeEventListener('click', handleClose)
  }

  const clearAllBtn = document.getElementById('clearAllHistoryBtn')
  if (clearAllBtn) {
    clearAllBtn.removeEventListener('click', handleClearAllHistory)  
  }
}

// Initialize component
const initialize = async () => {
  try {
    historyPanel.value = document.getElementById('historyPanel')
    historyList.value = document.getElementById('historyList')
    
    setupEventListeners()
    await loadHistory()
    renderHistoryItems()
    
  logger.debug('[SidepanelHistory] Component initialized')
  } catch (error) {
    await handleError(error, 'sidepanel-history-init')
  }
}

// Watch for visibility changes
watch(() => props.isVisible, async (visible) => {
  if (historyPanel.value) {
    historyPanel.value.classList.toggle('active', visible)
    
    if (visible) {
      await loadHistory()
      await nextTick()
      renderHistoryItems()
    }
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
  cleanupEventListeners()
});
</script>

<style lang="scss" scoped>
@use "@/assets/styles/variables.scss" as *;

.history-panel {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: var(--color-background);
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform $transition-slow;
  z-index: 100;
}

.history-panel.active {
  transform: translateX(0);
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: $spacing-base;
  border-bottom: $border-width $border-style var(--color-border);

  h3 {
    margin: 0;
    font-size: $font-size-lg;
    color: var(--color-text);
  }

  .close-btn {
    background: none;
    border: none;
    font-size: $font-size-xl;
    cursor: pointer;
    color: var(--color-text-secondary);
    transition: color $transition-fast;

    &:hover {
      color: var(--color-text);
    }
  }
}

.history-list {
  flex-grow: 1;
  overflow-y: auto;
  padding: $spacing-base;
}

.history-footer {
  padding: $spacing-base;
  border-top: $border-width $border-style var(--color-border);
  text-align: center;
}

.clear-all-btn {
  background-color: $color-error-sass;
  color: white;
  border: none;
  border-radius: $border-radius-sm;
  padding: $spacing-xs $spacing-base;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: $spacing-xs;
  font-size: $font-size-base;
  font-weight: $font-weight-medium;
  transition: background-color $transition-fast;

  &:hover {
    background-color: #d32f2f; /* Darker red for hover */
  }

  .clear-all-icon {
    width: 18px;
    height: 18px;
    filter: invert(1);
  }
}

// History item styles
.history-item {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: $border-radius-sm;
  margin-bottom: $spacing-sm;
  padding: $spacing-sm;
  cursor: pointer;
  transition: all $transition-fast;

  &:hover {
    background-color: var(--color-background);
    border-color: var(--color-primary);
  }

  &:last-child {
    margin-bottom: 0;
  }
}

.history-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: $spacing-xs;
}

.language-info {
  .language-pair {
    font-size: $font-size-sm;
    color: var(--color-text-secondary);
    font-weight: $font-weight-medium;
  }
}

.history-item-actions {
  display: flex;
  align-items: center;
  gap: $spacing-xs;

  .timestamp {
    font-size: $font-size-xs;
    color: var(--color-text-secondary);
  }

  .delete-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px;
    border-radius: $border-radius-xs;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.6;
    transition: opacity $transition-fast;

    &:hover {
      opacity: 1;
      background-color: rgba(244, 67, 54, 0.1);
    }

    .delete-icon {
      width: 14px;
      height: 14px;
      filter: var(--icon-filter);
    }
  }
}

.history-item-content {
  display: flex;
  flex-direction: column;
  gap: $spacing-xs;

  .source-text {
    font-size: $font-size-sm;
    color: var(--color-text);
    padding: $spacing-xs;
    background-color: var(--color-background);
    border-radius: $border-radius-xs;
    border-left: 3px solid var(--color-primary);
  }

  .arrow {
    text-align: center;
    color: var(--color-text-secondary);
    font-size: $font-size-sm;
    margin: 2px 0;
  }

  .translated-text {
    font-size: $font-size-sm;
    color: var(--color-text);
    padding: $spacing-xs;
    background-color: var(--color-surface-alt);
    border-radius: $border-radius-xs;
    border-left: 3px solid var(--color-success);
  }
}

// State messages
.loading-message, .error-message, .empty-message {
  text-align: center;
  color: var(--color-text-secondary);
  font-style: italic;
  padding: $spacing-lg;
}

.error-message {
  color: var(--color-error);
}

.empty-message {
  opacity: 0.8;
}
</style>