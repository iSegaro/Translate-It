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
          title="Delete this item"
          @click.stop="handleDelete"
        >
          <img
            src="@/icons/ui/trash-small.svg"
            alt="Delete"
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

<style lang="scss" scoped>
@use "@/assets/styles/base/variables" as *;

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
</style>