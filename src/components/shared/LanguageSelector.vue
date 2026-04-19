<template>
  <div
    ref="languageControlsRef"
    class="ti-language-controls"
    :class="{ 
      'ti-language-controls--vertical': isVerticalLayout && isSidepanelContext,
      'ti-compact-mode': compact 
    }"
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
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { CONFIG } from '@/shared/config/config.js'
import { AUTO_DETECT_VALUE } from '../../shared/config/constants'
import { utilsFactory } from '@/utils/UtilsFactory.js'
import { PROVIDER_SUPPORTED_LANGUAGES, getProviderLanguageCode } from '@/shared/config/languageConstants.js'

// Import adjacent SCSS
import './LanguageSelector.scss'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'LanguageSelector')

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
  const all = languages.allLanguages.value || [];
  if (!props.provider) return all;

  // Resolve effective keys
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
  if (!supportedCodes) return all;

  // Filter languages: check if the provider-specific code for this language is supported
  return all.filter(lang => {
    // 1. Get the code this provider uses for this language
    const providerCode = getProviderLanguageCode(lang.code, mappingKey);
    
    // 2. Check if that code (or the original) is in the supported list
    return supportedCodes.includes(providerCode) || supportedCodes.includes(lang.code);
  });
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
