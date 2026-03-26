<!-- eslint-disable vue/no-v-html -->
<template>
  <div
    ref="containerRef"
    class="ti-translation-display"
    :class="[
      {
        'has-content': hasContent,
        'is-loading': isLoading,
        'has-error': hasError,
        'compact-mode': mode === 'compact',
        'popup-mode': mode === 'popup',
        'sidepanel-mode': mode === 'sidepanel',
        'selection-mode': mode === 'selection',
        'mobile-mode': mode === 'mobile',
        'is-dark': settingsStore.isDarkTheme,
      },
      containerClass,
    ]"
    :style="mode === 'mobile' ? `background: var(--ti-mobile-accent-bg) !important; border: 1px solid var(--ti-mobile-border) !important; color: var(--ti-mobile-accent) !important;` : (cssVariables || {})"
  >
    <!-- Simplified Loading State -->
    <div
      v-if="isLoading"
      :style="`display: flex !important; align-items: center !important; justify-content: center !important; min-height: 100px !important; width: 100% !important; height: 100% !important; position: absolute !important; top: 0 !important; left: 0 !important; z-index: 100 !important; background: ${mode === 'mobile' ? 'transparent' : 'var(--ti-mobile-bg)'} !important; border-radius: 8px !important; direction: ltr !important;`"
    >
      <LoadingSpinner
        type="animated"
        size="lg"
      />
    </div>

    <!-- Main Content State -->
    <template v-else>
      <!-- Enhanced Actions Toolbar (Desktop/Standard) -->
      <ActionToolbar
        v-show="showToolbar && hasContent && mode !== 'mobile'"
        :text="content"
        :language="targetLanguage"
        :mode="mode === 'sidepanel' ? 'sidepanel' : 'output'"
        class="ti-display-toolbar"
        :show-copy="showCopyButton"
        :show-paste="false"
        :show-tts="showTTSButton"
        :copy-title="copyTitle"
        :tts-title="ttsTitle"
        @text-copied="handleTextCopied"
        @tts-started="handleTTSStarted"
        @tts-stopped="handleTTSStopped"
        @tts-speaking="handleTTSSpeaking"
        @action-failed="handleActionFailed"
      />

      <!-- Content Display -->
      <div
        ref="contentRef"
        class="ti-translation-content"
        :class="[
          {
            'fade-in': false /* Animation disabled */,
            /* 'loading-dim': isLoading */
            'has-error': hasError
          },
          contentClass,
          { 'rtl-content': textDirection?.dir === 'rtl' },
        ]"
        :dir="textDirection?.dir || 'ltr'"
        :style="mode === 'mobile' ? `direction: ${textDirection?.dir || 'ltr'} !important; text-align: ${textDirection?.textAlign || 'left'} !important; cursor: pointer !important; color: var(--ti-mobile-accent) !important; padding: 0 !important; font-size: 16px !important; line-height: 1.5 !important;` : {
          ...(fontStyles || {}),
          ...(cssVariables || {}),
          direction: textDirection?.dir || 'ltr',
          textAlign: textDirection?.textAlign || 'left',
          cursor: mode === 'mobile' ? 'pointer' : 'default'
        }"
        @click="handleContentClick"
      >
        <div 
          v-if="hasError" 
          class="error-message"
          style="display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; text-align: center !important; width: 100% !important; gap: 8px !important; padding: 12px 8px !important; box-sizing: border-box !important; margin: 4px auto !important; white-space: normal !important;"
        >
          <div 
            class="error-text"
            style="display: block !important; width: 100% !important; margin: 0px !important; text-align: center !important; color: rgb(176, 42, 55) !important; font-weight: 500 !important; font-size: 13px !important; line-height: 1.4 !important;"
          >
            ⚠️ {{ displayErrorMessage }}
          </div>

          <div 
            v-if="canRetry || canOpenSettings" 
            class="error-actions"
            style="display: flex !important; gap: 8px !important; justify-content: center !important; align-items: center !important; width: 100% !important; margin-top: 4px !important;"
          >
            <button 
              v-if="canRetry" 
              class="error-action retry-btn" 
              @click="handleRetry"
            >
              🔄 {{ t('action_retry') }}
            </button>
            <button 
              v-if="canOpenSettings" 
              class="error-action settings-btn" 
              @click="handleSettings"
            >
              ⚙️ {{ t('action_settings') }}
            </button>
          </div>
        </div>

        <!-- Placeholder State -->
        <div
          v-else-if="!content"
          class="placeholder-message"
        >
          {{ placeholder }}
        </div>

        <!-- Normal Content with Markdown Support -->
        <div
          v-else
          v-html="sanitizedContent"
        />
      </div>

      <!-- Mobile Actions Row -->
      <div 
        v-if="mode === 'mobile' && hasContent"
        class="ti-mobile-actions"
        style="display: flex !important; width: 100% !important; gap: 10px !important; margin-top: 15px !important; padding-top: 15px !important; border-top: 1px solid var(--ti-mobile-header-border) !important; box-sizing: border-box !important; justify-content: space-between !important;"
        @click.stop
      >
        <button 
          class="mobile-action-btn secondary-action" 
          style="flex: 1 !important; display: flex !important; align-items: center !important; justify-content: center !important; gap: 6px !important; height: 46px !important; border-radius: 12px !important; background: var(--ti-mobile-btn-bg) !important; color: var(--ti-mobile-accent) !important; border: 1px solid var(--ti-mobile-btn-border) !important;"
          @click="handleMobileSpeak" 
          :title="ttsStatus === 'playing' ? t('mobile_selection_stop_tooltip') : ttsTitle"
        >
          <svg
            v-if="ttsStatus === 'playing'"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="currentColor"
            style="flex-shrink: 0 !important; display: block !important;"
          >
            <rect x="6" y="6" width="12" height="12" rx="1.5" />
          </svg>
          <img 
            v-else
            src="@/icons/ui/speaker.png" 
            :alt="ttsAlt" 
            style="width: 16px !important; height: 16px !important; object-fit: contain !important; filter: var(--ti-mobile-icon-filter) !important;" 
          />
          <span style="display: flex !important; align-items: center !important; line-height: 1 !important;">
            {{ ttsStatus === 'playing' ? t('mobile_selection_stop_label') : t('mobile_selection_speak_tooltip') }}
          </span>
        </button>
        
        <button 
          class="mobile-action-btn secondary-action" 
          style="flex: 1 !important; display: flex !important; align-items: center !important; justify-content: center !important; gap: 6px !important; height: 46px !important; border-radius: 12px !important; background: var(--ti-mobile-btn-bg) !important; color: var(--ti-mobile-accent) !important; border: 1px solid var(--ti-mobile-btn-border) !important;"
          @click="handleMobileCopy" 
          :title="copyTitle"
        >
          <img src="@/icons/ui/copy.png" :alt="copyAlt" style="width: 16px !important; height: 16px !important; object-fit: contain !important; filter: var(--ti-mobile-icon-filter) !important;" />
          <span style="display: flex !important; align-items: center !important; line-height: 1 !important;">
            {{ t('mobile_selection_copy_tooltip') }}
          </span>
        </button>
        
        <button 
          class="mobile-action-btn icon-only-action" 
          style="flex: 1 !important; display: flex !important; align-items: center !important; justify-content: center !important; height: 46px !important; border-radius: 12px !important; background: var(--ti-mobile-btn-bg) !important; border: 1px solid var(--ti-mobile-btn-border) !important;"
          @click="handleMobileHistory" 
          :title="t('mobile_selection_history_tooltip')"
        >
          <img src="@/icons/ui/history.svg" :alt="t('mobile_history_button_alt')" style="width: 16px !important; height: 16px !important; object-fit: contain !important; filter: var(--ti-mobile-icon-filter) !important;" />
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from "vue";
import { useSettingsStore } from "@/features/settings/stores/settings.js";
import { shouldApplyRtl } from "@/shared/utils/text/textAnalysis.js";
import { getTextDirection, isRTLLanguage, detectTextDirectionFromContent } from "@/features/element-selection/utils/textDirection.js";
import { SimpleMarkdown } from "@/shared/utils/text/markdown.js";
import DOMPurify from "dompurify";
import ActionToolbar from "@/features/text-actions/components/ActionToolbar.vue";
import LoadingSpinner from "@/components/base/LoadingSpinner.vue";
import { useFont } from "@/composables/shared/useFont.js";
import { useUnifiedI18n } from "@/composables/shared/useUnifiedI18n.js";
import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";

