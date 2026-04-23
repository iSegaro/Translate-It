<template>
  <div class="sidepanel-wrapper main-content">
    <!-- Language Controls Section -->
    <div
      ref="languageControlsRef"
      class="language-controls"
      :class="{ 'language-controls--wide': isWideLayout }"
    >
      <!-- Language Selector Row -->
      <div class="language-selector-row">
        <LanguageSelector
          v-model:source-language="sourceLanguage"
          v-model:target-language="targetLanguage"
          :provider="currentProviderLocal"
          :beta="settingsStore.settings.DEEPL_BETA_LANGUAGES_ENABLED"
          :source-title="t('SIDEPANEL_SOURCE_LANGUAGE_TITLE', 'زبان مبدا')"
          :target-title="t('SIDEPANEL_TARGET_LANGUAGE_TITLE', 'زبان مقصد')"
          :swap-title="t('SIDEPANEL_SWAP_LANGUAGES_TITLE', 'جابجایی زبان‌ها')"
          :swap-alt="t('SIDEPANEL_SWAP_LANGUAGES_ALT', 'Swap')"
          :auto-detect-label="'Auto-Detect'"
        />

        <!-- Translate Button (shown alongside language selectors in wide layout) -->
        <div
          v-if="isWideLayout"
          class="translate-button-inline"
        >
          <button
            class="ti-icon-button inline-clear-btn"
            :title="t('SIDEPANEL_CLEAR_STORAGE_TITLE_ICON', 'Clear fields')"
            @click="clearFields"
          >
            <img
              :src="browser.runtime.getURL('icons/ui/clear.png')"
              class="ti-toolbar-icon"
              alt="Clear"
            >
          </button>
          <ProviderSelector
            v-model="currentProviderLocal"
            mode="split"
            :is-global="false"
            :show-sync="true"
            :loading="isTranslating"
            @translate="handleTranslate"
            @cancel="cancelTranslation"
          />
        </div>
      </div>

      <!-- Translate Button Row (only shown in narrow layout) -->
      <div
        v-if="!isWideLayout"
        class="translate-button-row"
      >
        <button
          class="ti-icon-button row-clear-btn"
          :title="t('SIDEPANEL_CLEAR_STORAGE_TITLE_ICON', 'Clear fields')"
          @click="clearFields"
        >
          <img
            :src="browser.runtime.getURL('icons/ui/clear.png')"
            class="ti-toolbar-icon"
            alt="Clear"
          >
        </button>
        <div class="center-spacer">
          <ProviderSelector
            v-model="currentProviderLocal"
            mode="split"
            :is-global="false"
            :show-sync="true"
            :loading="isTranslating"
            @translate="handleTranslate"
            @cancel="cancelTranslation"
          />
        </div>
        <div class="end-spacer" />
      </div>
    </div>


    <!-- Translation Form (similar to popup structure) -->
    <form
      class="translation-form"
      @submit.prevent="handleTranslate"
    >
      <!-- Source Input Field -->
      <TranslationInputField
        ref="sourceInputRef"
        v-model="sourceText"
        :placeholder="t('SIDEPANEL_SOURCE_TEXT_PLACEHOLDER', 'Type Here')"
        :language="actualSourceLanguage"
        :detected-source-language="actualSourceLanguage"
        :last-translation="lastTranslation"
        :rows="6"
        :tabindex="1"
        :copy-title="t('SIDEPANEL_COPY_SOURCE_TITLE_ICON', 'Copy source text')"
        :copy-alt="t('SIDEPANEL_COPY_SOURCE_ALT_ICON', 'Copy')"
        :tts-title="t('SIDEPANEL_VOICE_SOURCE_TITLE_ICON', 'Speak source text')"
        :tts-alt="t('SIDEPANEL_VOICE_SOURCE_ALT_ICON', 'Voice Source')"
        :paste-title="t('SIDEPANEL_PASTE_SOURCE_TITLE_ICON', 'Paste from clipboard')"
        :paste-alt="t('SIDEPANEL_PASTE_SOURCE_ALT_ICON', 'Paste')"
        :auto-translate-on-paste="autoTranslateOnPaste"
        @translate="handleTranslate"
      />

      <!-- Translation Display -->
      <div class="output-container">
        <TranslationDisplay
          ref="translationResultRef"
          :content="translatedText"
          :language="actualTargetLanguage"
          :target-language="actualTargetLanguage"
          :last-translation="lastTranslation"
          :is-loading="isTranslating"
          :error="translationError"
          :error-type="errorType"
          :placeholder="t('SIDEPANEL_TARGET_TEXT_PLACEHOLDER', 'Translation result will appear here')"
          :copy-title="t('SIDEPANEL_COPY_TARGET_TITLE_ICON', 'Copy translation')"
          :copy-alt="t('SIDEPANEL_COPY_TARGET_ALT_ICON', 'Copy Result')"
          :tts-title="t('SIDEPANEL_VOICE_TARGET_TITLE_ICON', 'Speak translation')"
          :tts-alt="t('SIDEPANEL_VOICE_TARGET_ALT_ICON', 'Voice Target')"
          mode="sidepanel"
          :enable-markdown="true"
          :show-fade-in-animation="true"
        />
      </div>
    </form>
  </div>
