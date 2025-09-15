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
        :value="language.code"
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
        :src="swapIcon"
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
      <option value="auto">
        {{ autoDetectLabel }}
      </option>
      <option
        v-for="language in availableLanguages"
        :key="language.code"
        :value="language.code"
      >
        {{ language.name }}
      </option>
    </select>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useLanguages } from '@/composables/shared/useLanguages.js'
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js'
import { useSelectElementTranslation } from '@/features/translation/composables/useTranslationModes.js'
import browser from 'webextension-polyfill'
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { storageManager } from '@/shared/storage/core/StorageCore.js';
import { AUTO_DETECT_VALUE } from '../../shared/config/constants';
import { getLanguageCode } from '@/utils/i18n/languages.js';
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'LanguageSelector');


// Props
const props = defineProps({
  sourceLanguage: {
    type: String,
    default: AUTO_DETECT_VALUE
  },
  targetLanguage: {
    type: String,
    default: 'en'
  },
  disabled: {
    type: Boolean,
    default: false
  },
  // i18n labels
  autoDetectLabel: {
    type: String,
    default: AUTO_DETECT_VALUE
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
  return (languages.allLanguages.value || []).filter(lang => lang.code !== AUTO_DETECT_VALUE)
})

const swapIcon = computed(() => {
  return browser.runtime.getURL('icons/ui/swap.png')
})

// Methods
const handleSwapLanguages = async () => {
  try {
    // Get fresh default languages directly from storage to ensure up-to-date data
    const defaults = await storageManager.get(['SOURCE_LANGUAGE', 'TARGET_LANGUAGE']);
    const defaultTarget = getLanguageCode(defaults?.TARGET_LANGUAGE) || 'en';

    logger.debug('[LanguageSelector] Swap requested:', {
      current: { source: sourceLanguage.value, target: targetLanguage.value },
      defaultTarget: defaultTarget
    });

    let currentSource = sourceLanguage.value;
    const currentTarget = targetLanguage.value;

    // --- User's specific logic restored ---
    // Case 1: Source is auto-detect and the current target is NOT the default target
    if (currentSource === AUTO_DETECT_VALUE && currentTarget !== defaultTarget) {
      logger.debug('[LanguageSelector] Source is auto, resolving to default target language:', defaultTarget);
      currentSource = defaultTarget;
    }
    // Case 2: Source is auto-detect and the current target IS the default target
    else if (currentSource === AUTO_DETECT_VALUE && currentTarget === defaultTarget) {
      logger.debug('[LanguageSelector] Source is auto and target is default, resolving source to `en`');
      currentSource = "en"; // Fallback to English
    }
    // Case 3: Both selected languages are the same
    else if (currentSource === currentTarget) {
      logger.debug('[LanguageSelector] Both languages are the same, resolving source to `en`');
      currentSource = 'en'; // Fallback to English
    }

    // Perform the final swap with the potentially modified source language
    sourceLanguage.value = currentTarget;
    targetLanguage.value = currentSource;

    logger.debug('[LanguageSelector] Languages swapped to:', {
      source: sourceLanguage.value,
      target: targetLanguage.value
    });

    emit('swap-languages', {
      newSource: sourceLanguage.value,
      newTarget: targetLanguage.value
    });

  } catch (error) {
    handleError(error, 'language-swap-error');
    logger.error('[LanguageSelector] Error during language swap:', error);
  }
};

const handleDropdownClick = () => {
  if (isSelectModeActive.value) {
    deactivateSelectMode();
  }
}

// Initialize languages
onMounted(() => {
  // Load languages asynchronously (non-blocking)
  languages.loadLanguages().catch(error => {
    handleError(error, 'language-selector-languages')
  });
});
</script>

<style scoped>
.language-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 6px 12px;
  gap: 6px;
  background: var(--language-controls-bg-color);
  margin: 8px 12px 0 12px;
}

.language-select {
  flex: 1 1 80px;
  min-width: 70px;
  max-width: 120px;
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
  justify-content: flex-end;
}

.popup-wrapper .language-select {
  padding: 6px 10px;
  font-size: 14px;
  min-width: 70px;
  max-width: 100px;
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

/* Context-specific adjustments for popup vs sidepanel */
.popup-wrapper .language-controls {
  align-items: center;
  height: auto;
  justify-content: flex-end;
}

.popup-wrapper .language-select {
  padding: 6px 10px;
  font-size: 14px;
  min-width: 70px;
  max-width: 100px;
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