// Localization
const { t, locale } = useUnifiedI18n();
const settingsStore = useSettingsStore();

// Props
const props = defineProps({
  // Core content
  content: {
    type: String,
    default: "",
  },
  language: {
    type: String,
    default: "fa",
  },

  // State
  isLoading: {
    type: Boolean,
    default: false,
  },
  error: {
    type: String,
    default: "",
  },
  errorType: {
    type: String,
    default: null,
  },

  // Enhanced error props
  canRetry: {
    type: Boolean,
    default: false,
  },
  canOpenSettings: {
    type: Boolean,
    default: false,
  },
  onRetry: {
    type: Function,
    default: null,
  },
  onOpenSettings: {
    type: Function,
    default: null,
  },

  // Display options
  mode: {
    type: String,
    default: "standard", // standard, compact, popup, sidepanel, selection, mobile
    validator: (value) =>
      ["standard", "compact", "popup", "sidepanel", "selection", "mobile"].includes(
        value,
      ),
  },
  placeholder: {
    type: String,
    default: "Translation will appear here...",
  },

  // Formatting options
  enableMarkdown: {
    type: Boolean,
    default: true,
  },
  enableLabelFormatting: {
    type: Boolean,
    default: true,
  },
  maxHeight: {
    type: String,
    default: null,
  },

  // Toolbar options
  showToolbar: {
    type: Boolean,
    default: true,
  },
  showCopyButton: {
    type: Boolean,
    default: true,
  },
  showTTSButton: {
    type: Boolean,
    default: true,
  },

  // Animation
  showFadeInAnimation: {
    type: Boolean,
    default: true,
  },

  // i18n titles
  copyTitle: {
    type: String,
    default: "Copy result",
  },
  copyAlt: {
    type: String,
    default: "Copy",
  },
  ttsTitle: {
    type: String,
    default: "Play result",
  },
  ttsAlt: {
    type: String,
    default: "Play",
  },
  // Target language for TTS
  targetLanguage: {
    type: String,
    default: "fa",
  },
  // TTS Status for mobile toggle
  ttsStatus: {
    type: String,
    default: "idle", // idle, loading, playing, paused, error
  },

  // Enhanced popup-specific props
  containerClass: {
    type: String,
    default: "",
  },
  contentClass: {
    type: String,
    default: "",
  },
});

