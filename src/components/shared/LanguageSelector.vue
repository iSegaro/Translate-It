<template>
  <div class="language-controls">
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

    <!-- Swap Button -->
    <button
      type="button"
      class="swap-button"
      :title="swapTitle"
      @click="handleSwapLanguages"
    >
      <img
        src="@/assets/icons/swap.png"
        :alt="swapAlt"
      >
    </button>

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
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useLanguages } from '@/composables/useLanguages.js'
import { useSettingsStore } from '@/store/core/settings.js'
import { useErrorHandler } from '@/composables/useErrorHandler.js'
import { AUTO_DETECT_VALUE } from '@/constants.js'
import { CONFIG } from '@/config.js'
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

// Methods
const handleSwapLanguages = () => {
  logger.debug('[LanguageSelector] Swap requested:', {
    source: sourceLanguage.value,
    target: targetLanguage.value
  })

  let currentSource = sourceLanguage.value
  const currentTarget = targetLanguage.value
  
  // FIRST: Resolve auto-detect before swapping
  if (currentSource === AUTO_DETECT_VALUE || currentSource === 'Auto-Detect') {
    // Get the actual source language from CONFIG (not settings, as settings might also be Auto-Detect)
    let sourceLangFromConfig = CONFIG.SOURCE_LANGUAGE || 'English'
    
    // If settings has a real language (not Auto-Detect), use it instead
    if (settingsStore.settings.SOURCE_LANGUAGE && 
        settingsStore.settings.SOURCE_LANGUAGE !== 'Auto-Detect' &&
        settingsStore.settings.SOURCE_LANGUAGE !== AUTO_DETECT_VALUE) {
      sourceLangFromConfig = settingsStore.settings.SOURCE_LANGUAGE
    }
    
    logger.debug('[LanguageSelector] Resolving auto-detect to actual source language:', sourceLangFromConfig)
    
    // Convert to display name if it's a code
    if (sourceLangFromConfig.length <= 3) {
      currentSource = languages.getLanguageDisplayValue(sourceLangFromConfig) || 'English'
    } else {
      currentSource = sourceLangFromConfig // Already a display name
    }
    
    logger.debug('[LanguageSelector] Auto-detect resolved to:', currentSource)
  }
  
  // NOW: Perform normal swap with resolved values
  const newSourceValue = currentTarget
  const newTargetValue = currentSource
  
  // Update values
  sourceLanguage.value = newSourceValue
  targetLanguage.value = newTargetValue
  
  logger.debug('[LanguageSelector] Languages swapped:', {
    to: `source="${newSourceValue}", target="${newTargetValue}"`,
    hadAutoDetect: (sourceLanguage.value === 'Auto-Detect' || currentSource !== sourceLanguage.value),
    resolvedValue: currentSource
  })
  
  // Emit event for parent components that might need to know about the swap
  emit('swap-languages', {
    oldSource: sourceLanguage.value,
    oldTarget: currentTarget,
    newSource: newSourceValue,
    newTarget: newTargetValue
  })
}

// Initialize languages
onMounted(async () => {
  await languages.loadLanguages()
  
  // Set default languages from settings if not provided
  try {
    await settingsStore.loadSettings()
    const settings = settingsStore.settings
    
    // Only set if current values are empty or default
    if (!sourceLanguage.value || sourceLanguage.value === 'Auto-Detect') {
      // SOURCE_LANGUAGE might be a name like "English" or code like "en"
      const sourceLang = settings.SOURCE_LANGUAGE || 'English'
      let sourceDisplay
      if (sourceLang.length <= 3) {
        sourceDisplay = languages.getLanguageDisplayValue(sourceLang) || 'Auto-Detect'
      } else {
        sourceDisplay = sourceLang // Already a display name
      }
      sourceLanguage.value = sourceDisplay
      logger.debug('[LanguageSelector] Set source language from settings:', sourceDisplay)
    }
    
    if (!targetLanguage.value || targetLanguage.value === 'English') {
      // TARGET_LANGUAGE might be a name like "Farsi" or code like "fa"
      const targetLang = settings.TARGET_LANGUAGE || 'Farsi'
      let targetDisplay
      if (targetLang.length <= 3) {
        targetDisplay = languages.getLanguageDisplayValue(targetLang) || 'Farsi'
      } else {
        targetDisplay = targetLang // Already a display name
      }
      targetLanguage.value = targetDisplay
      logger.debug('[LanguageSelector] Set target language from settings:', targetDisplay)
    }
  } catch (error) {
    await handleError(error, 'language-selector-init')
  }
});
</script>

<style scoped>
.language-controls {
  display: flex;
  gap: 4px;
  align-items: stretch;
  flex: 1;
  height: 100%;
}

.language-select {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid var(--header-border-color, #dee2e6);
  border-radius: 3px;
  background: var(--bg-textbox-color, #ffffff);
  color: var(--text-color, #212529);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.4;
  box-sizing: border-box;
  min-width: 0;
  height: 100%;
  cursor: pointer;
  text-align: left;
  vertical-align: middle;
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
  padding: 4px;
  border: 1px solid var(--header-border-color, #dee2e6);
  border-radius: 3px;
  background: var(--bg-textbox-color, #ffffff);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  width: 32px;
  height: 100%;
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
  width: 14px;
  height: 14px;
  filter: var(--icon-filter, none);
  transition: filter 0.2s ease;
}

.swap-button:hover:not(:disabled) img {
  filter: var(--icon-hover-filter, none);
}

/* Responsive Design */
@media (max-width: 320px) {
  .language-controls {
    gap: 4px;
  }
  
  .language-select {
    font-size: 11px;
    padding: 4px 6px;
  }
  
  .swap-button {
    width: 28px;
    padding: 4px;
  }
  
  .swap-button img {
    width: 12px;
    height: 12px;
  }
}

/* Context-specific adjustments for popup vs sidepanel */
.popup-wrapper .language-controls {
  align-items: center;
  height: auto;
}

.popup-wrapper .language-select {
  padding: 0 8px;
  font-size: 12px;
  min-width: 80px;
  height: 28px;
  line-height: 2.8;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  vertical-align: middle;
}

.popup-wrapper .swap-button {
  width: 28px;
  height: 28px;
  padding: 4px;
}

.popup-wrapper .swap-button img {
  width: 16px;
  height: 16px;
}

.sidepanel-wrapper .language-controls {
  height: auto;
  align-items: center;
  padding: 12px;
  gap: 10px;
}

.sidepanel-wrapper .language-select {
  padding: 10px 14px;
  font-size: 14px;
  height: auto;
  min-width: 120px;
  max-width: 160px;
}

.sidepanel-wrapper .swap-button {
  width: 40px;
  height: 40px;
  padding: 10px;
}

.sidepanel-wrapper .swap-button img {
  width: 18px;
  height: 18px;
}
</style>