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
      },
      containerClass,
    ]"
    :style="cssVariables || {}"
  >
    <!-- Enhanced Actions Toolbar -->
    <ActionToolbar
      v-show="showToolbar && hasContent"
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

    <!-- Loading Spinner -->
    <div
      v-if="isLoading"
      class="ti-loading-overlay"
    >
      <div class="ti-loading-spinner">
        <div class="ti-spinner" />
      </div>
    </div>

    <!-- Content Display -->
    <div
      ref="contentRef"
      class="ti-translation-content"
      :class="[
        {
          'fade-in': false /* Animation disabled */,
          /* 'loading-dim': isLoading */
        },
        contentClass,
        { 'rtl-content': textDirection?.dir === 'rtl' },
      ]"
      :dir="textDirection?.dir || 'ltr'"
      :style="{
        ...(fontStyles || {}),
        ...(cssVariables || {}),
        direction: textDirection?.dir || 'ltr',
        textAlign: textDirection?.textAlign || 'left',
      }"
    >
      <!-- Safe: Content is sanitized with DOMPurify -->
      <div v-html="sanitizedContent" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from "vue";
import { shouldApplyRtl } from "@/shared/utils/text/textAnalysis.js";
import { isRTLText } from "@/features/element-selection/utils/textDirection.js";
import { SimpleMarkdown } from "@/shared/utils/text/markdown.js";
import DOMPurify from "dompurify";
import ActionToolbar from "@/features/text-actions/components/ActionToolbar.vue";
import { useFont } from "@/composables/shared/useFont.js";
import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";

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
    default: "standard", // standard, compact, popup, sidepanel, selection
    validator: (value) =>
      ["standard", "compact", "popup", "sidepanel", "selection"].includes(
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
]);

// Refs
const contentRef = ref(null);
const containerRef = ref(null);
// const showFadeIn = ref(false) // Disabled

// Scoped logger
const logger = getScopedLogger(LOG_COMPONENTS.UI, "TranslationDisplay");

// Font management with safe error handling and RTL-aware CSS variables
let fontStyles = ref({});
let cssVariables = ref({});

try {
  // Initialize useFont with target language
  const { fontStyles: computedFontStyles, cssVariables: computedCssVariables } =
    useFont(
      computed(() => props.targetLanguage),
      {
        enableSmartDetection: true,
        fallbackFont: "system",
        enableCSSVariables: true,
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

// Computed
const hasContent = computed(
  () => props.content.trim().length > 0 && !props.isLoading,
);
const hasError = computed(() => !!props.error && !props.isLoading);

// Enhanced text direction computation with target language awareness
const textDirection = computed(() => {
  const textToCheck = props.content || props.error || "";

  // Use advanced RTL detection with target language awareness
  const isRtl = isRTLText(textToCheck, {
    comprehensive: true,
    threshold: 0.1, // Lower threshold for more sensitive detection
    targetLanguage: props.targetLanguage || 'fa',
    simpleDetection: false // Use threshold-based detection for better accuracy
  });

  // Fallback to basic detection if advanced detection fails
  const finalDirection = isRtl || shouldApplyRtl(textToCheck);

  return {
    dir: finalDirection ? "rtl" : "ltr",
    textAlign: finalDirection ? "right" : "left",
  };
});

// Sanitized content computed property
const sanitizedContent = computed(() => {
  return DOMPurify.sanitize(renderedContent.value);
});

const renderedContent = computed(() => {
  if (props.error) {
    const errorActions = [];

    // Add retry action if available
    if (props.canRetry && props.onRetry) {
      errorActions.push(
        `<button class="error-action retry-btn" onclick="handleRetry()">🔄 Try Again</button>`,
      );
    }

    // Add settings action if available
    if (props.canOpenSettings && props.onOpenSettings) {
      errorActions.push(
        `<button class="error-action settings-btn" onclick="handleSettings()">⚙️ Settings</button>`,
      );
    }

    const actionsHtml =
      errorActions.length > 0
        ? `<div class="error-actions">${errorActions.join("")}</div>`
        : "";

    return `<div class="error-message">
      <div class="error-text">⚠️ ${props.error}</div>
      ${actionsHtml}
    </div>`;
  }

  if (props.isLoading) {
    return `<div class="loading-message">در حال ترجمه...</div>`;
  }

  if (!props.content) {
    return `<div class="placeholder-message">${props.placeholder}</div>`;
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
    // if (newContent && newContent !== oldContent) {
    //   showFadeIn.value = true
    //   setTimeout(() => {
    //     showFadeIn.value = false
    //   }, 400)
    // }
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

const handleActionFailed = (error) => {
  emit("action-failed", error);
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

// Make handlers globally accessible for onclick handlers
if (typeof window !== "undefined") {
  window.handleRetry = handleRetry;
  window.handleSettings = handleSettings;
}

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
}

/* Mode-specific containers */
.ti-translation-display.popup-mode {
  margin: 8px 12px;
  height: 100%;
  max-width: calc(100vw - 24px);
  width: 100%;
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
  padding: 40px 8px 8px 8px;
}

/* Message styling */
.ti-translation-content :deep(.placeholder-message) {
  color: #6c757d;
  font-style: italic;
  opacity: 0.7;
  text-align: center;
  padding: 16px;
}

.ti-translation-content :deep(.error-message) {
  color: #dc3545;
  font-style: italic;
  padding: 12px;
  border-left: 3px solid #dc3545;
  background-color: rgba(220, 53, 69, 0.1);
  border-radius: 6px;
  line-height: 1.4;
  font-family: var(--translation-font-family, inherit);
  font-size: var(--translation-font-size, 14px);
}

.ti-translation-content :deep(.error-text) {
  margin-bottom: 8px;
}

.ti-translation-content :deep(.error-actions) {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.ti-translation-content :deep(.error-action) {
  background: #dc3545;
  color: white;
  border: none;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: background-color 0.2s ease;
  font-weight: 500;
}

.ti-translation-content :deep(.error-action:hover) {
  background: #c82333;
}

.ti-translation-content :deep(.error-action.retry-btn) {
  background: #007bff;
}

.ti-translation-content :deep(.error-action.retry-btn:hover) {
  background: #0056b3;
}

.ti-translation-content :deep(.error-action.settings-btn) {
  background: #6c757d;
}

.ti-translation-content :deep(.error-action.settings-btn:hover) {
  background: #5a6268;
}

.ti-translation-content :deep(.loading-message) {
  color: var(--accent-color, #1967d2);
  font-style: italic;
  opacity: 0.8;
  text-align: center;
  padding: 16px;
  font-family: var(--translation-font-family, inherit);
  font-size: var(--translation-font-size, 14px);
  animation: pulse 1.5s ease-in-out infinite;
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

.ti-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--header-border-color, #dee2e6);
  border-top: 3px solid var(--accent-color, #1967d2);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

/* Animations */
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

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

/* --- REMOVED: Old RTL overrides - now using CSS Grid approach --- */

/* --- CLEAN RTL STYLES (using CSS Grid approach) --- */

/* RTL-specific text alignment for bullets and numbers */
.ti-translation-content[dir="rtl"] :deep(ul > li)::before,
.ti-translation-content.rtl-content :deep(ul > li)::before {
  text-align: right !important;
}

.ti-translation-content[dir="rtl"] :deep(ol > li)::before,
.ti-translation-content.rtl-content :deep(ol > li)::before {
  text-align: right !important;
}
</style>
