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
    @mousedown.stop
    @click.stop
  >
    <LoadingSpinner
      :type="'animated'"
      size="lg"
      style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);"
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
    <!-- Provider Selector positioned absolutely to avoid header overflow clipping -->
    <ProviderSelector
      v-if="props.provider"
      :model-value="props.provider"
      mode="icon-only"
      :is-global="false"
      class="ti-window-provider-selector"
      @update:model-value="handleProviderChange"
      @mousedown.stop
    />
    <div
      class="ti-window-header"
      @mousedown="handleStartDrag"
      @touchstart="handleStartDrag"
    >
      <div class="ti-header-actions">
        <div
          class="ti-provider-placeholder"
          style="width: 28px; height: 28px; flex: 0 0 28px;"
        />
        <button
          class="ti-action-btn"
          :title="t('window_copy_translation')"
          @click.stop="handleCopy"
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
        <button
          class="ti-action-btn ti-smart-tts-btn"
          :class="{ 'ti-original-mode': ttsMode === 'original' }"
          :disabled="!hasTTSContent"
          :title="getEnhancedTTSButtonTitle"
          @click.stop="handleSmartTTS"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            class="ti-smart-tts-icon"
            :class="{ 'ti-original-icon': ttsMode === 'original' }"
          >
            <path
              v-if="!isSpeaking"
              fill="currentColor"
              :d="ttsMode === 'original' ? originalTextTTSIcon : translatedTextTTSIcon"
            />
            <path
              v-else
              fill="currentColor"
              d="M6 6h12v12H6z"
            />
          </svg>
        </button>
        <button
          class="ti-action-btn"
          :class="{ 'ti-original-visible': showOriginal }"
          :title="getOriginalButtonTitle"
          @click.stop="toggleShowOriginal"
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
        <button
          class="ti-action-btn"
          :title="t('window_close')"
          @click.stop="handleClose"
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
      <Transition
        name="ti-original-text"
        appear
      >
        <div
          v-if="showOriginal && !isLoading"
          class="ti-original-text-section"
        >
          <div class="ti-original-text">
            {{ originalText }}
          </div>
        </div>
      </Transition>
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
import TranslationDisplay from '@/components/shared/TranslationDisplay.vue';
import ProviderSelector from '@/components/shared/ProviderSelector.vue';
import LoadingSpinner from '@/components/base/LoadingSpinner.vue';
import { useMessaging } from '@/shared/messaging/composables/useMessaging.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { useResourceTracker } from '@/composables/core/useResourceTracker.js';
import { useMobileStore } from '@/store/modules/mobile.js';

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
const isSpeaking = computed(() => tts.ttsState.value === 'playing');

const ttsMode = computed(() => showOriginal.value ? 'original' : 'translated');
const hasTTSContent = computed(() => {
  const hasOriginal = showOriginal.value && originalText.value && originalText.value.trim().length > 0;
  const hasTranslated = !showOriginal.value && translatedText.value && translatedText.value.trim().length > 0;
  return hasOriginal || hasTranslated;
});

const currentTTSText = computed(() => ttsMode.value === 'original' ? originalText.value || '' : translatedText.value || '');

const getEnhancedTTSButtonTitle = computed(() => {
  if (!hasTTSContent.value) return t('window_tts_no_text');
  if (tts.ttsState.value === 'playing') return t('window_tts_stop');
  return ttsMode.value === 'original' ? t('window_tts_speak_original') : t('window_tts_speak_translation');
});

const getOriginalButtonTitle = computed(() => showOriginal.value ? t('window_hide_original') : t('window_show_original'));

const originalTextTTSIcon = "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z";
const translatedTextTTSIcon = "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z";

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
const currentWidth = computed(() => currentSize.value === 'small' ? 60 : null);
const currentHeight = computed(() => currentSize.value === 'small' ? 40 : null);

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

onMounted(() => {
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
    await navigator.clipboard.writeText(translatedText.value);
  } catch (error) {
    logger.error(`Failed to copy:`, error);
  }
};

const handleSmartTTS = async () => {
  if (!hasTTSContent.value) return;
  try {
    if (tts.ttsState.value === 'playing') {
      await tts.stop();
    } else {
      await tts.speak(currentTTSText.value, 'auto');
    }
  } catch (error) {
    logger.error(`Smart TTS failed:`, error);
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

<style scoped>
.ti-window { box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2) !important; overflow: hidden !important; display: flex !important; flex-direction: column !important; }
.ti-window.light { background-color: #ffffff !important; color: #2c3e50 !important; border: 1px solid #e8e8e8 !important; }
.ti-window.dark { background-color: #2d2d2d !important; color: #e0e0e0 !important; border: 1px solid #424242 !important; }
.ti-window-header { display: flex !important; align-items: center !important; justify-content: space-between !important; padding: 8px 12px !important; cursor: move !important; user-select: none !important; }
.ti-window.light .ti-window-header { background-color: #f7f7f7 !important; border-bottom: 1px solid #e8e8e8 !important; }
.ti-window.light .ti-action-btn { background-color: #f0f0f0 !important; color: #555 !important; }
.ti-window.dark .ti-window-header { background-color: #333333 !important; border-bottom: 1px solid #424242 !important; }
.ti-window.dark .ti-action-btn { background-color: #424242 !important; color: #e0e0e0 !important; }
.ti-header-actions { display: flex; align-items: center; gap: 8px; }
.ti-header-close { display: flex; align-items: center; }
.ti-action-btn { display: flex !important; align-items: center !important; justify-content: center !important; width: 28px !important; height: 28px !important; border: none !important; border-radius: 6px !important; cursor: pointer !important; transition: background-color 0.2s ease !important; }
.ti-action-btn:hover { background: rgba(255, 255, 255, 0.1); }
.ti-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ti-action-btn.ti-original-visible { background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%) !important; border: 1px solid rgba(59, 130, 246, 0.3) !important; color: #1e40af !important; }
.ti-smart-tts-btn { transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1) !important; position: relative; }
.ti-smart-tts-btn.ti-original-mode { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important; }
.ti-smart-tts-btn:not(.ti-original-mode) { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%) !important; }
.ti-window-body { padding: 16px !important; min-height: 100px !important; display: flex !important; flex-direction: column !important; }
.ti-window-translation-display { flex: 1; min-height: 80px; position: relative; contain: layout style; overflow: clip; min-width: 0; width: 100%; }
.ti-window.loading-window { width: 60px !important; height: 40px !important; border-radius: 20px !important; display: flex !important; align-items: center !important; justify-content: center !important; background: #fff !important; border: 1px solid rgba(0, 0, 0, 0.1) !important; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15) !important; }
.ti-window.dark.loading-window { background: #333 !important; border-color: #444 !important; }
</style>