</template>

<script setup>
import './SidepanelMainContent.scss'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useUnifiedTranslation } from '@/features/translation/composables/useUnifiedTranslation.js'
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { useSettingsStore } from '@/features/settings/stores/settings.js'

// Components
import LanguageSelector from '@/components/shared/LanguageSelector.vue'
import ProviderSelector from '@/components/shared/ProviderSelector.vue'
import TranslationInputField from '@/components/shared/TranslationInputField.vue'
import TranslationDisplay from '@/components/shared/TranslationDisplay.vue'
import browser from 'webextension-polyfill'

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'SidepanelMainContent');

// Resource tracker for automatic cleanup

// Stores
const settingsStore = useSettingsStore()

// Composables
const { t } = useUnifiedI18n();
const {
  sourceText,
  translatedText,
  sourceLanguage,
  targetLanguage,
  isTranslating,
  translationError,
  errorType,
  canTranslate,
  actualSourceLanguage,
  actualTargetLanguage,
  lastTranslation,
  triggerTranslation,
  cancelTranslation,
  clearTranslation,
  loadLastTranslation
} = useUnifiedTranslation('sidepanel');
const { handleError } = useErrorHandler()

// Refs
const sourceInputRef = ref(null)
const translationResultRef = ref(null)

// Props
const props = defineProps({
  provider: {
    type: String,
    default: ''
  }
})

// Emits
defineEmits(['can-translate-change', 'update:provider'])

// State
const currentProviderLocal = ref(props.provider)

// Watch for prop changes to sync local state
watch(() => props.provider, (newVal) => {
  if (newVal && newVal !== currentProviderLocal.value) {
    currentProviderLocal.value = newVal
  }
})

// Language state management
const autoTranslateOnPaste = ref(false)
const canTranslateFromForm = ref(false)

// Responsive layout management for Translate button placement
const languageControlsRef = ref(null)
const isWideLayout = ref(false)
const WIDE_LAYOUT_THRESHOLD = 510 // Minimum width for horizontal layout with Translate button and Clear Fields button

// Resize observer for responsive layout
let resizeObserver = null

const checkLayout = () => {
  if (languageControlsRef.value) {
    const width = languageControlsRef.value.offsetWidth
    isWideLayout.value = width >= WIDE_LAYOUT_THRESHOLD

    logger.debug('[SidepanelMainContent] Layout check:', {
      width: width,
      isWideLayout: isWideLayout.value,
      threshold: WIDE_LAYOUT_THRESHOLD
    })
  }
}

// Setup resize observer
const setupResizeObserver = () => {
  if (languageControlsRef.value && 'ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(() => {
      // Use requestAnimationFrame to prevent ResizeObserver loop warnings
      requestAnimationFrame(() => {
        checkLayout()
      })
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

// Watch canTranslate and emit changes
watch(canTranslate, (newValue) => {
  canTranslateFromForm.value = newValue
}, { immediate: true })

// Watch for language changes to log them
watch(sourceLanguage, (newValue, oldValue) => {
  logger.debug("🌍 Source language code changed:", oldValue, "→", newValue);
}, { immediate: true })

watch(targetLanguage, (newValue, oldValue) => {
  logger.debug("🌍 Target language code changed:", oldValue, "→", newValue);
}, { immediate: true })

// Reactive language values for other parts of the UI that might need them
const currentSourceLanguage = computed(() => {
  return sourceLanguage.value;
})
const currentTargetLanguage = computed(() => {
  return targetLanguage.value;
})

// Methods
/**
 * Handle translation requests
 * @param {Object} data - Optional data from ProviderSelector (contains provider ID)
 */
const handleTranslate = async (data) => {
  // Use the provider from event data if available, otherwise use local state
  const providerId = data?.provider || currentProviderLocal.value;
  
  logger.debug("Translation button clicked", { provider: providerId });
  
  if (!canTranslate.value) {
    logger.debug("Translation skipped - input is empty or invalid");
    return;
  }
  
  try {
    logger.debug("Starting translation process...");
    
    let success = false;
    // Fallback to direct composable call (already handles languages)
    success = await triggerTranslation(currentSourceLanguage.value, currentTargetLanguage.value, providerId);
    
    if (success) {
      logger.info("Translation completed successfully");
    } else {
      logger.debug("Translation failed (handled internally)");
    }

  } catch (error) {
    logger.error("Translation failed (unexpected):", error);
    await handleError(error, 'sidepanel-translation')
  }
}

const clearFields = async () => {
  logger.debug("Clearing fields and resetting languages");
  await clearTranslation();
};

// Expose methods and refs to the parent component
defineExpose({
  clearFields,
  sourceInputRef
});


// Event listeners
onMounted(async () => {
  logger.debug("[SidepanelMainContent] Component mounting...");
  // Language initialization is now handled by useUnifiedTranslation.
  // Load last translation if any
  await loadLastTranslation()

  // Setup resize observer for responsive layout
  // Use setTimeout to ensure DOM is ready and initial width is calculated
  setTimeout(() => {
    setupResizeObserver()
  }, 100)
});

onUnmounted(() => {
  cleanupResizeObserver()
});
</script>
