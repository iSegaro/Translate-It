<template>
  <div
    class="history-item"
    @click="handleClick"
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
          @click.stop="handleDelete"
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
      <div class="source-text">
        {{ truncateText(item.sourceText) }}
      </div>
      <div class="arrow">
        ↓
      </div>
      <div class="translated-text">
        {{ item.markdownContent ? item.markdownContent : truncateText(item.translatedText) }}
      </div>
    </div>
  </div>
</template>

<script setup>
import './HistoryItem.scss'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'

const { t } = useUnifiedI18n()

const props = defineProps({
  item: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['select', 'delete'])

const truncateText = (text, maxLength = 100) => {
  if (!text) return ''
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
}

const handleClick = () => {
  emit('select', props.item)
}

const handleDelete = () => {
  emit('delete', props.item.index)
}
</script>
