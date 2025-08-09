<template>
  <div class="language-controls">
    <!-- Source Language Dropdown -->
    <select
      v-model="sourceLanguage"
      class="language-select"
      :title="sourceTitle"
      :disabled="disabled"
    >
      <option value="Auto-Detect">
        {{ autoDetectLabel }}
      </option>
      <option
        v-for="language in availableLanguages"
        :key="language.code"
        :value="language.name"
      >
        {{ language.name }}
      </option>
    </select>

    <!-- Swap Button -->
    <button
      type="button"
      class="swap-button"
      :title="swapTitle"
      :disabled="disabled || !canSwapLanguages"
      @click="handleSwapLanguages"
    >
      <img
        src="@/assets/icons/swap.png"
        :alt="swapAlt"
      >
    </button>

    <!-- Target Language Dropdown -->
    <select
      v-model="targetLanguage"
      class="language-select"
      :title="targetTitle"
      :disabled="disabled"
    >
      <option
        v-for="language in targetLanguages"
        :key="language.code"
        :value="language.name"
      >
        {{ language.name }}
      </option>
    </select>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useLanguages } from '@/composables/useLanguages.js'
import { useSettingsStore } from '@/store/core/settings.js'
import { useErrorHandler } from '@/composables/useErrorHandler.js'
import { AUTO_DETECT_VALUE } from '@/constants.js'
import { createLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = createLogger(LOG_COMPONENTS.UI, 'LanguageSelector');

// Props
const props = defineProps({
  sourceLanguage: {
    type: String,
    default: 'Auto-Detect'
  },
  targetLanguage: {
    type: String,
    default: 'English'
  },
  disabled: {
    type: Boolean,
    default: false
  },
  // i18n labels
  autoDetectLabel: {
    type: String,
    default: 'Auto-Detect'
  },
  sourceTitle: {
    type: String,
    default: 'Source Language'
  },
  targetTitle: {
    type: String,
    default: 'Target Language'
  },
  swapTitle: {
    type: String,
    default: 'Swap Languages'
  },
  swapAlt: {
    type: String,
    default: 'Swap'
  }
})

// Emits
const emit = defineEmits([
  'update:sourceLanguage',
  'update:targetLanguage',
  'swap-languages'
])

// Composables
const languages = useLanguages()
const settingsStore = useSettingsStore()
const { handleError } = useErrorHandler()

// Computed
const sourceLanguage = computed({
  get: () => props.sourceLanguage,
  set: (value) => emit('update:sourceLanguage', value)
})

const targetLanguage = computed({
  get: () => props.targetLanguage,
  set: (value) => emit('update:targetLanguage', value)
})

const availableLanguages = computed(() => languages.allLanguages.value || [])

const targetLanguages = computed(() => {
  // Filter out Auto-Detect from target languages
  return (languages.allLanguages.value || []).filter(lang => 
    lang.code !== AUTO_DETECT_VALUE && 
    lang.code !== 'auto' && 
    lang.name !== 'Auto-Detect'
  )
})

const canSwapLanguages = computed(() => {
  return sourceLanguage.value !== 'Auto-Detect' && 
         sourceLanguage.value !== AUTO_DETECT_VALUE && 
         targetLanguage.value !== 'Auto-Detect' && 
         targetLanguage.value !== AUTO_DETECT_VALUE &&
         sourceLanguage.value.trim() !== '' &&
         targetLanguage.value.trim() !== ''
})

// Methods
const handleSwapLanguages = () => {
  if (canSwapLanguages.value && !props.disabled) {
    logger.debug('[LanguageSelector] Swapping languages:', {
      source: sourceLanguage.value,
      target: targetLanguage.value
    })
    
    emit('swap-languages', {
      oldSource: sourceLanguage.value,
      oldTarget: targetLanguage.value,
      newSource: targetLanguage.value,
      newTarget: sourceLanguage.value
    })
  }
}

// Initialize languages
onMounted(async () => {
  await languages.loadLanguages()
  
  // Set default languages from settings if not provided
  try {
    await settingsStore.loadSettings()
    const settings = settingsStore.settings
    
    if (!props.sourceLanguage || props.sourceLanguage === 'Auto-Detect') {
      sourceLanguage.value = AUTO_DETECT_VALUE
    }
    
    if (!props.targetLanguage) {
      const targetLangDisplay = languages.getLanguageDisplayValue(settings.TARGET_LANGUAGE)
      targetLanguage.value = targetLangDisplay || 'English'
    }
  } catch (error) {
    await handleError(error, 'language-selector-init')
  }
})</script>

<style scoped>
.language-controls {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 0 12px;
}

.language-select {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--header-border-color, #dee2e6);
  border-radius: 4px;
  background: var(--bg-textbox-color, #ffffff);
  color: var(--text-color, #212529);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  box-sizing: border-box;
  min-width: 0;
}

.language-select:focus {
  outline: none;
  border-color: #80bdff;
  box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
}

.language-select:disabled {
  background-color: var(--bg-disabled, #e9ecef);
  color: var(--text-disabled, #6c757d);
  cursor: not-allowed;
}

.swap-button {
  flex-shrink: 0;
  padding: 8px;
  border: 1px solid var(--header-border-color, #dee2e6);
  border-radius: 4px;
  background: var(--bg-textbox-color, #ffffff);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  min-width: 36px;
  height: 36px;
  box-sizing: border-box;
}

.swap-button:hover:not(:disabled) {
  background: var(--bg-hover, #f8f9fa);
  border-color: var(--accent-color, #007bff);
  transform: scale(1.05);
}

.swap-button:disabled {
  background-color: var(--bg-disabled, #e9ecef);
  border-color: var(--border-disabled, #dee2e6);
  cursor: not-allowed;
  opacity: 0.6;
  transform: none;
}

.swap-button img {
  width: 16px;
  height: 16px;
  filter: var(--icon-filter, none);
  transition: filter 0.2s ease;
}

.swap-button:hover:not(:disabled) img {
  filter: var(--icon-hover-filter, none);
}

/* Responsive Design */
@media (max-width: 320px) {
  .language-controls {
    gap: 6px;
  }
  
  .language-select {
    font-size: 13px;
    padding: 6px 8px;
  }
  
  .swap-button {
    min-width: 32px;
    height: 32px;
    padding: 6px;
  }
  
  .swap-button img {
    width: 14px;
    height: 14px;
  }
}
</style>