// Emits
const emit = defineEmits([
  "text-copied",
  "text-pasted",
  "tts-started",
  "tts-stopped",
  "tts-speaking", // backward compatibility
  "action-failed",
  "retry-requested",
  "settings-requested",
  "history-requested",
  "content-click",
]);

// Refs
const contentRef = ref(null);
const containerRef = ref(null);

// Scoped logger
const logger = getScopedLogger(LOG_COMPONENTS.UI, "TranslationDisplay");

// Computed
const hasContent = computed(
  () => props.content && props.content.trim().length > 0 && !props.isLoading,
);
const hasError = computed(() => !!props.error && !props.isLoading);

// Reactive error message display
const displayErrorMessage = computed(() => {
  if (!props.errorType) return props.error;
  
  // Construct translation key (standard ERRORS_ prefix)
  const key = props.errorType.startsWith('ERRORS_') ? props.errorType : `ERRORS_${props.errorType}`;
  const translated = t(key);
  
  // If translation exists, return it, otherwise fallback to static error prop
  return (translated && translated !== key) ? translated : props.error;
});

// Safe language code detector for UI
const currentUiLang = computed(() => {
  const lang = locale.value || 'en';
  return String(lang).toLowerCase();
});

// Font management with safe error handling and RTL-aware CSS variables
let fontStyles = ref({});
let cssVariables = ref({});

