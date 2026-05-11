<template>
  <div 
    class="screen-selector-overlay" 
    :class="{ 
      selecting: isSelecting, 
      capturing: isCapturing, 
      hidden: isHidingForCapture,
      'theme-dark': settingsStore.isDarkTheme,
      'theme-light': !settingsStore.isDarkTheme,
      'is-ready': isStylesLoaded,
      'no-languages': !canCapture,
      'rtl': isRTL
    }"
    :dir="isRTL ? 'rtl' : 'ltr'"
    :style="!isStylesLoaded ? { display: 'none' } : {}"
    @mousedown="canCapture ? startSelection($event) : cancel()"
    @touchstart="canCapture ? handleTouchStart($event) : cancel()"
  >
    <!-- Selection box -->
    <div 
      v-if="hasSelection"
      class="selection-box"
      :style="selectionStyle"
    >
      <!-- Selection corners for resize handles -->
      <div class="selection-corners">
        <div class="corner corner-tl" />
        <div class="corner corner-tr" />
        <div class="corner corner-bl" />
        <div class="corner corner-br" />
      </div>
      
      <!-- Selection info -->
      <div class="selection-info">
        {{ Math.round(selectionRect.width) }} × {{ Math.round(selectionRect.height) }}
      </div>
    </div>

    <!-- Toolbar -->
    <div 
      class="capture-toolbar" 
      :class="{ visible: (isCapturing || !isSelecting) && !isHidingForCapture }"
      @mousedown.stop
      @touchstart.stop
      @click.stop
    >
      <div class="toolbar-content">
        <!-- Capture options -->
        <div class="capture-options">
          <label
            class="ocr-language-select"
            :title="$t('screen_capture_ocr_language')"
          >
            <span class="ocr-language-label">{{ $t('screen_capture_ocr_language') }}</span>
            <div class="ocr-select-container">
              <select
                v-model="selectedOCRLanguage"
                class="ocr-language-dropdown"
                :disabled="isCapturing || downloadedLanguageOptions.length === 0"
                @change="persistSelectedOCRLanguage"
              >
                <option
                  v-if="downloadedLanguageOptions.length === 0"
                  value=""
                >
                  {{ $t('ocr_status_not_installed') }}
                </option>
                <option
                  v-for="lang in downloadedLanguageOptions"
                  :key="lang.code"
                  :value="lang.code"
                >
                  {{ lang.name }}
                </option>
              </select>
              <button 
                class="manage-langs-btn" 
                :disabled="isCapturing"
                :title="$t('options_page_title')"
                @click="openOCRSettings"
              >
                <img 
                  :src="SettingsIcon" 
                  class="btn-icon" 
                  alt="Settings" 
                  width="14"
                  height="14"
                >
              </button>
            </div>
          </label>

          <button 
            v-if="allowFullScreen"
            class="toolbar-btn fullscreen-btn"
            :disabled="isCapturing || !canCapture"
            :title="$t('screen_capture_full_screen')"
            @click="captureFullScreen"
          >
            <img 
              :src="FullscreenIcon" 
              class="btn-icon" 
              alt="Full Screen" 
              width="16"
              height="16"
            >
            <span class="btn-text">{{ $t('screen_capture_full_screen') }}</span>
          </button>
        </div>
        
        <!-- Action buttons -->
        <div class="action-buttons">
          <button 
            class="toolbar-btn cancel-btn"
            :disabled="isCapturing"
            :title="$t('screen_capture_cancel')"
            @click="cancel"
          >
            <img 
              :src="CloseIcon" 
              class="btn-icon" 
              alt="Cancel" 
              width="16"
              height="16"
            >
            <span class="btn-text">{{ $t('screen_capture_cancel') }}</span>
          </button>
        </div>
      </div>
      
      <!-- Loading indicator -->
      <div
        v-if="isCapturing"
        class="capture-loading"
      >
        <div class="loading-spinner" />
        <span>{{ $t('screen_capture_capturing') }}</span>
      </div>
      <!-- Minimal Toolbar Hint -->
      <div
        v-if="!isCapturing"
        class="toolbar-hint"
      >
        <span
          v-if="!hasSelection"
          class="hint-text"
        >
          <template v-if="canCapture">
            {{ $t('screen_capture_drag_to_select') }}
          </template>
          <template v-else>
            {{ $t('screen_capture_missing_model_status') }}
            <a 
              href="#" 
              class="hint-link" 
              @click.prevent="openOCRSettings"
            >{{ $t('screen_capture_missing_model_action') }}</a>
          </template>
        </span>
        <span
          v-if="!hasSelection"
          class="hint-separator"
        >•</span>
        <span class="hint-shortcut"><kbd>ESC</kbd> {{ $t('screen_capture_cancel') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useScreenCapture } from '@/features/screen-capture/composables/useScreenCapture.js'
import { useSettingsStore } from '@/features/settings/stores/settings'
import { SUPPORTED_OCR_LANGUAGES, toTesseractLanguageCode } from '@/features/screen-capture/utils/ocrLanguageMap.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'
import { useResourceTracker } from '@/composables/core/useResourceTracker.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import NotificationManager from '@/core/managers/core/NotificationManager.js'
import { openOptionsPage } from '@/core/helpers.js'
import { screenCaptureCoordinator } from '@/features/screen-capture/services/ScreenCaptureCoordinator.js'

// Icons
import FullscreenIcon from '@/icons/ui/full-screen-capture.svg'
import CloseIcon from '@/icons/ui/close.svg'
import SettingsIcon from '@/icons/ui/settings.png'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'ScreenSelector')

