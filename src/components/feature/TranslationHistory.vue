<template>
  <div class="translation-history">
    <div class="history-header">
      <h3 class="section-title">Recent Translations</h3>
      <BaseButton
        variant="ghost"
        size="xs"
        icon="clear"
        title="Clear History"
        @click="$emit('clear-history')"
      />
    </div>
    
    <div class="history-list">
      <div v-if="!historyItems.length" class="empty-state">
        <span class="empty-text">No recent translations</span>
      </div>
      
      <div 
        v-for="item in historyItems" 
        :key="item.id"
        class="history-item"
        @click="$emit('retranslate', item)"
      >
        <div class="item-content">
          <div class="source-text">{{ item.sourceText }}</div>
          <div class="translated-text">{{ item.translatedText }}</div>
        </div>
        <div class="item-meta">
          <span class="language-pair">{{ item.fromLanguage }} → {{ item.toLanguage }}</span>
          <span class="timestamp">{{ formatTime(item.timestamp) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'

defineEmits(['retranslate', 'clear-history'])

// Mock history data
const historyItems = ref([
  {
    id: '1',
    sourceText: 'Hello world',
    translatedText: 'سلام دنیا',
    fromLanguage: 'en',
    toLanguage: 'fa',
    timestamp: Date.now() - 3600000
  },
  {
    id: '2',
    sourceText: 'How are you?',
    translatedText: 'حال شما چطور است؟',
    fromLanguage: 'en',
    toLanguage: 'fa',
    timestamp: Date.now() - 7200000
  }
])

const formatTime = (timestamp) => {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  
  if (hours > 0) {
    return `${hours}h ago`
  } else if (minutes > 0) {
    return `${minutes}m ago`
  } else {
    return 'Just now'
  }
}
</script>

<style scoped>
.translation-history {
  padding: 16px;
  border-top: 1px solid var(--color-border);
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
  margin: 0;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.empty-state {
  text-align: center;
  padding: 20px;
}

.empty-text {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.history-item {
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-base);
  cursor: pointer;
  transition: all var(--transition-base);
  
  &:hover {
    background-color: var(--color-surface);
    border-color: var(--color-primary);
  }
}

.item-content {
  margin-bottom: 4px;
}

.source-text {
  font-size: var(--font-size-sm);
  color: var(--color-text);
  margin-bottom: 2px;
}

.translated-text {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.item-meta {
  display: flex;
  justify-content: space-between;
  font-size: var(--font-size-xs);
  color: var(--color-text-disabled);
}
</style>