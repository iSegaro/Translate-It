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
            :disabled="!canTranslateFromForm"
            @translate="handleTranslate"
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
            :disabled="!canTranslateFromForm"
            @translate="handleTranslate"
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
        :language="currentSourceLanguage"
        :source-language="currentSourceLanguage"
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
          :language="currentTargetLanguage"
          :target-language="currentTargetLanguage"
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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useUnifiedTranslation } from '@/features/translation/composables/useUnifiedTranslation.js'
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'

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
  triggerTranslation,
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
const handleTranslate = async () => {
  logger.debug("Translation button clicked", { provider: currentProviderLocal.value });
  
  if (!canTranslate.value) {
    logger.warn("⚠️ Translation blocked - canTranslate is false");
    return;
  }
  
  try {
    logger.info("🗳️ Starting translation process...");
    
    // Use ref to trigger translation if available, otherwise fallback to composable
    if (sourceInputRef.value && typeof sourceInputRef.value.triggerTranslation === 'function') {
      await sourceInputRef.value.triggerTranslation();
    } else {
      // Fallback to direct composable call (already handles languages)
      await triggerTranslation(currentSourceLanguage.value, currentTargetLanguage.value, currentProviderLocal.value);
    }
    
    logger.info("✅ Translation completed successfully");

  } catch (error) {
    logger.error("❌ Translation failed:", error);
    await handleError(error, 'sidepanel-translation')
  }
}

const clearFields = async () => {
  logger.debug("🧹 Clearing fields and resetting languages");
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

<style lang="scss" scoped>
@use "@/assets/styles/base/mixins" as *;

.sidepanel-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}

.main-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  flex: 1;
}

.language-controls {
  display: flex;
  flex-direction: column;
  padding: 12px;
  margin: 0;
  gap: 12px;
  background: var(--language-controls-bg-color);
  box-sizing: border-box;
  flex-shrink: 0;
  position: relative;
  z-index: 10; /* Restored to original priority */
}

/* Wide layout: Translate button alongside language selectors */
.language-controls--wide {
  flex-direction: column;
}

.language-controls--wide .language-selector-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  flex-wrap: nowrap;
}

.language-controls--wide .translate-button-inline {
  flex: 1;
  margin-left: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.language-controls--wide .inline-clear-btn {
  margin-right: auto;
}

.language-controls--wide .translate-button-inline :deep(.provider-selector) {
  min-width: auto;
  max-width: none;
}

.language-selector-row {
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  max-width: 100%;
  overflow: visible;
  position: relative;
  z-index: 11;
  min-height: 40px;
  box-sizing: border-box;
  padding: 0 8px;
}

.language-selector-row :deep(.language-controls) {
  width: 100%;
  max-width: calc(100% - 16px);
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  gap: 8px;
  padding: 8px 0;
  margin: 0;
  background: transparent;
  height: auto;
  justify-content: flex-start;
  flex-wrap: nowrap !important;
}

.language-selector-row :deep(.language-select) {
  flex: 1 1 auto !important;
  min-width: 70px;
  max-width: 120px !important;
  opacity: 1 !important;
  visibility: visible !important;
  display: block !important;
  position: relative !important;
  box-sizing: border-box !important;
}

/* In wide layout, make language selects slightly smaller to make room for Translate button */
.language-controls--wide .language-selector-row :deep(.language-select) {
  max-width: 100px !important;
  min-width: 65px;
}

.language-selector-row :deep(.swap-button) {
  flex: 0 0 32px !important;
  width: 32px;
  height: 32px;
  opacity: 1 !important;
  visibility: visible !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  position: relative !important;
  z-index: 12 !important;
  background: var(--color-bg-secondary) !important;
  border: 1px solid var(--color-border) !important;
  border-radius: 4px !important;
  box-sizing: border-box !important;
}

.language-selector-row :deep(.swap-button img) {
  opacity: 1 !important;
  visibility: visible !important;
  display: block !important;
  width: 16px !important;
  height: 16px !important;
}

.translate-button-row {
  display: flex;
  align-items: center;
  width: 100%;
  position: relative;
  z-index: 5;
  min-height: 40px;
  box-sizing: border-box;
  margin-top: 8px;
  padding: 0 8px;
}

.center-spacer {
  flex: 1;
  display: flex;
  justify-content: center;
}

.end-spacer {
  width: 20px; /* Same as clear button width to keep Translate perfectly centered */
}

.translate-button-row :deep(.provider-selector) {
  min-width: auto;
}

.ti-icon-button {
  @include toolbar-button-minimal;
}

.ti-toolbar-icon {
  width: 16px;
  height: 16px;
  opacity: var(--icon-opacity, 0.6);
  filter: var(--icon-filter);
  transition: opacity 0.2s ease-in-out;
}

.ti-icon-button:hover .ti-toolbar-icon {
  opacity: var(--icon-hover-opacity, 1);
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.translation-form {
  display: flex;
  flex-direction: column;
  gap: 0;
  height: 100%;
  flex: 1;
}

/* Sidepanel-specific adjustments (similar to popup) */
.translation-form :deep(.textarea-container) {
  position: relative;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background-color: var(--color-textarea-background);
  padding: 5px;
  margin: 6px 12px;
}

.translation-form :deep(.translation-textarea) {
  min-height: 120px;
  max-height: 200px;
  font-size: 13px;
  padding: 42px 8px 8px 8px;
}


.output-container {
  margin: 6px 12px;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}


.translation-form :deep(.result-content) {
  flex: 1;
  min-height: 0;
  max-height: none;
  font-size: 13px;
  height: 100%;
  margin: 6px 12px;
}

.translation-form :deep(.translation-textarea) {
  min-height: 120px;
  max-height: 200px;
  font-size: 13px;
  padding: 42px 8px 8px 8px;
}


.output-container {
  margin: 6px 12px;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}


.translation-form :deep(.result-content) {
  flex: 1;
  min-height: 0;
  max-height: none;
  font-size: 13px;
  height: 100%;
}

</style>
