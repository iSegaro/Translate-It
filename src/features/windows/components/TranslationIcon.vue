<template>
  <div
    v-if="isVisible && !isFullscreen"
    ref="iconElement"
    class="ti-translation-icon"
    :class="{ 'dark': isDarkTheme }"
    :style="dynamicStyle"
    data-translate-ui="true"
    role="toolbar"
    aria-label="Text selection tools"
  >
    <!-- Translate Action Button -->
    <button
      v-if="showTranslate"
      class="ti-icon-btn ti-icon-btn--translate"
      :title="t('translateSelectedText')"
      :aria-label="t('translateSelectedText')"
      role="button"
      tabindex="0"
      @click="handleTranslateClick"
      @mouseup.left.prevent.stop
      @contextmenu.stop
      @keydown="onKeydownTranslate"
    >
      <svg
        class="ti-icon-btn__svg"
        viewBox="0 0 64 64"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <g><path
          fill="#0fa438"
          d="M 1.5,-0.5 C 10.5,-0.5 19.5,-0.5 28.5,-0.5C 30.4285,3.28543 31.7618,7.28543 32.5,11.5C 33.5946,16.7841 35.2613,21.7841 37.5,26.5C 37.8333,27.8333 38.1667,29.1667 38.5,30.5C 39.6047,34.3517 40.938,38.0184 42.5,41.5C 43.1098,42.391 43.4431,43.391 43.5,44.5C 43.4326,45.9587 43.7659,47.2921 44.5,48.5C 39.5,49.1667 34.5,49.8333 29.5,50.5C 19.4176,50.8074 9.41756,50.4741 -0.5,49.5C -0.5,33.5 -0.5,17.5 -0.5,1.5C 0.5,1.16667 1.16667,0.5 1.5,-0.5 Z"
        /></g>
        <g><path
          fill="#e1eae1"
          d="M 16.5,10.5 C 17.8221,10.33 18.9887,10.6634 20,11.5C 23.3371,19.3461 26.1705,27.3461 28.5,35.5C 27.1779,35.67 26.0113,35.3366 25,34.5C 24.6954,29.6915 22.1954,27.6915 17.5,28.5C 15.8333,28.8333 14.1667,29.1667 12.5,29.5C 11.8333,31.1667 11.1667,32.8333 10.5,34.5C 9.27704,35.6139 7.94371,35.7805 6.5,35C 9.70148,26.7659 13.0348,18.5992 16.5,10.5 Z"
        /></g>
        <g><path
          fill="#25a640"
          d="M 20.5,23.5 C 18.7354,24.4614 16.7354,24.7947 14.5,24.5C 15.562,21.4844 16.7286,18.4844 18,15.5C 19.1356,18.0964 19.969,20.763 20.5,23.5 Z"
        /></g>
        <g><path
          fill="#6a8491"
          d="M 43.5,44.5 C 43.4431,43.391 43.1098,42.391 42.5,41.5C 46.3171,39.3756 46.3171,37.0423 42.5,34.5C 43.2421,33.7132 44.0754,33.0465 45,32.5C 47.8245,36.6749 49.9912,36.3416 51.5,31.5C 47.2172,30.5078 42.8839,30.1744 38.5,30.5C 38.1667,29.1667 37.8333,27.8333 37.5,26.5C 40.5,26.5 43.5,26.5 46.5,26.5C 46.5,25.5 46.5,24.5 46.5,23.5C 47.8333,23.5 49.1667,23.5 50.5,23.5C 50.5,24.5 50.5,25.5 50.5,26.5C 53.5,26.5 56.5,26.5 59.5,26.5C 59.5,27.8333 59.5,29.1667 59.5,30.5C 58.1667,30.5 56.8333,30.5 55.5,30.5C 54.7263,33.3809 53.3929,36.0476 51.5,38.5C 52.5794,40.543 54.246,41.8763 56.5,42.5C 57.7445,43.9554 57.5778,45.2887 56,46.5C 53.5426,45.0222 51.0426,43.6888 48.5,42.5C 46.8228,43.1869 45.1561,43.8535 43.5,44.5 Z"
        /></g>
        <g><path
          fill="#93c298"
          d="M 20.5,23.5 C 21.0431,23.56 21.3764,23.8933 21.5,24.5C 19.0268,25.7969 16.6934,25.7969 14.5,24.5C 16.7354,24.7947 18.7354,24.4614 20.5,23.5 Z"
        /></g>
        <g><path
          fill="#e5eae8"
          d="M 38.5,30.5 C 42.8839,30.1744 47.2172,30.5078 51.5,31.5C 49.9912,36.3416 47.8245,36.6749 45,32.5C 44.0754,33.0465 43.2421,33.7132 42.5,34.5C 46.3171,37.0423 46.3171,39.3756 42.5,41.5C 40.938,38.0184 39.6047,34.3517 38.5,30.5 Z"
        /></g>
        <g><path
          fill="#f0f1f1"
          d="M 32.5,11.5 C 42.9154,11.1917 53.2487,11.525 63.5,12.5C 63.5,28.8333 63.5,45.1667 63.5,61.5C 62.5,61.8333 61.8333,62.5 61.5,63.5C 52.5,63.5 43.5,63.5 34.5,63.5C 34.5,63.1667 34.5,62.8333 34.5,62.5C 38.1803,58.817 41.5136,54.817 44.5,50.5C 45.8333,49.8333 45.8333,49.1667 44.5,48.5C 43.7659,47.2921 43.4326,45.9587 43.5,44.5C 45.1561,43.8535 46.8228,43.1869 48.5,42.5C 51.0426,43.6888 53.5426,45.0222 56,46.5C 57.5778,45.2887 57.7445,43.9554 56.5,42.5C 54.246,41.8763 52.5794,40.543 51.5,38.5C 53.3929,36.0476 54.7263,33.3809 55.5,30.5C 56.8333,30.5 58.1667,30.5 59.5,30.5C 59.5,29.1667 59.5,27.8333 59.5,26.5C 56.5,26.5 53.5,26.5 50.5,26.5C 50.5,25.5 50.5,24.5 50.5,23.5C 49.1667,23.5 47.8333,23.5 46.5,23.5C 46.5,24.5 46.5,25.5 46.5,26.5C 43.5,26.5 40.5,26.5 37.5,26.5C 35.2613,21.7841 33.5946,16.7841 32.5,11.5 Z"
        /></g>
        <g><path
          fill="#2d9397"
          d="M 44.5,48.5 C 45.8333,49.1667 45.8333,49.8333 44.5,50.5C 39.5,50.5 34.5,50.5 29.5,50.5C 34.5,49.8333 39.5,49.1667 44.5,48.5 Z"
        /></g>
        <g><path
          fill="#1c66c0"
          d="M 29.5,50.5 C 34.5,50.5 39.5,50.5 44.5,50.5C 41.5136,54.817 38.1803,58.817 34.5,62.5C 32.8346,58.505 31.1679,54.505 29.5,50.5 Z"
        /></g>
      </svg>
    </button>

    <!-- Stateful TTS / Volume Action Button -->
    <button
      v-if="showTTS"
      class="ti-icon-btn"
      :class="ttsClasses"
      :title="ttsTitle"
      :aria-label="ttsTitle"
      role="button"
      tabindex="0"
      @click.stop.prevent="handleTTSClick"
      @mouseup.left.prevent.stop
      @contextmenu.stop
      @keydown="onKeydownTTS"
    >
      <!-- Idle State Icon -->
      <svg
        v-if="effectiveTTSState === 'idle'"
        class="ti-icon-btn__svg"
        viewBox="0 0 24 24"
      >
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
      </svg>

      <!-- Loading State Icon -->
      <svg
        v-else-if="effectiveTTSState === 'loading'"
        class="ti-icon-btn__svg"
        viewBox="0 0 24 24"
      >
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
        <path
          opacity="0.5"
          d="M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"
        />
      </svg>

      <!-- Playing State Icon (Stop) -->
      <svg
        v-else-if="effectiveTTSState === 'playing'"
        class="ti-icon-btn__svg"
        viewBox="0 0 24 24"
      >
        <path d="M6 6h12v12H6z" />
      </svg>

      <!-- Error State Icon -->
      <svg
        v-else-if="effectiveTTSState === 'error'"
        class="ti-icon-btn__svg"
        viewBox="0 0 24 24"
      >
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
      </svg>
    </button>
  </div>
