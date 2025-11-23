<template>
  <div
    ref="languageControlsRef"
    :class="['ti-language-controls', { 'ti-language-controls--vertical': isVerticalLayout && isSidepanelContext }]"
  >
    <!-- Target Language Dropdown -->
    <select
      v-model="targetLanguage"
      class="ti-language-select"
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
      class="ti-swap-button"
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
      class="ti-language-select"
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
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useLanguages } from '@/composables/shared/useLanguages.js'
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js'
import { useSelectElementTranslation } from '@/features/translation/composables/useTranslationModes.js'
import browser from 'webextension-polyfill'
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { CONFIG } from '@/shared/config/config.js';
import { AUTO_DETECT_VALUE } from '../../shared/config/constants';
import { utilsFactory } from '@/utils/UtilsFactory.js';
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

const availableLanguages = computed(() => {
  // Return cached languages if available, otherwise show loading indicator
  return languages.allLanguages.value || []
})

const targetLanguages = computed(() => {
  // Filter out Auto-Detect from target languages
  return availableLanguages.value.filter(lang => lang.code !== AUTO_DETECT_VALUE)
})

const swapIcon = computed(() => {
  return browser.runtime.getURL('icons/ui/swap.png')
})

// Reactive data for responsive layout (only for sidepanel)
const languageControlsRef = ref(null)
const isVerticalLayout = ref(false)
const MIN_WIDTH_THRESHOLD = 220 // Minimum width before switching to vertical layout
const isSidepanelContext = ref(false)

// Check if component is inside sidepanel
const checkIsSidepanelContext = () => {
  let element = languageControlsRef.value
  while (element && element.parentElement) {
    if (element.parentElement.classList.contains('sidepanel-wrapper') ||
        element.parentElement.closest('.sidepanel-container')) {
      isSidepanelContext.value = true
      return
    }
    element = element.parentElement
  }
  isSidepanelContext.value = false
}

// Resize observer for responsive behavior (only for sidepanel)
let resizeObserver = null

const checkLayout = () => {
  if (languageControlsRef.value && isSidepanelContext.value) {
    const width = languageControlsRef.value.offsetWidth
    isVerticalLayout.value = width < MIN_WIDTH_THRESHOLD

    logger.debug('[LanguageSelector] Layout check:', {
      width: width,
      isVertical: isVerticalLayout.value,
      threshold: MIN_WIDTH_THRESHOLD,
      isSidepanel: isSidepanelContext.value
    })
  }
}

// Setup resize observer (only for sidepanel)
const setupResizeObserver = () => {
  checkIsSidepanelContext()

  if (languageControlsRef.value && isSidepanelContext.value && 'ResizeObserver' in window) {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        checkLayout()
      }
    })
    resizeObserver.observe(languageControlsRef.value)

    // Initial check
    checkLayout()
  }
}

// Cleanup resize observer
const cleanupResizeObserver = () => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
}

// Methods
const handleSwapLanguages = async () => {
  try {
    const { getLanguageCodeForTTS: getLanguageCode } = await utilsFactory.getI18nUtils();
    const defaultTarget = await getLanguageCode(CONFIG?.TARGET_LANGUAGE) || 'en';

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

// Initialize languages and setup resize observer
onMounted(async () => {
  // Languages should already be preloaded by SidepanelApp
  // If not, load them asynchronously
  if (!languages.isLoaded.value) {
    await languages.loadLanguages().catch(error => {
      handleError(error, 'language-selector-languages')
    })
  }

  // Setup resize observer for responsive layout
  // Use setTimeout to ensure DOM is ready and initial width is calculated
  setTimeout(() => {
    setupResizeObserver()
  }, 100)
});

// Cleanup resize observer on unmount
onUnmounted(() => {
  cleanupResizeObserver()
})
</script>

<style scoped>
.ti-language-controls {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 6px 12px;
  gap: 6px;
  background: var(--language-controls-bg-color);
  margin: 8px 12px 0 12px;
}

/* Vertical layout for small sidepanel widths */
.ti-language-controls--vertical {
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
  padding: 4px 12px;
  min-height: fit-content;
}

.ti-language-controls--vertical .ti-language-select {
  width: 100%;
  max-width: none;
  min-width: auto;
  order: 1;
}

.ti-language-controls--vertical .ti-swap-button {
  order: 2;
  align-self: center;
  margin: 1px 0;
}

.ti-language-controls--vertical .ti-language-select:first-of-type {
  order: 3;
}

.ti-language-select {
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

.ti-language-select:focus {
  outline: none;
  border-color: #80bdff;
  box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
}

.ti-language-select:disabled {
  background-color: var(--bg-disabled, #e9ecef);
  color: var(--text-disabled, #6c757d);
  cursor: not-allowed;
}

.ti-swap-button {
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

.ti-swap-button:hover {
  background-color: var(--toolbar-link-hover-bg-color);
}

.ti-swap-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.ti-swap-button img {
  width: 16px;
  height: 16px;
  opacity: var(--icon-opacity);
  filter: var(--icon-filter);
  transition: opacity 0.2s ease-in-out;
}

.ti-swap-button:hover img {
  opacity: var(--icon-hover-opacity);
}

/* Responsive Design */
@media (max-width: 320px) {
  .ti-language-controls {
    gap: 4px;
  }

  .ti-language-select {
    font-size: 11px;
    padding: 4px 6px;
  }

  .ti-swap-button {
    width: 28px;
    padding: 4px;
  }
  
  .ti-swap-button img {
    width: 12px;
    height: 12px;
  }
}

/* Context-specific adjustments for popup vs sidepanel */
.popup-wrapper .ti-language-controls {
  align-items: center;
  height: 32px;
  justify-content: flex-end;
  padding: 0;
  margin: 0;
}

.popup-wrapper .ti-language-select {
  padding: 6px 30px 6px 10px;
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

.popup-wrapper .ti-swap-button {
  width: 32px;
  height: 32px;
  padding: 6px;
}

.popup-wrapper .ti-swap-button img {
  width: 18px;
  height: 18px;
}

.sidepanel-wrapper .ti-language-controls {
  height: 40px;
  align-items: center;
  padding: 4px 0;
  margin: 0;
  gap: 6px;
  box-sizing: border-box;
  background: transparent;
  flex: none;
}

.sidepanel-wrapper .ti-language-select {
  padding: 6px 30px 6px 10px;
  font-size: 14px;
  height: 32px;
  line-height: 1.4;
  min-width: 100px;
  max-width: 140px;
  width: auto;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  vertical-align: middle;
}

.sidepanel-wrapper .ti-swap-button {
  width: 32px;
  height: 32px;
  padding: 6px;
}

.sidepanel-wrapper .ti-swap-button img {
  width: 18px;
  height: 18px;
}

/* Vertical layout adjustments for sidepanel */
.sidepanel-wrapper .ti-language-controls--vertical {
  background: transparent;
  padding: 2px 0;
  margin: 0;
  height: auto;
  min-height: fit-content;
}

.sidepanel-wrapper .ti-language-controls--vertical .ti-language-select {
  width: 100%;
  max-width: none;
  min-width: auto;
  flex: none;
  height: 32px;
}

.sidepanel-wrapper .ti-language-controls--vertical .ti-swap-button {
  width: 32px;
  height: 32px;
  margin: 1px 0;
  align-self: center;
}
</style>