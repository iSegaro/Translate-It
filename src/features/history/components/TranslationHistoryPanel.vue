<template>
  <div class="history-panel">
    <!-- Header -->
    <div class="history-header">
      <div class="header-title">
        <h3>{{ t('history_title') }}</h3>
        <span class="history-count">{{ t('history_items_count', { count: filteredHistory.length }) }}</span>
      </div>

      <div class="header-actions">
        <BaseInput
          v-model="searchQuery"
          :placeholder="t('history_search_placeholder')"
          size="sm"
          clearable
          class="search-input"
        >
          <template #prefix>
            <span class="search-icon">🔍</span>
          </template>
        </BaseInput>

        <BaseDropdown position="bottom-end">
          <template #trigger="{ toggle, open }">
            <button
              class="filter-btn"
              :class="{ active: open }"
              :title="t('history_filter_tooltip')"
              @click="toggle"
            >
              <span class="filter-icon">⚙️</span>
              <span class="filter-text">{{ t('history_filter') }}</span>
            </button>
          </template>

          <div class="filter-dropdown">
            <div class="filter-section">
              <h4>{{ t('history_filter_by_provider') }}</h4>
              <div class="filter-options">
                <label class="filter-option">
                  <input
                    v-model="filters.providers"
                    type="checkbox"
                    value="all"
                    @change="handleProviderFilter('all')"
                  >
                  <span>{{ t('history_all_providers') }}</span>
                </label>
                <label
                  v-for="provider in availableProviders"
                  :key="provider"
                  class="filter-option"
                >
                  <input
                    v-model="filters.providers"
                    type="checkbox"
                    :value="provider"
                  >
                  <span>{{ getProviderName(provider) }}</span>
                </label>
              </div>
            </div>

            <div class="filter-section">
              <h4>{{ t('history_filter_by_type') }}</h4>
              <div class="filter-options">
                <label class="filter-option">
                  <input
                    v-model="filters.showTextTranslations"
                    type="checkbox"
                  >
                  <span>{{ t('history_text_translations') }}</span>
                </label>
                <label class="filter-option">
                  <input
                    v-model="filters.showImageTranslations"
                    type="checkbox"
                  >
                  <span>{{ t('history_image_translations') }}</span>
                </label>
              </div>
            </div>

            <div class="filter-section">
              <h4>{{ t('history_time_period') }}</h4>
              <select
                v-model="filters.timePeriod"
                class="time-select"
              >
                <option value="all">
                  {{ t('history_time_all') }}
                </option>
                <option value="today">
                  {{ t('history_time_today') }}
                </option>
                <option value="week">
                  {{ t('history_time_week') }}
                </option>
                <option value="month">
                  {{ t('history_time_month') }}
                </option>
              </select>
            </div>
          </div>
        </BaseDropdown>

        <BaseDropdown position="bottom-end">
          <template #trigger="{ toggle, open }">
            <button
              class="sort-btn"
              :class="{ active: open }"
              :title="t('history_sort_tooltip')"
              @click="toggle"
            >
              <span class="sort-icon">📊</span>
              <span class="sort-text">{{ t('history_sort') }}</span>
            </button>
          </template>

          <div class="sort-dropdown">
            <div class="sort-options">
              <label class="sort-option">
                <input
                  v-model="sortBy"
                  type="radio"
                  value="timestamp"
                >
                <span>{{ t('history_sort_by_date') }}</span>
              </label>
              <label class="sort-option">
                <input
                  v-model="sortBy"
                  type="radio"
                  value="provider"
                >
                <span>{{ t('history_sort_by_provider') }}</span>
              </label>
              <label class="sort-option">
                <input
                  v-model="sortBy"
                  type="radio"
                  value="length"
                >
                <span>{{ t('history_sort_by_length') }}</span>
              </label>
            </div>

            <div class="sort-order">
              <label class="sort-option">
                <input
                  v-model="sortOrder"
                  type="radio"
                  value="desc"
                >
                <span>{{ t('history_sort_newest') }}</span>
              </label>
              <label class="sort-option">
                <input
                  v-model="sortOrder"
                  type="radio"
                  value="asc"
                >
                <span>{{ t('history_sort_oldest') }}</span>
              </label>
            </div>
          </div>
        </BaseDropdown>

        <button
          class="clear-btn"
          :disabled="history.length === 0"
          :title="t('history_clear_all_tooltip')"
          @click="showClearConfirm = true"
        >
          <span class="clear-icon">🗑️</span>
          <span class="clear-text">{{ t('history_clear_all') }}</span>
        </button>
      </div>
    </div>
    
    <!-- History list -->
    <div class="history-content">
      <div
        v-if="isLoading"
        class="loading-state"
      >
        <LoadingSpinner size="md" />
        <p>{{ t('history_loading') }}</p>
      </div>

      <div
        v-else-if="filteredHistory.length === 0"
        class="empty-state"
      >
        <div class="empty-icon">
          📝
        </div>
        <h4>{{ searchQuery ? t('history_no_results') : t('history_no_history') }}</h4>
        <p>{{ searchQuery ? t('history_no_results_hint') : t('history_no_history_hint') }}</p>
      </div>
      
      <div
        v-else
        class="history-list"
      >
        <TransitionGroup
          name="history-item"
          tag="div"
        >
          <div 
            v-for="item in paginatedHistory"
            :key="item.id"
            class="history-item"
            :class="{ 
              selected: selectedItems.includes(item.id),
              'image-translation': item.isImageTranslation 
            }"
            @click="selectItem(item)"
          >
            <!-- Item checkbox -->
            <div class="item-checkbox">
              <input 
                type="checkbox" 
                :checked="selectedItems.includes(item.id)"
                @click.stop
                @change="toggleSelection(item.id)"
              >
            </div>
            
            <!-- Item content -->
            <div
              class="item-content"
              @click="retranslate(item)"
            >
              <div class="item-header">
                <div class="item-type">
                  <span class="type-icon">
                    {{ item.isImageTranslation ? '🖼️' : '📝' }}
                  </span>
                  <span class="type-text">
                    {{ item.isImageTranslation ? t('history_type_image') : t('history_type_text') }}
                  </span>
                </div>

                <div class="item-meta">
                  <span class="language-pair">
                    {{ getLanguageName(item.fromLanguage) }} → {{ getLanguageName(item.toLanguage) }}
                  </span>
                  <span
                    class="provider-badge"
                    :class="`provider-${item.provider}`"
                  >
                    {{ getProviderName(item.provider) }}
                  </span>
                </div>
              </div>

              <div class="item-text">
                <div class="source-text">
                  <span class="text-label">{{ t('history_label_source') }}</span>
                  <span class="text-content">{{ truncateText(item.sourceText, 100) }}</span>
                </div>
                <div class="translated-text">
                  <span class="text-label">{{ t('history_label_translation') }}</span>
                  <span class="text-content">{{ truncateText(item.text, 100) }}</span>
                </div>
              </div>

              <div class="item-footer">
                <span class="timestamp">{{ formatTime(item.timestamp) }}</span>
                <div
                  v-if="item.confidence"
                  class="confidence-indicator"
                >
                  <span class="confidence-label">{{ t('history_label_confidence') }}</span>
                  <div class="confidence-bar">
                    <div
                      class="confidence-fill"
                      :style="{ width: `${item.confidence * 100}%` }"
                      :class="getConfidenceClass(item.confidence)"
                    />
                  </div>
                  <span class="confidence-value">{{ Math.round(item.confidence * 100) }}%</span>
                </div>
              </div>
            </div>

            <!-- Item actions -->
            <div class="item-actions">
              <!-- Enhanced Text Actions -->
              <ActionGroup
                :text="item.translatedText"
                :target-language="item.targetLanguage"
                :show-copy="true"
                :show-tts="!item.isImageTranslation"
                :show-paste="false"
                class="history-actions"
              />

              <button
                class="action-btn retranslate-btn"
                :title="t('history_retranslate_tooltip')"
                @click.stop="retranslate(item)"
              >
                <span class="action-icon">🔄</span>
              </button>

              <BaseDropdown
                position="bottom-end"
                size="sm"
              >
                <template #trigger="{ toggle }">
                  <button
                    class="action-btn more-btn"
                    :title="t('history_more_actions_tooltip')"
                    @click.stop="toggle"
                  >
                    <span class="action-icon">⋮</span>
                  </button>
                </template>

                <div class="more-actions">
                  <button
                    class="more-action"
                    @click="editTranslation(item)"
                  >
                    <span class="more-icon">✏️</span>
                    <span>{{ t('history_action_edit') }}</span>
                  </button>
                  <button
                    class="more-action"
                    @click="favoriteItem(item)"
                  >
                    <span class="more-icon">{{ item.isFavorite ? '💔' : '❤️' }}</span>
                    <span>{{ item.isFavorite ? t('history_action_unfavorite') : t('history_action_favorite') }}</span>
                  </button>
                  <button
                    class="more-action"
                    @click="exportItem(item)"
                  >
                    <span class="more-icon">📤</span>
                    <span>{{ t('history_action_export') }}</span>
                  </button>
                  <button
                    class="more-action danger"
                    @click="removeItem(item)"
                  >
                    <span class="more-icon">🗑️</span>
                    <span>{{ t('history_action_delete') }}</span>
                  </button>
                </div>
              </BaseDropdown>
            </div>
          </div>
        </TransitionGroup>
      </div>
      
      <!-- Pagination -->
      <div
        v-if="totalPages > 1"
        class="pagination"
      >
        <button
          class="page-btn"
          :disabled="currentPage === 1"
          :title="t('history_page_first')"
          @click="currentPage = 1"
        >
          ⏮️
        </button>

        <button
          class="page-btn"
          :disabled="currentPage === 1"
          :title="t('history_page_previous')"
          @click="currentPage = Math.max(1, currentPage - 1)"
        >
          ◀️
        </button>

        <span class="page-info">
          {{ t('history_page_info', { current: currentPage, total: totalPages }) }}
        </span>

        <button
          class="page-btn"
          :disabled="currentPage === totalPages"
          :title="t('history_page_next')"
          @click="currentPage = Math.min(totalPages, currentPage + 1)"
        >
          ▶️
        </button>

        <button
          class="page-btn"
          :disabled="currentPage === totalPages"
          :title="t('history_page_last')"
          @click="currentPage = totalPages"
        >
          ⏭️
        </button>
      </div>
    </div>
    
    <!-- Bulk actions -->
    <div
      v-if="selectedItems.length > 0"
      class="bulk-actions"
    >
      <div class="bulk-info">
        {{ selectedItems.length === 1
          ? t('history_items_selected', { count: selectedItems.length })
          : t('history_items_selected_plural', { count: selectedItems.length }) }}
      </div>

      <div class="bulk-buttons">
        <!-- Enhanced Bulk Copy -->
        <CopyButton
          :text="bulkSelectedText"
          class="bulk-copy-btn"
          :title="t('history_copy_all_selected_tooltip')"
          @copied="onBulkCopied"
        />

        <button
          class="bulk-btn"
          @click="bulkExport"
        >
          <span class="bulk-icon">📤</span>
          {{ t('history_bulk_export') }}
        </button>

        <button
          class="bulk-btn danger"
          @click="bulkDelete"
        >
          <span class="bulk-icon">🗑️</span>
          {{ t('history_bulk_delete') }}
        </button>

        <button
          class="bulk-btn secondary"
          @click="clearSelection"
        >
          {{ t('history_bulk_cancel') }}
        </button>
      </div>
    </div>
    
    <!-- Clear confirmation modal -->
    <BaseModal
      v-model="showClearConfirm"
      :title="t('history_clear_confirm_title')"
      size="sm"
    >
      <div class="clear-confirm">
        <p>{{ t('history_clear_confirm_message') }}</p>
        <p class="warning-text">
          {{ t('history_clear_confirm_warning') }}
        </p>
      </div>

      <template #footer>
        <button
          class="confirm-btn secondary"
          @click="showClearConfirm = false"
        >
          {{ t('cancel') }}
        </button>
        <button
          class="confirm-btn danger"
          @click="confirmClearHistory"
        >
          {{ t('history_clear_confirm_button') }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useTranslationStore } from '@/store/modules/translation.js'
