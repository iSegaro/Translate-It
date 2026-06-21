<template>
  <div
    ref="languageControlsRef"
    class="ti-language-controls"
    :class="{ 
      'ti-language-controls--vertical': isVerticalLayout && isSidepanelContext,
      'ti-compact-mode': compact 
    }"
  >
    <!-- Regular Language Selection -->
    <template v-if="!isAutoLanguageProvider">
      <!-- Target Language Dropdown -->
      <div
        class="ti-language-control-group ti-language-control-group--target"
        :class="{ 'ti-language-control-group--with-default-action': showDefaultActions }"
      >
        <div class="ti-language-control-shell">
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
          <button
            v-if="showDefaultActions"
            type="button"
            class="ti-default-action-button"
            :class="{ 'is-active': targetIsSavedDefault }"
            :title="targetDefaultTitle || 'Set target as default'"
            :aria-label="targetDefaultTitle || 'Set target as default'"
            :disabled="disabled || !defaultActionsEnabled"
            @click="emit('set-default-target')"
          >
            <span
              aria-hidden="true"
              class="ti-default-action-icon"
            >{{ targetIsSavedDefault ? '★' : '☆' }}</span>
          </button>
        </div>
      </div>

      <!-- Swap Button -->
      <button
        type="button"
        class="ti-swap-button"
        :title="swapTitle"
        :disabled="disabled || !isSwapPossible"
        :class="{ 'ti-swap-button--disabled': !isSwapPossible }"
        @click="handleSwapLanguages"
      >
        <img
          :src="swapIcon"
          :alt="swapAlt"
        >
      </button>

      <!-- Source Language Dropdown -->
      <div
        class="ti-language-control-group ti-language-control-group--source"
        :class="{ 'ti-language-control-group--with-default-action': showDefaultActions }"
      >
        <div class="ti-language-control-shell">
          <select
            v-model="sourceLanguage"
            class="ti-language-select"
            :title="sourceTitle"
            :disabled="disabled"
            @click="handleDropdownClick"
          >
            <option 
              v-if="!sourceLanguage" 
              value="" 
              disabled
            >
              {{ t('select_language_placeholder') || 'Select Language' }}
            </option>
            <option 
              v-if="hasAutoDetect && allowAuto"
              value="auto"
            >
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
          <button
            v-if="showDefaultActions"
            type="button"
            class="ti-default-action-button"
            :class="{ 'is-active': sourceIsSavedDefault }"
            :title="sourceDefaultTitle || 'Set source as default'"
            :aria-label="sourceDefaultTitle || 'Set source as default'"
            :disabled="disabled || !defaultActionsEnabled"
            @click="emit('set-default-source')"
          >
            <span
              aria-hidden="true"
              class="ti-default-action-icon"
            >{{ sourceIsSavedDefault ? '★' : '☆' }}</span>
          </button>
        </div>
      </div>
    </template>

    <!-- Smart Language Indicator (e.g. for Vajehyab) -->
    <div 
      v-else 
      class="ti-smart-language-badge"
      :title="autoLanguageTitle"
    >
      <template v-if="vajehyabSearchUrl">
        <a 
          :href="vajehyabSearchUrl" 
          target="_blank" 
          class="ti-smart-link"
          @click.stop
        >
          {{ autoLanguageLabel }}
          <span class="ti-external-icon">↗</span>
        </a>
      </template>
      <span
        v-else
        class="ti-smart-text"
      >{{ autoLanguageLabel }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useLanguages } from '@/composables/shared/useLanguages.js'
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { useSelectElementTranslation } from '@/features/translation/composables/useTranslationModes.js'
import browser from 'webextension-polyfill'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { CONFIG } from '@/shared/config/config.js'
import { AUTO_DETECT_VALUE } from '../../shared/config/constants'
import { utilsFactory } from '@/utils/UtilsFactory.js'
import { PROVIDER_SUPPORTED_LANGUAGES, PROVIDER_LANGUAGE_PAIRS, getProviderLanguageCode } from '@/shared/config/languageConstants.js'
import { findProviderById } from '@/features/translation/providers/ProviderManifest.js'

// Import adjacent SCSS
import './LanguageSelector.scss'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'LanguageSelector')

// Props (must be defined first before using props.*)
const props = defineProps({
  sourceLanguage: {
    type: String,
    default: AUTO_DETECT_VALUE
  },
  targetLanguage: {
    type: String,
    default: 'en'
  },
  provider: {
    type: String,
    default: ''
  },
  beta: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  },
  compact: {
    type: Boolean,
    default: false
  },
  showDefaultActions: {
    type: Boolean,
    default: false
  },
  defaultActionsEnabled: {
    type: Boolean,
    default: true
  },
  sourceIsSavedDefault: {
    type: Boolean,
    default: false
  },
  targetIsSavedDefault: {
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
  },
  sourceDefaultTitle: {
    type: String,
    default: ''
  },
  targetDefaultTitle: {
    type: String,
    default: ''
  },
  autoLanguageLabel: {
    type: String,
    default: 'واژه‌یاب'
  },
  autoLanguageTitle: {
    type: String,
    default: 'This provider handles language detection automatically'
  },
  lastKeyword: {
    type: String,
    default: ''
  },
  allowAuto: {
    type: Boolean,
    default: true
  },
  // Enable select element mode integration (deactivates select mode on dropdown click)
  // Should be disabled for standalone pages like Subtitle that don't have element selection
  enableSelectElementIntegration: {
    type: Boolean,
    default: true
  }
})

// Emits
const emit = defineEmits([
  'update:sourceLanguage',
  'update:targetLanguage',
  'swap-languages',
  'set-default-source',
  'set-default-target'
])