</template>

<script setup>
import './TranslationIcon.scss';
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { usePositioning } from '@/composables/ui/usePositioning.js';
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js';
import { useMobileStore } from '@/store/modules/mobile.js';
import { useSettingsStore } from '@/features/settings/stores/settings.js';
import { useTTSSmart } from '@/features/tts/composables/useTTSSmart.js';
import { useResourceTracker } from '@/composables/core/useResourceTracker.js';

// Event bus and coordination
const pageEventBus = window.pageEventBus;
const mobileStore = useMobileStore();
const settingsStore = useSettingsStore();
const tracker = useResourceTracker('translation-icon');

// Props
const props = defineProps({
  id: { type: String, required: true },
  position: { type: Object, required: true, default: () => ({ top: 0, left: 0 }) },
  text: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
});

// Emits
const emit = defineEmits(['click', 'hover', 'focus', 'close']);

// Unified i18n helper
const { t } = useUnifiedI18n();

// TTS Composable instance
const tts = useTTSSmart();

// Visibility Configurations from Settings Store
const showTTS = computed(() => settingsStore.settings.SHOW_TTS_ICON_IN_TOOLBAR !== false);
const showTranslate = computed(() => settingsStore.settings.SHOW_TRANSLATE_ICON_IN_TOOLBAR !== false);
const isDarkTheme = computed(() => settingsStore.isDarkTheme);