import { useI18n } from 'vue-i18n'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseDropdown from '@/components/base/BaseDropdown.vue'
import BaseModal from '@/components/base/BaseModal.vue'
import LoadingSpinner from '@/components/base/LoadingSpinner.vue'
import ActionGroup from '@/components/shared/actions/ActionGroup.vue'
import CopyButton from '@/features/text-actions/components/CopyButton.vue'
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

// Scoped logger
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'TranslationHistoryPanel');

// i18n
const { t } = useI18n()

const emit = defineEmits(['retranslate', 'copy', 'tts', 'export'])

// Store
const translationStore = useTranslationStore()

// State
const isLoading = ref(false)
const searchQuery = ref('')
const sortBy = ref('timestamp')
const sortOrder = ref('desc')
const currentPage = ref(1)
const itemsPerPage = ref(20)
const selectedItems = ref([])
const showClearConfirm = ref(false)

// Filters
const filters = ref({
  providers: ['all'],
  showTextTranslations: true,
  showImageTranslations: true,
  timePeriod: 'all'
})

// Computed
const history = computed(() => translationStore.history)

const availableProviders = computed(() => {
  const providers = new Set()
  history.value.forEach(item => providers.add(item.provider))
  return Array.from(providers)
})

const filteredHistory = computed(() => {
  let items = [...history.value]
  
  // Search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    items = items.filter(item => 
      item.sourceText.toLowerCase().includes(query) ||
      item.text.toLowerCase().includes(query) ||
      item.provider.toLowerCase().includes(query)
    )
  }
  
  // Provider filter
  if (!filters.value.providers.includes('all')) {
    items = items.filter(item => 
      filters.value.providers.includes(item.provider)
    )
  }
  
  // Type filter
  items = items.filter(item => {
    if (item.isImageTranslation) {
      return filters.value.showImageTranslations
    } else {
      return filters.value.showTextTranslations
    }
  })
  
  // Time period filter
  if (filters.value.timePeriod !== 'all') {
    const now = Date.now()
    const timeFilters = {
      today: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000
    }
    
    const timeLimit = timeFilters[filters.value.timePeriod]
    if (timeLimit) {
      items = items.filter(item => 
        now - item.timestamp <= timeLimit
      )
    }
  }
  
  // Sort
  items.sort((a, b) => {
    let aValue, bValue
    
    switch (sortBy.value) {
      case 'timestamp':
        aValue = a.timestamp
        bValue = b.timestamp
        break
      case 'provider':
        aValue = a.provider
        bValue = b.provider
        break
      case 'length':
        aValue = a.sourceText.length
        bValue = b.sourceText.length
        break
      default:
        aValue = a.timestamp
        bValue = b.timestamp
    }
    
    if (sortOrder.value === 'desc') {
      return bValue > aValue ? 1 : -1
    } else {
      return aValue > bValue ? 1 : -1
    }
  })
  
  return items
})

