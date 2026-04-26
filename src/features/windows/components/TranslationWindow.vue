<template>
  <!-- Small loading window -->
  <div
    v-if="currentSize === 'small'"
    v-show="!isFullscreen"
    ref="windowElement"
    class="ti-window translation-window aiwc-selection-popup-host ti-loading-window"
    :class="[theme, { 'visible': isVisible, 'is-dragging': isPositionDragging }]"
    :style="windowStyle"
    data-translate-ui="true"
    @mousedown="handleStartDrag"
    @touchstart="handleStartDrag"
    @click.stop
  >
    <LoadingSpinner
      size="sm"
      class="ti-loading-spinner-wrapper"
    />
  </div>

  <!-- Normal translation window -->
  <div
    v-else
    v-show="!isFullscreen"
    ref="windowElement"
    class="ti-window translation-window aiwc-selection-popup-host normal-window"
    :class="[theme, { 'visible': isVisible, 'is-dragging': isPositionDragging }]"
    :style="windowStyle"
    data-translate-ui="true"
    @mousedown.stop
    @click.stop
  >
    <div
      class="ti-window-header"
      @mousedown="handleStartDrag"
      @touchstart="handleStartDrag"
    >
      <div class="ti-header-actions">
        <ProviderSelector
          v-if="props.provider"
          :model-value="props.provider"
          mode="icon-only"
          :is-global="false"
          class="ti-window-provider-selector"
          @update:model-value="handleProviderChange"
          @mousedown.stop
          @touchstart.stop
        />
        <button
          class="ti-action-btn"
          :title="t('window_copy_translation')"
          @click.stop="handleCopy"
          @mousedown.stop
          @touchstart.stop
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
          >
            <path
              fill="currentColor"
              d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
            />
          </svg>
        </button>
        <TTSButton
          :text="currentTTSText"
          :language="currentTTSLang"
          size="sm"
          variant="secondary"
          class="ti-smart-tts-btn"
          @mousedown.stop
          @touchstart.stop
        />
        <button
          class="ti-action-btn"
          :class="{ 'ti-original-visible': showOriginal }"
          :title="getOriginalButtonTitle"
          @click.stop="toggleShowOriginal"
          @mousedown.stop
          @touchstart.stop
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
          >
            <path
              fill="currentColor"
              d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8s8 3.58 8 8s-3.58 8-8 8zm-2-9.41V12h2.59L15 14.41V16h-4v-1.59L8.59 12H7v-2h3.59L13 7.59V6h4v1.59L14.41 10H12v.59z"
            />
          </svg>
        </button>
      </div>
      <div class="ti-header-close">
        <span
          v-if="detectedLanguageName"
          class="ti-detected-language-label"
        >
          {{ detectedLanguageName }}
        </span>
        <button
          class="ti-action-btn"
          :title="t('window_close')"
          @click.stop="handleClose"
          @mousedown.stop
          @touchstart.stop
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
          >
            <path
              fill="currentColor"
              d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
            />
          </svg>
        </button>
      </div>
    </div>

    <div class="ti-window-body">
      <div
        class="ti-original-text-wrapper"
        :class="{ 'is-expanded': showOriginal && !isLoading }"
      >
        <div class="ti-original-text-section">
          <div class="ti-original-text">
            {{ originalText }}
          </div>
        </div>
      </div>
      <TranslationDisplay
        :content="translatedText"
        :is-loading="isLoading"
        :error="errorMessage"
        :error-type="props.errorType"
        :mode="'compact'"
        :placeholder="t('window_translation_placeholder')"
        :target-language="props.targetLanguage"
        :show-fade-in-animation="true"
        :enable-markdown="true"
        :show-toolbar="false"
        :show-copy-button="false"
        :show-tts-button="false"
        :can-retry="props.canRetry"
        :can-open-settings="props.needsSettings"
        :on-retry="handleRetry"
        :on-open-settings="handleOpenSettings"
        class="ti-window-translation-display"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { pageEventBus, WINDOWS_MANAGER_EVENTS } from '@/core/PageEventBus.js';
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js';
import { usePositioning } from '@/composables/ui/usePositioning.js';
import { WindowsConfig } from '@/features/windows/managers/core/WindowsConfig.js';
import { useTTSSmart } from '@/features/tts/composables/useTTSSmart.js';
import TTSButton from '@/components/shared/TTSButton.vue';
import TranslationDisplay from '@/components/shared/TranslationDisplay.vue';
import ProviderSelector from '@/components/shared/ProviderSelector.vue';
import LoadingSpinner from '@/components/base/LoadingSpinner.vue';
import { useMessaging } from '@/shared/messaging/composables/useMessaging.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { useResourceTracker } from '@/composables/core/useResourceTracker.js';
import { useMobileStore } from '@/store/modules/mobile.js';
import { SimpleMarkdown } from '@/shared/utils/text/markdown.js';
import { getLanguageNameFromCode } from '@/shared/config/languageConstants.js';