// Static initial width calculation for non-reactive usePositioning init
const initialWidth = (() => {
  let count = 0;
  if (settingsStore.settings.SHOW_TRANSLATE_ICON_IN_TOOLBAR !== false) count++;
  if (settingsStore.settings.SHOW_TTS_ICON_IN_TOOLBAR !== false) count++;
  if (count === 0) return 0;
  
  const buttonSize = 28;
  const padding = 4;
  const gap = 2;
  return (count * buttonSize) + ((count - 1) * gap) + padding;
})();

// Reactive state
const isVisible = ref(false);
const isActive = ref(false);
const isFullscreen = computed(() => mobileStore.isFullscreen);

// Local state for the TTS play action
const localTTSId = ref(null);

// DOM reference
const iconElement = ref(null);

// Calculate exact dynamic width based on active buttons
const calculatedWidth = computed(() => {
  let count = 0;
  if (showTranslate.value) count++;
  if (showTTS.value) count++;
  
  if (count === 0) return 0;
  
  const buttonSize = 28;
  const padding = 4; // 2px left + 2px right
  const gap = 2;     // flex gap
  
  return (count * buttonSize) + ((count - 1) * gap) + padding;
});

// Initialize position using calculated initial width
const { positionStyle, cleanup: cleanupPositioning } = usePositioning(props.position, {
  defaultWidth: initialWidth,
  defaultHeight: 32,
  enableDragging: false
});

// Styles for the flex toolbar container
const dynamicStyle = computed(() => {
  return {
    ...positionStyle.value,
    width: `${calculatedWidth.value}px`,
    height: '32px',
  };
});

// Check if this specific toolbar is responsible for active TTS
const isThisTTSActive = computed(() => {
  if (tts.ttsState.value === 'error' && tts.lastText.value === props.text) {
    return true;
  }
  return !!(localTTSId.value && tts.currentTTSId.value === localTTSId.value);
});

// Current active TTS state for this toolbar
const effectiveTTSState = computed(() => {
  if (tts.ttsState.value === 'loading' && localTTSId.value?.startsWith('pending_')) {
    return 'loading';
  }
  if (isThisTTSActive.value) {
    return tts.ttsState.value;
  }
  return 'idle';
});

// Dynamic classes for TTS button visual cues
const ttsClasses = computed(() => [
  {
    'ti-icon-btn--playing': effectiveTTSState.value === 'playing',
    'ti-icon-btn--loading': effectiveTTSState.value === 'loading',
    'ti-icon-btn--error': effectiveTTSState.value === 'error',
  }
]);