// Localization helper
const { t } = useUnifiedI18n()

// Resource tracker for memory management
const tracker = useResourceTracker('screen-selector')
const settingsStore = useSettingsStore()

/**
 * Get browser API (cross-platform compatible)
 */
const getBrowserAPI = () => {
  if (typeof browser !== 'undefined') return browser;
  if (typeof chrome !== 'undefined') return chrome;
  throw new Error('Extension API not available');
};

/**
 * Load downloaded languages from background via messaging
 */
const downloadedLanguageCodes = ref([]);

async function loadDownloadedLanguages() {
  try {
    const api = getBrowserAPI();
    const response = await api.runtime.sendMessage({
      action: MessageActions.SYNC_OCR_DOWNLOADABLE_LANGUAGES
    });

    if (response?.success && Array.isArray(response.languages)) {
      downloadedLanguageCodes.value = response.languages;
      logger.debug('Downloaded languages loaded from background:', response.languages);
    } else {
      logger.debug('No downloaded languages found');
    }
  } catch (error) {
    logger.warn('Failed to load downloaded languages from background:', error);
  }
}

const props = defineProps({
  onSelect: {
    type: Function,
    default: () => {}
  },
  onCancel: {
    type: Function,
    default: () => {}
  },
  onError: {
    type: Function,
    default: () => {}
  },
  allowFullScreen: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['select', 'cancel', 'error'])

// Use screen capture composable
const {
  isSelecting,
  isCapturing,
  selectionRect,
  error,
  hasSelection,
  selectionStyle,
  startSelection,
  confirmSelection: captureSelection,
  cancelSelection,
  resetSelection: resetCaptureSelection,
  captureFullScreen: captureFullScreenArea,
  handleTouchStart
} = useScreenCapture()

// Notification Manager
const notificationManager = new NotificationManager()

/**
 * Shows a localized toast error message
 * @param {string} errorKey - Internal error key (no-text, model-error, etc.)
 */
const showToastError = (errorKey) => {
  let message = t('screen_capture_error_failed')
  
  if (errorKey === 'no-text') {
    message = t('screen_capture_error_no_text')
  } else if (errorKey === 'model-error') {
    message = t('screen_capture_error_model')
  } else if (errorKey === 'model-not-installed') {
    message = t('screen_capture_error_model_missing')
  } else if (errorKey && errorKey.length > 5) {
    // If it's a direct message from elsewhere, use it
    message = errorKey
  }

  notificationManager.show(message, 'error', 4000, {
    id: 'screen-capture-error'
  })
}

// Watch for errors from composable
watch(error, (newError) => {
  if (newError) {
    showToastError(newError)
    props.onError(newError)
    emit('error', newError)
  }
})

// Additional state
const isHidingForCapture = ref(false)
const selectedOCRLanguage = ref('')
const isStylesLoaded = ref(false)
const isCancelled = ref(false)
const activeStatusToastId = ref(null)

const canCapture = computed(() => downloadedLanguageOptions.value.length > 0)
const isRTL = computed(() => t('IsRTL') === 'true')

const downloadedLanguageOptions = computed(() => {
  return downloadedLanguageCodes.value
    .map(code => {
      const language = SUPPORTED_OCR_LANGUAGES.find(item => item.code === code)
      return {
        code,
        name: language?.name || code
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
})

const getCaptureOptions = () => {
  return selectedOCRLanguage.value
    ? { ocrLang: selectedOCRLanguage.value }
    : {}
}

const selectAvailableOCRLanguage = () => {
  const downloadedCodes = downloadedLanguageOptions.value.map(lang => lang.code)
  const configuredCode = toTesseractLanguageCode(settingsStore.settings.OCR_DEFAULT_LANG)

  if (downloadedCodes.includes(selectedOCRLanguage.value)) {
    return
  }

  if (downloadedCodes.includes(configuredCode)) {
    selectedOCRLanguage.value = configuredCode
    return
  }

  selectedOCRLanguage.value = downloadedCodes[0] || ''
}

const persistSelectedOCRLanguage = async () => {
  if (!selectedOCRLanguage.value) {
    return
  }

  try {
    await settingsStore.updateSettingAndPersist('OCR_DEFAULT_LANG', selectedOCRLanguage.value)
  } catch (err) {
    logger.warn('Failed to persist OCR language selection:', err)
  }
}

watch(downloadedLanguageOptions, selectAvailableOCRLanguage)

/**
 * Execute a capture action while temporarily hiding the UI
 * @param {Function} captureFn The capture function to execute
 */
const runCaptureAction = async (captureFn) => {
  const captureId = Date.now()
  isCancelled.value = false
  isHidingForCapture.value = true
  
  // Start session in coordinator to track result
  screenCaptureCoordinator.startSession(captureId)

  // Show status notification
  activeStatusToastId.value = notificationManager.showStatus(t('screen_capture_status_extracting'))

  // Wait for two frames to ensure the UI is fully hidden by the browser before capturing
  await new Promise(resolve => requestAnimationFrame(() => {
    requestAnimationFrame(resolve)
  }))

  try {
    const result = await captureFn({ ...getCaptureOptions(), captureId })
    
    // If user cancelled during the async process, ignore the result
    if (isCancelled.value) {
      logger.debug('Capture action completed but user had already cancelled')
      return
    }

    logger.debug('Action captured successfully')
    emit('select', result)
    props.onSelect(result)
  } catch (err) {
    // Only show/emit error if not cancelled
    if (!isCancelled.value) {
      logger.error('Capture action failed:', err)
      emit('error', err)
      props.onError(err)
    }
  } finally {
    isHidingForCapture.value = false
    if (activeStatusToastId.value) {
      notificationManager.dismiss(activeStatusToastId.value)
      activeStatusToastId.value = null
    }
  }
}

// Methods
const confirmSelection = async () => {
  logger.debug('Confirm Selection clicked!')
  if (!hasSelection.value || isCapturing.value) {
    logger.debug('Cannot confirm: no selection or already capturing')
    return
  }

  await runCaptureAction(captureSelection)
}

// Watch for selection completion to auto-capture or cancel on click
watch(isSelecting, (newValue, oldValue) => {
  // When mouse is released (isSelecting goes from true to false)
  if (oldValue === true && newValue === false) {
    if (hasSelection.value) {
      logger.info('Auto-capturing after selection completion');
      confirmSelection();
    } else {
      logger.info('No selection made (simple click), cancelling capture');
      cancel();
    }
  }
});

const captureFullScreen = async () => {
  logger.debug('Capture Full Screen clicked!')
  if (isCapturing.value) {
    logger.debug('Already capturing, ignoring click')
    return
  }

  await runCaptureAction(captureFullScreenArea)
}

const resetSelection = () => {
  logger.debug('Reset Selection clicked!')
  resetCaptureSelection()
}

const openOCRSettings = () => {
  logger.debug('Opening OCR settings page')
  openOptionsPage('ocr')
  cancel()
}

const cancel = () => {
  logger.debug('Cancel clicked!')
  isCancelled.value = true
  
  // Cancel session in coordinator
  screenCaptureCoordinator.cancelSession()

  // Immediately dismiss the processing toast if it exists
  if (activeStatusToastId.value) {
    notificationManager.dismiss(activeStatusToastId.value)
    activeStatusToastId.value = null
  }

  cancelSelection()
  emit('cancel')
  props.onCancel()
}

// Mouse tracking
const handleMouseMove = (_event) => {
  // Logic for custom cursor was removed to fix double-cursor issue
}

const handleMouseLeave = () => {
  // Logic for custom cursor was removed
}

// Keyboard shortcuts
const handleKeyDown = (event) => {
  switch (event.key) {
    case 'Escape':
      cancel()
      break
    case 'r':
    case 'R':
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        resetSelection()
      }
      break
    case 'f':
    case 'F':
      if ((event.ctrlKey || event.metaKey) && props.allowFullScreen && canCapture.value) {
        event.preventDefault()
        captureFullScreen()
      }
      break
  }
}

// Prevent context menu
const handleContextMenu = (event) => {
  event.preventDefault()
}

// Lifecycle
onMounted(async () => {
  try {
    await settingsStore.loadSettings();
    await loadDownloadedLanguages();
    selectAvailableOCRLanguage();
  } catch (err) {
    logger.warn('Failed to load OCR language options:', err)
  }

  // Inject Screen Capture specific styles lazily
  try {
    const { screenCaptureUiStyles } = await import('@/core/content-scripts/chunks/lazy-styles.js');
    const { injectStylesToShadowRoot } = await import('@/utils/ui/styleInjector.js');
    
    if (screenCaptureUiStyles && injectStylesToShadowRoot) {
      await injectStylesToShadowRoot(screenCaptureUiStyles, 'vue-screen-capture-specific-styles');
    }
  } catch (error) {
    logger.warn('Failed to load lazy styles:', error);
  } finally {
    isStylesLoaded.value = true;
  }

  tracker.addEventListener(document, 'mousemove', handleMouseMove)
  tracker.addEventListener(document, 'mouseleave', handleMouseLeave)
  tracker.addEventListener(document, 'keydown', handleKeyDown)
  tracker.addEventListener(document, 'contextmenu', handleContextMenu)

  // Listen for cancel event from global shortcut manager
  const { pageEventBus } = await import('@/core/PageEventBus.js');
  tracker.addEventListener(pageEventBus, 'cancel-screen-capture', () => {
    logger.info('Received cancel-screen-capture event');
    cancel();
  });
})

onUnmounted(() => {
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseleave', handleMouseLeave)
  document.removeEventListener('keydown', handleKeyDown)
  document.removeEventListener('contextmenu', handleContextMenu)
})
</script>