try {
  // Initialize useFont with target language (or UI language if there's an error)
  const { fontStyles: computedFontStyles, cssVariables: computedCssVariables } =
    useFont(
      computed(() => hasError.value ? currentUiLang.value : props.targetLanguage),
      {
        enableSmartDetection: true,
        fallbackFont: "system",
        enableCSSVariables: true,
        forcedDirection: computed(() => textDirection.value.dir) // Pass detected direction
      },
    );

  fontStyles = computedFontStyles;

  // Override CSS variables to ensure proper RTL/LTR direction
  cssVariables = computed(() => {
    const vars = { ...computedCssVariables.value };
    // Ensure direction variables match our text direction
    if (textDirection.value.dir === 'rtl') {
      vars['--translation-direction'] = 'rtl';
      vars['--translation-text-align'] = 'right';
      vars['--list-padding'] = '0 3em 0 0';
      vars['--list-text-align'] = 'right';
    } else {
      vars['--translation-direction'] = 'ltr';
      vars['--translation-text-align'] = 'left';
      vars['--list-padding'] = '0 0 0 3em';
      vars['--list-text-align'] = 'left';
    }
    return vars;
  });

  logger.debug("Font management initialized successfully with RTL-aware CSS variables");
} catch (error) {
  logger.warn("Font management not available, using fallback styles:", error);
  // Fallback styles when useFont fails
  fontStyles = computed(() => ({}));

  // Create fallback CSS variables with proper RTL/LTR support
  cssVariables = computed(() => {
    const dir = textDirection.value.dir;
    return {
      '--translation-direction': dir,
      '--translation-text-align': dir === 'rtl' ? 'right' : 'left',
      '--list-padding': dir === 'rtl' ? '0 2em 0 0' : '0 0 0 2em',
      '--list-text-align': dir === 'rtl' ? 'right' : 'left',
    };
  });
}

// Enhanced text direction computation with content-first detection
const textDirection = computed(() => {
  // If we have an error, follow UI language direction strictly
  if (hasError.value) {
    const lang = currentUiLang.value;
    const direction = isRTLLanguage(lang) ? 'rtl' : 'ltr';
    return {
      dir: direction,
      textAlign: direction === 'rtl' ? 'right' : 'left',
    };
  }

  const textToCheck = props.content || "";
  if (!textToCheck.trim()) {
    const direction = isRTLLanguage(props.targetLanguage) ? 'rtl' : 'ltr';
    return { dir: direction, textAlign: direction === 'rtl' ? 'right' : 'left' };
  }

  // Use advanced content-based detection
  const direction = detectTextDirectionFromContent(textToCheck, props.targetLanguage);

  return {
    dir: direction,
    textAlign: direction === 'rtl' ? 'right' : 'left',
  };
});

// Sanitized content computed property
const sanitizedContent = computed(() => {
  return DOMPurify.sanitize(renderedContent.value);
});

const renderedContent = computed(() => {
  if (!props.content) {
    return '';
  }

  if (props.enableMarkdown) {
    try {
      const markdownElement = SimpleMarkdown.render(props.content);
      if (markdownElement) {
        // Wrap innerHTML in simple-markdown div for CSS targeting
        return `<div class="simple-markdown">${markdownElement.innerHTML}</div>`;
      }
      return props.content.replace(/\n/g, "<br>");
    } catch (error) {
      logger.warn("[TranslationDisplay] Markdown rendering failed:", error);
      return props.content.replace(/\n/g, "<br>");
    }
  } else {
    return props.content.replace(/\n/g, "<br>");
  }
});

// Watchers
watch(
  () => props.content,
  () => {
    // Fade-in animation disabled as requested
  },
  { immediate: true },
);

// Action Toolbar Event Handlers
const handleTextCopied = (text) => {
  emit("text-copied", text);
};

const handleTTSStarted = (data) => {
  emit("tts-started", data);
  emit("tts-speaking", data); // backward compatibility
};

const handleTTSStopped = () => {
  emit("tts-stopped");
};

const handleTTSSpeaking = (data) => {
  emit("tts-speaking", data);
};

const handleContentClick = () => {
  emit("content-click");
};

const handleActionFailed = (error) => {
  emit("action-failed", error);
};