const totalPages = computed(() => 
  Math.ceil(filteredHistory.value.length / itemsPerPage.value)
)

const paginatedHistory = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  const end = start + itemsPerPage.value
  return filteredHistory.value.slice(start, end)
})

const bulkSelectedText = computed(() => {
  const selectedTexts = selectedItems.value.map(id => {
    const item = history.value.find(h => h.id === id)
    return item ? item.translatedText || item.text : ''
  }).filter(text => text.length > 0)
  
  return selectedTexts.join('\n\n')
})

// Methods
const truncateText = (text, maxLength) => {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

const formatTime = (timestamp) => {
  const date = new Date(timestamp)
  const now = new Date()
  const diffInHours = (now - date) / (1000 * 60 * 60)
  
  if (diffInHours < 1) {
    const diffInMinutes = Math.floor(diffInHours * 60)
    return `${diffInMinutes}m ago`
  } else if (diffInHours < 24) {
    return `${Math.floor(diffInHours)}h ago`
  } else if (diffInHours < 24 * 7) {
    return `${Math.floor(diffInHours / 24)}d ago`
  } else {
    return date.toLocaleDateString()
  }
}

const getLanguageName = (code) => {
  const languages = {
    'auto': 'Auto',
    'en': 'English',
    'fa': 'Persian',
    'ar': 'Arabic',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'ja': 'Japanese',
    'ko': 'Korean',
    'zh': 'Chinese',
    'ru': 'Russian'
  }
  return languages[code] || code
}

const getProviderName = (provider) => {
  const names = {
    google: 'Google Translate',
    bing: 'Bing Translator',
    gemini: 'Google Gemini',
    openai: 'OpenAI',
    openrouter: 'OpenRouter',
    deepseek: 'DeepSeek'
  }
  return names[provider] || provider
}

const getConfidenceClass = (confidence) => {
  if (confidence >= 0.8) return 'high'
  if (confidence >= 0.6) return 'medium'
  return 'low'
}

const selectItem = (item) => {
  // Toggle selection
  toggleSelection(item.id)
}

const toggleSelection = (itemId) => {
  const index = selectedItems.value.indexOf(itemId)
  if (index === -1) {
    selectedItems.value.push(itemId)
  } else {
    selectedItems.value.splice(index, 1)
  }
}

const clearSelection = () => {
  selectedItems.value = []
}

const retranslate = (item) => {
  emit('retranslate', item)
}

const onBulkCopied = () => {
  showFeedback(t('history_copied_feedback', { count: selectedItems.value.length }))
  logger.debug('[TranslationHistoryPanel] Bulk copy completed')
}

const editTranslation = (item) => {
  // This would open an edit modal
  logger.debug('Edit translation:', item)
}

const favoriteItem = (item) => {
  // Toggle favorite status
  item.isFavorite = !item.isFavorite
  // Save to store/storage
}

const exportItem = (item) => {
  emit('export', [item])
}

const removeItem = (item) => {
  if (confirm(t('history_delete_confirm_message'))) {
    const index = history.value.findIndex(h => h.id === item.id)
    if (index !== -1) {
      history.value.splice(index, 1)
    }
  }
}

const handleProviderFilter = (value) => {
  if (value === 'all') {
    filters.value.providers = ['all']
  } else {
    const index = filters.value.providers.indexOf('all')
    if (index !== -1) {
      filters.value.providers.splice(index, 1)
    }
  }
}

const confirmClearHistory = () => {
  translationStore.clearHistory()
  selectedItems.value = []
  showClearConfirm.value = false
  showFeedback(t('history_cleared_feedback'))
}

const bulkExport = () => {
  const items = selectedItems.value.map(id => 
    history.value.find(item => item.id === id)
  ).filter(Boolean)
  
  emit('export', items)
  clearSelection()
}


const bulkDelete = () => {
  if (confirm(t('history_bulk_delete_confirm_message', { count: selectedItems.value.length }))) {
    selectedItems.value.forEach(id => {
      const index = history.value.findIndex(item => item.id === id)
      if (index !== -1) {
        history.value.splice(index, 1)
      }
    })
    const deletedCount = selectedItems.value.length
    clearSelection()
    showFeedback(t('history_deleted_feedback', { count: deletedCount }))
  }
}

const showFeedback = (message, type = 'success') => {
  // Create temporary feedback element
  const feedback = document.createElement('div')
  feedback.textContent = message
  feedback.className = `history-feedback ${type}`
  feedback.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'error' ? '#f44336' : '#4caf50'};
    color: white;
    padding: 12px 16px;
    border-radius: 6px;
    font-size: 14px;
    z-index: 2147483648;
    animation: slideInRight 0.3s ease, fadeOut 0.3s ease 2.7s;
  `
  
  document.body.appendChild(feedback)
  
  setTimeout(() => {
    feedback.remove()
  }, 3000)
}

// Watch for search query changes to reset pagination
watch(searchQuery, () => {
  currentPage.value = 1
})

watch(filters, () => {
  currentPage.value = 1
}, { deep: true })

onMounted(() => {
  // Load history if needed
  isLoading.value = false
});
</script>

<style scoped>
.history-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background);
  border-radius: 8px;
  overflow: hidden;
}

/* Header */
.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
  gap: 16px;
}

.header-title h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
}

.history-count {
  font-size: 12px;
  color: var(--color-text-muted);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-input {
  min-width: 200px;
}

.filter-btn,
.sort-btn,
.clear-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background);
  color: var(--color-text);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s ease;
  
  &:hover:not(:disabled) {
    background: var(--color-surface);
    border-color: var(--color-primary);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  &.active {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: white;
  }
}

.clear-btn:hover:not(:disabled) {
  border-color: #f44336;
  color: #f44336;
}

/* Dropdown content */
.filter-dropdown,
.sort-dropdown {
  padding: 12px;
  min-width: 200px;
}

.filter-section {
  margin-bottom: 16px;
  
  &:last-child {
    margin-bottom: 0;
  }
}

.filter-section h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.filter-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-option,
.sort-option {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text);
  cursor: pointer;
}

.time-select {
  width: 100%;
  padding: 4px 6px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background);
  color: var(--color-text);
  font-size: 13px;
}

/* Content */
.history-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 32px;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  opacity: 0.5;
  margin-bottom: 16px;
}

.empty-state h4 {
  margin: 0 0 8px 0;
  color: var(--color-text);
}

.empty-state p {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 14px;
}

.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

/* History items */
.history-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-background);
  margin-bottom: 8px;
  transition: all 0.2s ease;
  cursor: pointer;
  
  &:hover {
    background: var(--color-surface);
    border-color: var(--color-primary);
  }
  
  &.selected {
    background: rgba(33, 150, 243, 0.1);
    border-color: var(--color-primary);
  }
  
  &.image-translation {
    border-left: 4px solid #9c27b0;
  }
}

.item-checkbox {
  margin-top: 2px;
}

.item-content {
  flex: 1;
  min-width: 0;
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.item-type {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.item-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}

.language-pair {
  color: var(--color-text-muted);
}

.provider-badge {
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 500;
  
  &.provider-google {
    background: rgba(66, 133, 244, 0.1);
    color: #4285f4;
  }
  
  &.provider-gemini {
    background: rgba(251, 188, 5, 0.1);
    color: #fbbc05;
  }
  
  &.provider-openai {
    background: rgba(116, 185, 186, 0.1);
    color: #74b9ba;
  }
}

.item-text {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
}

.source-text,
.translated-text {
  display: flex;
  gap: 8px;
  font-size: 13px;
}

.text-label {
  font-weight: 500;
  color: var(--color-text-muted);
  min-width: 70px;
  flex-shrink: 0;
}

.text-content {
  color: var(--color-text);
  word-break: break-word;
}

.item-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--color-text-muted);
}

.confidence-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
}

.confidence-bar {
  width: 40px;
  height: 4px;
  background: var(--color-surface);
  border-radius: 2px;
  overflow: hidden;
}

.confidence-fill {
  height: 100%;
  transition: width 0.3s ease;
  
  &.high {
    background: #4caf50;
  }
  
  &.medium {
    background: #ff9800;
  }
  
  &.low {
    background: #f44336;
  }
}

/* Item actions */
.item-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.history-actions {
  display: flex;
  gap: 4px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 12px;
  
  &:hover {
    background: var(--color-surface);
  }
}

.copy-btn:hover {
  border-color: #4caf50;
  color: #4caf50;
}

.tts-btn:hover {
  border-color: #2196f3;
  color: #2196f3;
}

.retranslate-btn:hover {
  border-color: #ff9800;
  color: #ff9800;
}

.more-actions {
  padding: 8px;
  min-width: 120px;
}

.more-action {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text);
  border-radius: 4px;
  
  &:hover {
    background: var(--color-surface);
  }
  
  &.danger {
    color: #f44336;
    
    &:hover {
      background: rgba(244, 67, 54, 0.1);
    }
  }
}

/* Pagination */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  border-top: 1px solid var(--color-border);
}

.page-btn {
  padding: 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background);
  cursor: pointer;
  font-size: 12px;
  
  &:hover:not(:disabled) {
    background: var(--color-surface);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.page-info {
  font-size: 13px;
  color: var(--color-text-muted);
  margin: 0 8px;
}

/* Bulk actions */
.bulk-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: rgba(33, 150, 243, 0.1);
  border-top: 1px solid var(--color-primary);
}

.bulk-info {
  font-size: 14px;
  color: var(--color-primary);
  font-weight: 500;
}

.bulk-buttons {
  display: flex;
  gap: 8px;
}

.bulk-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s ease;
  
  &:hover {
    background: var(--color-surface);
  }
  
  &.danger:hover {
    border-color: #f44336;
    color: #f44336;
  }
  
  &.secondary:hover {
    border-color: var(--color-secondary);
    color: var(--color-secondary);
  }
}

.bulk-copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background);
  cursor: pointer;
  font-size: 12px;
  color: var(--color-text);
  transition: all 0.2s ease;
  
  &:hover {
    border-color: #4caf50;
    color: #4caf50;
    background: rgba(76, 175, 80, 0.1);
  }
}

/* Clear confirmation */
.clear-confirm {
  text-align: center;
  padding: 16px;
}

.warning-text {
  color: #f44336;
  font-size: 13px;
  margin-top: 8px;
}

.confirm-btn {
  padding: 8px 16px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background);
  cursor: pointer;
  margin: 0 4px;
  
  &.danger {
    background: #f44336;
    border-color: #f44336;
    color: white;
    
    &:hover {
      background: #d32f2f;
    }
  }
  
  &.secondary:hover {
    background: var(--color-surface);
  }
}

/* Transitions */
.history-item-enter-active,
.history-item-leave-active {
  transition: all 0.3s ease;
}

.history-item-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.history-item-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

/* Responsive design */
@media (max-width: 768px) {
  .history-header {
    flex-direction: column;
    gap: 12px;
  }
  
  .header-actions {
    width: 100%;
    flex-wrap: wrap;
  }
  
  .search-input {
    min-width: 0;
    flex: 1;
  }
  
  .history-item {
    flex-direction: column;
    gap: 8px;
  }
  
  .item-actions {
    flex-direction: row;
    justify-content: flex-end;
  }
  
  .bulk-actions {
    flex-direction: column;
    gap: 8px;
  }
  
  .bulk-buttons {
    width: 100%;
    justify-content: center;
  }
}

/* Enhanced Actions Styling */
.history-actions {
  display: flex;
  gap: 4px;
}
</style>