// Import adjacent SCSS
import './TranslationWindow.scss';

// i18n
const { t } = useUnifiedI18n();

const props = defineProps({
  id: { type: String, required: true },
  position: { type: Object, default: () => ({ x: 0, y: 0 }) },
  selectedText: { type: String, default: '' },
  initialTranslatedText: { type: String, default: '' },
  theme: { type: String, default: 'light' },
  isLoading: { type: Boolean, default: false },
  isError: { type: Boolean, default: false },
  errorType: { type: String, default: null },
  canRetry: { type: Boolean, default: false },
  needsSettings: { type: Boolean, default: false },
  initialSize: { type: String, default: 'normal' }, 
  targetLanguage: { type: String, default: 'auto' }, 
  sourceLanguage: { type: String, default: 'auto' },
  detectedSourceLanguage: { type: String, default: undefined },
  provider: { type: String, default: '' } 
});

const emit = defineEmits(['close', 'speak']);
useMessaging('content');

const tts = useTTSSmart();
const mobileStore = useMobileStore();
const logger = getScopedLogger(LOG_COMPONENTS.WINDOWS, `TranslationWindow:${props.id}`);
const tracker = useResourceTracker(`translation-window-${props.id}`);

// Fullscreen state from store
const isFullscreen = computed(() => mobileStore.isFullscreen);

// State
const isLoading = computed(() => {
  return props.isLoading || (!props.initialTranslatedText && !props.isError);
});

const isVisible = ref(false); 
const currentSize = ref(props.initialSize); 
const translatedText = computed(() => props.isError ? '' : props.initialTranslatedText);
const originalText = ref(props.selectedText);
const errorMessage = computed(() => props.isError ? props.initialTranslatedText : '');

const detectedLanguageName = computed(() => {
  const code = props.detectedSourceLanguage;
  if (!code || code === 'auto') return '';
  const name = getLanguageNameFromCode(code);
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : '';
});

// Watch for prop changes to sync internal state
watch(() => props.selectedText, (newText) => {
  if (newText) {
    logger.debug('selectedText updated:', newText);
    originalText.value = newText;
  }
});

watch(() => props.sourceLanguage, (newLang) => {
  logger.debug('sourceLanguage prop updated:', newLang);
});

watch(() => props.targetLanguage, (newLang) => {
  logger.debug('targetLanguage prop updated:', newLang);
});

const ttsMode = computed(() => showOriginal.value ? 'original' : 'translated');

const currentTTSText = computed(() => ttsMode.value === 'original' ? originalText.value || '' : translatedText.value || '');
const currentTTSLang = computed(() => ttsMode.value === 'original' ? props.sourceLanguage : props.targetLanguage);

const getOriginalButtonTitle = computed(() => showOriginal.value ? t('window_hide_original') : t('window_show_original'));