// Mobile Action Handlers
const handleMobileSpeak = () => {
  if (props.ttsStatus === 'playing') {
    emit('tts-stopped');
  } else {
    emit('tts-started', {
      text: props.content,
      language: props.targetLanguage
    });
  }
};

const handleMobileCopy = async () => {
  const textToCopy = SimpleMarkdown.strip ? SimpleMarkdown.strip(props.content) : props.content;
  try {
    await navigator.clipboard.writeText(textToCopy);
    emit('text-copied', textToCopy);
  } catch (error) {
    emit('action-failed', error);
  }
};

const handleMobileHistory = () => {
  emit('history-requested');
};

// Error action handlers
const handleRetry = () => {
  if (props.onRetry) {
    props.onRetry();
  }
  emit("retry-requested");
};

const handleSettings = () => {
  if (props.onOpenSettings) {
    props.onOpenSettings();
  }
  emit("settings-requested");
};

// Setup dynamic height for different modes
onMounted(() => {
  if (props.maxHeight && contentRef.value) {
    contentRef.value.style.maxHeight = props.maxHeight;
  }
});
</script>

<style scoped>
/* Base container */
.ti-translation-display {
  position: relative;
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--color-border, #dee2e6);
  border-radius: 8px;
  background-color: var(--bg-result-color, #ffffff);
  transition: min-height 0.2s ease;
  -webkit-tap-highlight-color: transparent !important;
}

/* Ensure container has height during loading for the overlay to center properly */
.ti-translation-display.is-loading {
  min-height: 120px !important;
}

/* Perfect Centered Overlay */
.ti-loading-overlay {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  width: 100% !important;
  height: 100% !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  background-color: var(--bg-result-color, #ffffff) !important;
  z-index: 30 !important;
  border-radius: 8px !important;
  direction: ltr !important; /* Prevent RTL shifting */
}

/* Mode-specific containers */
.ti-translation-display.popup-mode {
  height: 100%;
  width: auto; /* Allow parent margins to work correctly */
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.ti-translation-display.sidepanel-mode {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: visible;
}

.ti-translation-display.selection-mode {
  width: 100%;
  max-width: 400px;
  border-radius: 8px;
  background-color: var(--sw-bg-color, #f8f8f8);
  border: 1px solid var(--sw-border-color, #ddd);
  box-shadow: 0 4px 12px var(--sw-shadow-color, rgba(0, 0, 0, 0.1));
}

.ti-translation-display.compact-mode {
  padding: 8px;
}

/* Content container */
.ti-translation-content {
  width: 100%;
  padding: 32px 10px 10px 10px;
  border-radius: 8px;
  /* Use CSS variables for font settings with fallbacks */
  font-family: var(--translation-font-family, inherit);
  font-size: var(--translation-font-size, 14px);
  direction: var(--translation-direction, ltr);
  text-align: var(--translation-text-align, left);
  box-sizing: border-box;
  min-height: 50px;
  background-color: transparent;
  color: var(--text-color, #212529);
  border: none;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-y: auto;
  overflow-x: hidden;
}

.ti-translation-content.has-error {
  padding-top: 2px !important;
}

/*
  ROOT-CAUSE FIX: CSS Grid-based List Layout
  - Eliminates absolute positioning issues
  - Works identically for LTR and RTL
  - No cascade or specificity conflicts
*/
.ti-translation-content :deep(ul),
.ti-translation-content :deep(ol) {
  list-style: none !important;
  padding: 0 !important;
  margin: 6px 0 !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 4px !important; /* Consistent spacing between list items */
}

.ti-translation-content :deep(li) {
  display: grid !important;
  grid-template-columns: auto 1fr !important;
  align-items: start !important;
  gap: 0.5em !important; /* Consistent gap between bullet/number and text */
  line-height: 1.4 !important;
  margin: 0 !important;
  min-height: 1.2em !important; /* Ensure consistent height */
}

/* Bullet container for LTR */
.ti-translation-content :deep(ul > li)::before {
  content: "•" !important;
  font-weight: bold !important;
  color: inherit !important;
  grid-column: 1 !important;
  text-align: left !important;
}

/* Bullet container for RTL */
.ti-translation-content[dir="rtl"] :deep(ul > li)::before,
.ti-translation-content.rtl-content :deep(ul > li)::before {
  text-align: right !important;
}

/* Number container for ordered lists */
.ti-translation-content :deep(ol) {
  counter-reset: list-counter !important;
}
.ti-translation-content :deep(ol > li) {
  counter-increment: list-counter !important;
}
.ti-translation-content :deep(ol > li)::before {
  content: counter(list-counter) "." !important;
  font-weight: normal !important;
  color: inherit !important;
  grid-column: 1 !important;
  text-align: left !important;
  min-width: 1.5em !important;
}

/* Number container for RTL ordered lists */
.ti-translation-content[dir="rtl"] :deep(ol > li)::before,
.ti-translation-content.rtl-content :deep(ol > li)::before {
  text-align: right !important;
}

/* Text content container */
.ti-translation-content :deep(ul > li > span),
.ti-translation-content :deep(ol > li > span),
.ti-translation-content :deep(ul > li > *),
.ti-translation-content :deep(ol > li > *) {
  grid-column: 2 !important;
}

/* Sidepanel content adjustments */
.ti-sidepanel-mode .ti-translation-content {
  height: 100%;
  flex-grow: 1;
  border: none;
  border-radius: 8px;
  padding: 42px 5px 0px 5px;
}

.ti-sidepanel-mode .ti-translation-content.has-error {
  padding-top: 2px !important;
}

/* Selection window adjustments */
.ti-selection-mode .ti-translation-content {
  border: none;
  border-radius: 0 0 8px 8px;
  background-color: transparent;
  padding: 12px;
  min-height: auto;
  font-size: 14px;
}

/* Popup mode specific adjustments */
.ti-popup-mode .ti-translation-content {
  height: 100%;
  flex: 1;
  font-size: 13px;
  padding: 40px 12px 12px 12px;
}

.ti-popup-mode .ti-translation-content.has-error {
  padding-top: 2px !important;
}

/* Message styling */
.ti-translation-content .placeholder-message {
  color: #6c757d;
  font-style: italic;
  opacity: 0.7;
  text-align: center;
  padding: 16px;
}

.error-message {
  color: #dc3545 !important;
  font-style: normal !important;
  padding: 24px 16px !important;
  border-radius: 12px !important;
  line-height: 1.6 !important;
  background-color: rgba(220, 53, 69, 0.08) !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  text-align: center !important;
  min-height: 140px !important;
  gap: 20px !important;
  border: 1px solid rgba(220, 53, 69, 0.2) !important;
  margin: 12px 0 !important;
  width: 100% !important;
  box-sizing: border-box !important;
  position: relative !important;
}

.error-text {
  margin: 0 !important;
  width: 100% !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  text-align: center !important;
  font-weight: 500 !important;
  flex-grow: 1 !important;
  color: #b02a37 !important;
  font-size: 14px !important;
}

.error-actions {
  display: flex !important;
  gap: 12px !important;
  margin-top: auto !important;
  margin-bottom: 4px !important;
  flex-wrap: wrap !important;
  justify-content: center !important;
  align-items: center !important;
  width: 100% !important;
}

.error-action {
  background: #dc3545;
  color: white !important;
  border: none !important;
  padding: 8px 20px !important;
  border-radius: 8px !important;
  font-size: 13px !important;
  cursor: pointer !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 8px !important;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
  font-weight: 600 !important;
  box-shadow: 0 2px 6px rgba(220, 53, 69, 0.3) !important;
  text-decoration: none !important;
  min-width: 120px !important;
  white-space: nowrap !important;
}

.error-action:hover {
  background: #c82333 !important;
  transform: translateY(-2px) !important;
  box-shadow: 0 5px 12px rgba(220, 53, 69, 0.4) !important;
}

.error-action:active {
  transform: translateY(0) !important;
}

.error-action.retry-btn {
  background: #1967d2 !important;
  box-shadow: 0 2px 6px rgba(25, 103, 210, 0.3) !important;
}

.error-action.retry-btn:hover {
  background: #1557b0 !important;
  box-shadow: 0 5px 12px rgba(25, 103, 210, 0.4) !important;
}

.error-action.settings-btn {
  background: #5f6368 !important;
  box-shadow: 0 2px 6px rgba(95, 99, 104, 0.3) !important;
}

.error-action.settings-btn:hover {
  background: #4a4e52 !important;
  box-shadow: 0 5px 12px rgba(95, 99, 104, 0.4) !important;
}

.ti-translation-content .loading-message {
  color: var(--accent-color, #1967d2);
  text-align: center;
  padding: 16px;
  font-family: var(--translation-font-family, inherit);
  font-size: var(--translation-font-size, 14px);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.ti-translation-content :deep(.placeholder-message) {
  color: var(--text-secondary, #6c757d);
  font-style: italic;
  opacity: 0.7;
  text-align: center;
  padding: 16px;
  font-family: var(--translation-font-family, inherit);
  font-size: var(--translation-font-size, 14px);
}

/* General Markdown styling */
.ti-translation-content :deep(h1),
.ti-translation-content :deep(h2),
.ti-translation-content :deep(h3) {
  margin-top: 16px;
  margin-bottom: 8px;
  font-weight: 600;
}

.ti-translation-content :deep(h1) {
  font-size: 18px;
}
.ti-translation-content :deep(h2) {
  font-size: 16px;
}
.ti-translation-content :deep(h3) {
  font-size: 15px;
}

.ti-translation-content :deep(p) {
  margin-bottom: 8px;
}

.ti-translation-content :deep(code) {
  background: var(--bg-secondary, #f8f9fa);
  padding: 2px 4px;
  border-radius: 3px;
  font-family: "Courier New", monospace;
  font-size: 13px;
}

.ti-translation-content :deep(pre) {
  background: var(--bg-secondary, #f8f9fa);
  padding: 12px;
  border-radius: 4px;
  overflow-x: auto;
  font-family: "Courier New", monospace;
  font-size: 13px;
  margin: 8px 0;
}

.ti-translation-content :deep(blockquote) {
  border-inline-start: 3px solid var(--accent-color, #007bff);
  padding-inline-start: 12px;
  margin-inline-start: 0;
  color: var(--text-secondary, #6c757d);
  font-style: italic;
}

.ti-translation-content :deep(a) {
  color: var(--accent-color, #007bff);
  text-decoration: none;
}

.ti-translation-content :deep(a:hover) {
  text-decoration: underline;
}

/* Enhanced Display Toolbar */
.ti-display-toolbar {
  position: absolute;
  top: 6px;
  left: 12px;
  /* z-index: 10; */
  opacity: 1;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(4px);
  border-radius: 6px;
  padding: 2px;
}

/* Loading overlay */
.ti-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(var(--bg-result-color-rgb, 255, 255, 255), 0.8);
  border-radius: 4px;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Animations */
@keyframes pulse {
  0%,
  100% {
    opacity: 0.8;
  }
  50% {
    opacity: 0.4;
  }
}

/* Custom scrollbar */
.ti-translation-content::-webkit-scrollbar {
  width: 6px;
}

.ti-translation-content::-webkit-scrollbar-track {
  background: transparent;
}

.ti-translation-content::-webkit-scrollbar-thumb {
  background: var(--header-border-color);
  border-radius: 3px;
}

.ti-translation-content::-webkit-scrollbar-thumb:hover {
  background: var(--toolbar-link-color);
}

/* RTL-specific text alignment for bullets and numbers */
.ti-translation-content[dir="rtl"] :deep(ul > li)::before,
.ti-translation-content.rtl-content :deep(ul > li)::before {
  text-align: right !important;
}

.ti-translation-content[dir="rtl"] :deep(ol > li)::before,
.ti-translation-content.rtl-content :deep(ol > li)::before {
  text-align: right !important;
}

/* --- Mobile Mode Styles --- */
.ti-translation-display.mobile-mode {
  background: #e7f5ff;
  border: 1px solid #d0ebff;
  border-radius: 12px;
  padding: 15px !important;
  width: 100% !important;
  box-sizing: border-box !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 12px !important;
  min-height: auto !important;
  max-width: 100% !important;
  align-self: stretch !important;
}

.ti-translation-display.mobile-mode .ti-translation-content {
  padding: 0;
  font-size: 16px;
  color: #1c7ed6;
  max-height: 250px;
  line-height: 1.5;
  width: 100% !important;
}

.ti-mobile-actions {
  display: flex !important;
  flex-direction: row !important;
  justify-content: space-between !important;
  align-items: stretch !important;
  gap: 10px !important;
  margin-top: 15px !important;
  padding-top: 15px !important;
  border-top: 1px solid rgba(51, 154, 240, 0.15) !important;
  width: 100% !important;
  min-width: 100% !important;
  box-sizing: border-box !important;
}

.mobile-action-btn {
  height: 46px !important;
  border-radius: 12px !important;
  border: 1px solid #d0ebff !important;
  background: white !important;
  display: flex !important;
  flex: 1 1 0% !important;
  align-items: center !important;
  justify-content: center !important;
  cursor: pointer !important;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
  padding: 0 4px !important;
  gap: 6px !important;
  box-shadow: 0 2px 6px rgba(0,0,0,0.04) !important;
  color: #1c7ed6 !important;
  font-weight: 600 !important;
  font-size: 13px !important;
  -webkit-tap-highlight-color: rgba(0,0,0,0.1) !important;
  text-align: center !important;
  line-height: 1 !important; /* Ensure vertical centering for text */
}

.mobile-action-btn:active {
  transform: scale(0.95);
  background: #f1f3f5 !important;
  box-shadow: none;
}

/* Ensure icons in mobile buttons have proper sizing and alignment */
.mobile-action-btn img,
.mobile-action-btn svg {
  width: 16px !important;
  height: 16px !important;
  max-width: 16px !important;
  max-height: 16px !important;
  flex-shrink: 0 !important;
  object-fit: contain !important;
}

.mobile-action-btn img {
  display: block !important;
}

.mobile-action-btn.primary-action {
  background: #339af0 !important;
  color: white !important;
  border-color: #228be6 !important;
}

.mobile-action-btn.primary-action img {
  filter: brightness(0) invert(1);
}

/* Dark mode support using .is-dark class */
.ti-translation-display.is-dark.mobile-mode { 
  background: rgba(28, 126, 214, 0.15) !important; 
  border-color: rgba(28, 126, 214, 0.3) !important;
}

.ti-translation-display.is-dark.mobile-mode .ti-translation-content { 
  color: #74c0fc !important; 
}

.ti-translation-display.is-dark .mobile-action-btn { 
  background: #2d2d2d !important; 
  border-color: #444 !important; 
  color: #74c0fc !important;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
}

.ti-translation-display.is-dark .mobile-action-btn.primary-action {
  background: #1971c2 !important;
  color: white !important;
  border-color: #1864ab !important;
}

.ti-translation-display.is-dark .mobile-action-btn:not(.primary-action) img,
.ti-translation-display.is-dark .mobile-action-btn:not(.primary-action) svg { 
  filter: brightness(0) invert(1) !important;
  opacity: 0.8 !important;
}

/* Original media query as fallback */
@media (prefers-color-scheme: dark) {
  .ti-translation-display.mobile-mode:not(.is-dark) { 
    background: rgba(28, 126, 214, 0.1) !important; 
    border-color: rgba(28, 126, 214, 0.25) !important;
  }
  
  .ti-translation-display.mobile-mode:not(.is-dark) .ti-translation-content { 
    color: #74c0fc !important; 
  }
  
  .ti-translation-display:not(.is-dark) .mobile-action-btn { 
    background: #2d2d2d !important; 
    border-color: #444 !important; 
    color: #74c0fc !important;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
  }

  .ti-translation-display:not(.is-dark) .mobile-action-btn.primary-action {
    background: #1971c2 !important;
    color: white !important;
    border-color: #1864ab !important;
  }
  
  .ti-translation-display:not(.is-dark) .mobile-action-btn:not(.primary-action) img,
  .ti-translation-display:not(.is-dark) .mobile-action-btn:not(.primary-action) svg { 
    filter: invert(0.8) !important; 
  }
}
</style>