// Localized tooltip title for TTS button
const ttsTitle = computed(() => {
  switch (effectiveTTSState.value) {
    case 'idle':
      return t('action_speak_text') || 'Speak text';
    case 'loading':
      return t('window_loading_alt') || 'Loading...';
    case 'playing':
      return t('action_stop_speaking') || 'Stop speaking';
    case 'error':
      return tts.errorMessage.value || 'TTS error';
    default:
      return 'Text to speech';
  }
});

// Actions
const handleTranslateClick = (event) => {
  if (props.disabled) return;

  event.preventDefault();
  event.stopPropagation();

  isActive.value = true;
  tracker.trackTimeout(() => {
    isActive.value = false;
  }, 150);

  const clickData = { id: props.id, text: props.text, position: props.position };
  emit('click', clickData);
};

const handleTTSClick = async (event) => {
  if (props.disabled) return;
  
  event.preventDefault();
  event.stopPropagation();

  if (!props.text || !props.text.trim()) {
    return;
  }

  try {
    if (effectiveTTSState.value === 'idle') {
      localTTSId.value = `pending_${Date.now()}`;
      const success = await tts.speak(props.text, 'auto');
      if (success) {
        localTTSId.value = tts.currentTTSId.value;
      } else {
        localTTSId.value = null;
      }
    } else if (effectiveTTSState.value === 'playing' || effectiveTTSState.value === 'loading') {
      const success = await tts.stop();
      if (success) {
        localTTSId.value = null;
      }
    } else if (effectiveTTSState.value === 'error') {
      localTTSId.value = `pending_retry_${Date.now()}`;
      const success = await tts.speak(props.text, 'auto');
      if (success) {
        localTTSId.value = tts.currentTTSId.value;
      } else {
        localTTSId.value = null;
      }
    }
  } catch (error) {
    console.warn('[TranslationIcon] TTS toggle error:', error);
    localTTSId.value = null;
  }
};

// Keyboard Accessibility Handlers
const onKeydownTranslate = (event) => {
  if (props.disabled) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    handleTranslateClick(event);
  }
};

const onKeydownTTS = (event) => {
  if (props.disabled) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    handleTTSClick(event);
  }
};

// Life Cycle Animations
const animateIn = () => {
  isVisible.value = true;
};

const animateOut = () => {
  isVisible.value = false;
  
  // Note: Per user preference, we do NOT stop TTS audio on click translate, 
  // but if the toolbar is dismissed (e.g. clicking outside) we want to stop it.
  // We can check if a transition is in progress globally, or just stop it 
  // if it's a true dismissal. The simplest way is to check the global state
  // to see if we're transitioning to a window.
  const isTransitioning = window.windowsManagerInstance?._isIconToWindowTransition;
  if (!isTransitioning) {
    tts.stop();
  }

  tracker.trackTimeout(() => {
    emit('close', props.id);
  }, 300);
};

const handleDismiss = () => {
  animateOut();
};

const handleDismissAll = () => {
  animateOut();
};

// Mount & Listeners Setup
onMounted(async () => {
  // Inject specific styling
  try {
    const { windowsUiStyles } = await import('@/core/content-scripts/chunks/lazy-styles.js');
    const { injectStylesToShadowRoot } = await import('@/utils/ui/styleInjector.js');
    
    if (windowsUiStyles && injectStylesToShadowRoot) {
      injectStylesToShadowRoot(windowsUiStyles, 'vue-windows-specific-styles');
    }
  } catch (error) {
    console.warn('[TranslationIcon] Failed to load lazy styles:', error);
  }

  animateIn();
  
  // Track positioning resource cleanup
  tracker.trackResource('positioning', () => cleanupPositioning());

  // Listeners via resource tracker
  const eventName = `dismiss-icon-${props.id}`;
  tracker.addEventListener(pageEventBus, eventName, handleDismiss);
  tracker.addEventListener(pageEventBus, 'dismiss-all-icons', handleDismissAll);
});

// Explicit cleanup on unmount
onUnmounted(() => {
  // Stop TTS if it's currently active on this instance and NOT transitioning to window
  const isTransitioning = window.windowsManagerInstance?._isIconToWindowTransition;
  if (isThisTTSActive.value && !isTransitioning) {
    tts.stop();
  }
});

// Public Methods Exposure
defineExpose({
  animateIn,
  animateOut,
  handleDismiss
});
</script>
