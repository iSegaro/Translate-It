<template>
  <div class="selection-windows-test">
    <h3>SelectionWindows Integration Test</h3>
    
    <div class="test-controls">
      <button 
        :disabled="isVisible"
        class="test-button"
        @click="testShowWindow"
      >
        Show Test Window
      </button>
      
      <button 
        :disabled="!isVisible"
        class="test-button"
        @click="testDismissWindow"
      >
        Dismiss Window
      </button>
      
      <button 
        :disabled="!isTranslating"
        class="test-button"
        @click="testCancelTranslation"
      >
        Cancel Translation
      </button>
    </div>
    
    <div class="test-status">
      <div class="status-item">
        <strong>Visible:</strong> {{ isVisible ? 'Yes' : 'No' }}
      </div>
      <div class="status-item">
        <strong>Mode:</strong> {{ isIconMode ? 'Icon' : 'Window' }}
      </div>
      <div class="status-item">
        <strong>Translating:</strong> {{ isTranslating ? 'Yes' : 'No' }}
      </div>
      <div
        v-if="selectedText"
        class="status-item"
      >
        <strong>Selected Text:</strong> {{ selectedText.substring(0, 50) }}...
      </div>
      <div
        v-if="translatedText"
        class="status-item"
      >
        <strong>Translation:</strong> {{ translatedText.substring(0, 100) }}...
      </div>
      <div
        v-if="error"
        class="status-item error"
      >
        <strong>Error:</strong> {{ error }}
      </div>
    </div>
    
    <div class="test-info">
      <p><strong>Instructions:</strong></p>
      <ol>
        <li>Click "Show Test Window" to display a SelectionWindows instance</li>
        <li>The window should appear with test text</li>
        <li>Try dismissing it or canceling translation</li>
        <li>Check the status above for real-time updates</li>
      </ol>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useSelectionWindows } from '@/composables/useSelectionWindows.js'
import { createLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = createLogger(LOG_COMPONENTS.UI, 'SelectionWindowsTest');

// Use the SelectionWindows composable
const selectionWindows = useSelectionWindows()

// Extract reactive state from composable
const isVisible = computed(() => selectionWindows.isVisible.value)
const isIconMode = computed(() => selectionWindows.isIconMode.value)
const selectedText = computed(() => selectionWindows.selectedText.value)
const isTranslating = computed(() => selectionWindows.isTranslating.value)
const translatedText = computed(() => selectionWindows.translatedText.value)
const error = computed(() => selectionWindows.error.value)

// Test methods
const testShowWindow = async () => {
  const testText = "This is a test text for SelectionWindows integration with Vue architecture. It should demonstrate the bridge between OLD and NEW systems."
  const testPosition = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2
  }
  
  logger.debug('[SelectionWindowsTest] Showing test window...')
  
  const success = await selectionWindows.showSelectionWindow(testText, testPosition)
  
  if (success) {
    logger.debug('[SelectionWindowsTest] Test window shown successfully')
  } else {
    logger.error('[SelectionWindowsTest] Failed to show test window')
  }
}

const testDismissWindow = () => {
  logger.debug('[SelectionWindowsTest] Dismissing test window...')
  selectionWindows.dismissSelectionWindow(true)
}

const testCancelTranslation = () => {
  logger.debug('[SelectionWindowsTest] Canceling translation...')
  selectionWindows.cancelCurrentTranslation()
}</script>

<style scoped>
.selection-windows-test {
  padding: 20px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  margin: 10px;
  background-color: #f9f9f9;
}

.test-controls {
  display: flex;
  gap: 10px;
  margin: 15px 0;
  flex-wrap: wrap;
}

.test-button {
  padding: 8px 16px;
  background-color: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.test-button:hover:not(:disabled) {
  background-color: #45a049;
}

.test-button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.test-status {
  background-color: white;
  padding: 15px;
  border-radius: 4px;
  margin: 15px 0;
}

.status-item {
  margin: 5px 0;
  font-family: monospace;
}

.status-item.error {
  color: #d32f2f;
}

.test-info {
  background-color: #e3f2fd;
  padding: 15px;
  border-radius: 4px;
  margin-top: 15px;
}

.test-info ol {
  margin: 10px 0;
  padding-left: 20px;
}

.test-info li {
  margin: 5px 0;
}
</style>