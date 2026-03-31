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
        'no-toolbar': !showToolbar,
        'theme-dark': settingsStore.isDarkTheme,
      },
      containerClass,
    ]"
    :style="cssVariables"
  >
    <!-- Simplified Loading State -->
    <div v-if="isLoading" class="ti-loading-overlay">
      <LoadingSpinner type="animated" size="lg" />
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
          { 'has-error': hasError, 'rtl-content': textDirection?.dir === 'rtl' },
          contentClass,
        ]"
        :dir="textDirection?.dir || 'ltr'"
        :style="mode === 'mobile' ? { ...fontStyles, ...cssVariables } : { ...(fontStyles || {}), ...(cssVariables || {}) }"
        @click="handleContentClick"
      >
        <div v-if="hasError" class="error-message">
          <div class="error-text">⚠️ {{ displayErrorMessage }}</div>
          <div v-if="canRetry || canOpenSettings" class="error-actions">
            <button v-if="canRetry" class="error-action retry-btn" @click="handleRetry">
              🔄 {{ t('action_retry') }}
            </button>
            <button v-if="canOpenSettings" class="error-action settings-btn" @click="handleSettings">
              ⚙️ {{ t('action_settings') }}
            </button>
          </div>
        </div>

        <!-- Placeholder State -->
        <div v-else-if="!content" class="placeholder-message">
          {{ placeholder }}
        </div>

        <!-- Normal Content with Markdown Support -->
        <div v-else v-html="sanitizedContent" />
      </div>

      <!-- Mobile Actions Row -->
      <div v-if="mode === 'mobile' && hasContent" class="ti-mobile-actions" @click.stop>
        <button 
          class="mobile-action-btn secondary-action" 
          :title="ttsStatus === 'playing' ? t('mobile_selection_stop_tooltip') : ttsTitle" 
          @click="handleMobileSpeak"
        >
          <svg v-if="ttsStatus === 'playing'" viewBox="0 0 24 24" class="mobile-action-icon">
            <rect x="6" y="6" width="12" height="12" rx="1.5" />
          </svg>
          <img v-else src="@/icons/ui/speaker.png" :alt="ttsAlt" class="mobile-action-icon">
          <span class="mobile-action-label">
            {{ ttsStatus === 'playing' ? t('mobile_selection_stop_label') : t('mobile_selection_speak_tooltip') }}
          </span>
        </button>
        
        <button class="mobile-action-btn secondary-action" :title="copyTitle" @click="handleMobileCopy">
          <img src="@/icons/ui/copy.png" :alt="copyAlt" class="mobile-action-icon">
          <span class="mobile-action-label">{{ t('mobile_selection_copy_tooltip') }}</span>
        </button>
        
        <button class="mobile-action-btn icon-only-action" :title="t('mobile_selection_history_tooltip')" @click="handleMobileHistory">
          <img src="@/icons/ui/history.svg" :alt="t('mobile_history_button_alt')" class="mobile-action-icon">
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
import './TranslationDisplay.scss';
import { ref, computed, watch, onMounted } from "vue";
import { useSettingsStore } from "@/features/settings/stores/settings.js";
import { isRTLLanguage, detectTextDirectionFromContent } from "@/features/element-selection/utils/textDirection.js";
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