// Composables
const { t } = useUnifiedI18n()
const languages = useLanguages()
const { handleError } = useErrorHandler()

// Conditionally initialize select element integration only when enabled
// This prevents GET_SELECT_ELEMENT_STATE messages from being sent on pages
// like Subtitle that don't have element selection capability
const selectElementIntegration = props.enableSelectElementIntegration
  ? useSelectElementTranslation()
  : { isSelectModeActive: { value: false }, deactivateSelectMode: () => {} }

const { isSelectModeActive, deactivateSelectMode } = selectElementIntegration

// Computed
const sourceLanguage = computed({
  get: () => props.sourceLanguage,
  set: (value) => emit('update:sourceLanguage', value)
})

const targetLanguage = computed({
  get: () => props.targetLanguage,
  set: (value) => emit('update:targetLanguage', value)
})

const providerInfo = computed(() => findProviderById(props.provider))
const hasAutoDetect = computed(() => providerInfo.value?.features?.includes('autoDetect'))
const isAutoLanguageProvider = computed(() => providerInfo.value?.features?.includes('autoLanguage'))

const isVajehyab = computed(() => props.provider?.toLowerCase() === 'vajehyab')
const vajehyabSearchUrl = computed(() => {
  if (!isVajehyab.value || !props.lastKeyword) return ''
  return `https://vajehyab.com/?q=${encodeURIComponent(props.lastKeyword)}`
})

/**
 * Base list of languages supported by the provider's general capabilities.
 * Does not include source/target specific pair restrictions yet.
 */
const providerBaseLanguages = computed(() => {
  const all = languages.allLanguages.value || [];
  if (!props.provider) return all;

  // Resolve effective keys for standard providers
  let providerKey = props.provider.toLowerCase();
  let mappingKey = 'GOOGLE';
  
  if (providerKey.includes('deepl')) {
    providerKey = props.beta ? 'deepl_beta' : 'deepl';
    mappingKey = 'DEEPL';
  } else if (providerKey.includes('google')) {
    providerKey = 'google';
    mappingKey = 'GOOGLE';
  } else if (providerKey.includes('lingva')) {
    providerKey = 'google';
    mappingKey = 'LINGVA';
  } else if (providerKey.includes('bing') || providerKey.includes('edge')) {
    providerKey = 'bing';
    mappingKey = 'BING';
  } else if (providerKey.includes('yandex')) {
    providerKey = 'yandex';
    mappingKey = 'YANDEX';
  } else if (providerKey.includes('browser')) {
    providerKey = 'browserapi';
    mappingKey = 'BROWSER'; 
  }

  const supportedCodes = PROVIDER_SUPPORTED_LANGUAGES[providerKey];
  if (supportedCodes) {
    return all.filter(lang => {
      const providerCode = getProviderLanguageCode(lang.code, mappingKey);
      return supportedCodes.includes(providerCode) || supportedCodes.includes(lang.code);
    });
  }

  return all;
})

/**
 * Filtered languages for the SOURCE dropdown.
 */
const availableLanguages = computed(() => {
  let filtered = providerBaseLanguages.value;

  // Apply restricted source mapping if applicable (e.g., Vajehyab)
  const restrictedMap = PROVIDER_LANGUAGE_PAIRS[props.provider];
  if (restrictedMap) {
    filtered = filtered.filter(l => !!restrictedMap[l.code]);
  }

  return filtered;
})

/**
 * Filtered languages for the TARGET dropdown.
 */
const targetLanguages = computed(() => {
  const base = providerBaseLanguages.value;
  const restrictedMap = PROVIDER_LANGUAGE_PAIRS[props.provider];

  if (restrictedMap) {
    const currentSource = sourceLanguage.value;
    // For specialized providers, filter targets based on the current source
    if (currentSource !== AUTO_DETECT_VALUE && restrictedMap[currentSource]) {
      const allowedTargets = restrictedMap[currentSource];
      return base.filter(l => allowedTargets.includes(l.code));
    } else if (currentSource === AUTO_DETECT_VALUE) {
      // If source is auto (and somehow allowed), show union of all possible targets
      const allPossibleTargets = new Set(Object.values(restrictedMap).flat());
      return base.filter(l => allPossibleTargets.has(l.code));
    }
  }

  // Standard provider: Just filter out Auto-Detect from target languages
  return base.filter(lang => lang.code !== AUTO_DETECT_VALUE)
})

const swapIcon = computed(() => {
  return browser.runtime.getURL('icons/ui/swap.png')
})

const isSwapPossible = computed(() => {
  const restrictedMap = PROVIDER_LANGUAGE_PAIRS[props.provider];
  if (!restrictedMap) return true;

  const currentSource = sourceLanguage.value;
  const currentTarget = targetLanguage.value;

  // Swap is possible if the target can become a source, 
  // AND the current source is a valid target for that new source (or is auto-detect).
  return !!restrictedMap[currentTarget] && (currentSource === AUTO_DETECT_VALUE || restrictedMap[currentTarget].includes(currentSource));
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

// Resize observer for responsive behavior
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

// Setup resize observer
const setupResizeObserver = () => {
  checkIsSidepanelContext()

  if (languageControlsRef.value && isSidepanelContext.value && 'ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        checkLayout()
      })
    })
    resizeObserver.observe(languageControlsRef.value)
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
  if (!isSwapPossible.value) {
    logger.debug('[LanguageSelector] Swap blocked: target not supported as source for this provider.');
    return;
  }

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
  }
};

const handleDropdownClick = () => {
  if (isSelectModeActive.value) {
    deactivateSelectMode();
  }
}

// Hooks
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

onUnmounted(() => {
  cleanupResizeObserver()
})
</script>