const handleRetry = () => {
  pageEventBus.emit('translation-window-retry', { id: props.id });
};

const handleOpenSettings = () => {
  pageEventBus.emit(WINDOWS_MANAGER_EVENTS.OPEN_SETTINGS, { section: 'languages' });
};

const handleProviderChange = (newProvider) => {
  pageEventBus.emit('translation-window-change-provider', { id: props.id, provider: newProvider });
};

const showOriginal = ref(false);
const currentWidth = computed(() => currentSize.value === 'small' ? 28 : null);
const currentHeight = computed(() => currentSize.value === 'small' ? 28 : null);

const {
  currentPosition,
  isDragging: isPositionDragging,
  positionStyle,
  startDrag,
  updatePosition,
  cleanup: cleanupPositioning
} = usePositioning(props.position, {
  defaultWidth: currentWidth.value || WindowsConfig.POSITIONING.POPUP_WIDTH,
  defaultHeight: currentHeight.value || WindowsConfig.POSITIONING.POPUP_HEIGHT,
  enableDragging: true
});

watch(() => props.position, (newPos) => {
  updatePosition(newPos, {
    width: currentWidth.value || WindowsConfig.POSITIONING.POPUP_WIDTH,
    height: currentHeight.value || WindowsConfig.POSITIONING.POPUP_HEIGHT
  });
});

watch(() => props.initialSize, (newSize) => {
  currentSize.value = newSize;
  if (newSize === 'normal') {
    nextTick(() => {
      if (windowElement.value) {
        const { offsetWidth, offsetHeight } = windowElement.value;
        updatePosition(currentPosition.value, { width: offsetWidth, height: offsetHeight });
      }
    });
  } else {
    updatePosition(currentPosition.value, { width: currentWidth.value, height: currentHeight.value });
  }
});

const windowStyle = computed(() => ({ ...positionStyle.value }));

onMounted(async () => {
  // Inject Windows-specific styles lazily
  try {
    const { windowsUiStyles } = await import('@/core/content-scripts/chunks/lazy-styles.js');
    const { injectStylesToShadowRoot } = await import('@/utils/ui/styleInjector.js');
    
    if (windowsUiStyles && injectStylesToShadowRoot) {
      injectStylesToShadowRoot(windowsUiStyles, 'vue-windows-specific-styles');
    }
  } catch (error) {
    console.warn('[TranslationWindow] Failed to load lazy styles:', error);
  }

  requestAnimationFrame(() => {
    isVisible.value = true;
  });

  // Track all resources for automatic cleanup
  tracker.trackResource('positioning', () => cleanupPositioning());
  tracker.trackResource('tts-stop', () => {
    tts.stopAll().catch(() => {});
  });
});

const handleClose = () => emit('close', props.id);
const toggleShowOriginal = () => { showOriginal.value = !showOriginal.value; };

const handleCopy = async () => {
  if (!translatedText.value) return;
  try {
    const textToCopy = SimpleMarkdown.getCleanTranslation(translatedText.value);
    await navigator.clipboard.writeText(textToCopy);
    logger.debug(`Text copied successfully (cleaned)`);
  } catch (error) {
    logger.error(`Failed to copy:`, error);
  }
};

const windowElement = ref(null);
const handleStartDrag = (event) => {
  window.__TRANSLATION_WINDOW_IS_DRAGGING = true;
  startDrag(event);
  
  const customStopDrag = () => {
    window.__TRANSLATION_WINDOW_IS_DRAGGING = false;
    window.__TRANSLATION_WINDOW_JUST_DRAGGED = true;
    tracker.trackTimeout(() => {
      window.__TRANSLATION_WINDOW_JUST_DRAGGED = false;
    }, 300);
  };
  
  tracker.addEventListener(document, 'mouseup', customStopDrag, { once: true });
  tracker.addEventListener(document, 'touchend', customStopDrag, { once: true });
};
</script>
