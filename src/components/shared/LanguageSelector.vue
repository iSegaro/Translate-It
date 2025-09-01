<template>
  <div class="language-controls">
    <!-- Target Language Dropdown -->
    <select
      v-model="targetLanguage"
      class="language-select"
      :title="targetTitle"
      :disabled="disabled"
      @click="handleDropdownClick"
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
      @click="handleDropdownClick"
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
import { useLanguages } from '@/composables/shared/useLanguages.js'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js'
import { useSelectElementTranslation } from '@/features/translation/composables/useTranslationModes.js'
import { AUTO_DETECT_VALUE } from '@/constants.js'
import { CONFIG } from '@/config.js'
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'LanguageSelector');


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
const { isSelectModeActive, deactivateSelectMode } = useSelectElementTranslation()

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

const handleDropdownClick = () => {
  if (isSelectModeActive.value) {
    deactivateSelectMode();
  }
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
  align-items: center;
  padding: 6px 12px;
  gap: 6px;
  background: var(--language-controls-bg-color);
}

.language-select {
  flex: 1;
  min-width: 100px;
  padding: 7px 8px;
  font-size: 14px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background-color: var(--color-background);
  color: var(--color-text);
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  background-image: url('data:image/svg+xml;charset=US-ASCII,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="5" viewBox="0 0 10 5"><path fill="%236c757d" d="M0 0l5 5 5-5z"/></svg>');
  background-repeat: no-repeat;
  background-position: right 8px center; /* Move arrow to the right */
  background-size: 10px 5px;
  padding-right: 25px; /* Add space for the arrow */
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
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background-color 0.2s ease, filter 0.2s ease-in-out;
  flex-shrink: 0;
}

.swap-button:hover {
  background-color: var(--toolbar-link-hover-bg-color);
}

.swap-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.swap-button img {
  width: 16px;
  height: 16px;
  opacity: var(--icon-opacity);
  filter: var(--icon-filter);
  transition: opacity 0.2s ease-in-out;
}

.swap-button:hover img {
  opacity: var(--icon-hover-opacity);
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
  padding: 6px 10px;
  font-size: 14px;
  min-width: 90px;
  height: 32px;
  line-height: 1.4;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  vertical-align: middle;
}

.popup-wrapper .swap-button {
  width: 32px;
  height: 32px;
  padding: 6px;
}

.popup-wrapper .swap-button img {
  width: 18px;
  height: 18px;
}

.sidepanel-wrapper .language-controls {
  height: 40px !important;
  align-items: center !important;
  padding: 4px 0 !important;
  margin: 2px 0 4px 0 !important;
  gap: 6px !important;
  box-sizing: border-box !important;
  background: transparent !important;
  flex: none !important;
}

.sidepanel-wrapper .language-select {
  padding: 6px 10px;
  font-size: 14px;
  height: 32px;
  line-height: 1.4;
  min-width: 90px;
  max-width: 150px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  vertical-align: middle;
}

.sidepanel-wrapper .swap-button {
  width: 32px;
  height: 32px;
  padding: 6px;
}

.sidepanel-wrapper .swap-button img {
  width: 18px;
  height: 18px;
}
</style>