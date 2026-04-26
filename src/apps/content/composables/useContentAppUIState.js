import { ref, computed, onMounted } from 'vue';
import { deviceDetector } from '@/utils/browser/compatibility.js';
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT_APP, 'useContentAppUIState');

/**
 * Composable for managing UI state (Mobile/Desktop, Fullscreen, Top Frame detection)
 * for the ContentApp.
 * 
 * @param {Object} settingsStore - The settings store instance
 * @param {Object} mobileStore - The mobile store instance
 * @param {Object} tracker - Resource tracker for event listeners
 * @returns {Object} UI state and utility functions
 */
export function useContentAppUIState(settingsStore, mobileStore, tracker) {
  // Detection for iframe vs main frame
  const isTopFrame = window === window.top;

  // Check if we can access the top frame (Same-Origin check)
  const canAccessTop = (() => {
    try {
      return !!(window.top && window.top.location && window.top.location.href);
    } catch {
      return false;
    }
  })();

  // A frame should show its own global UI (Toaster, FABs) if:
  // 1. It is the top frame
  // 2. OR it is a cross-origin iframe (isolated from top frame's UI/Events)
  const shouldShowGlobalUI = computed(() => isTopFrame || !canAccessTop);

  // Status for various UI components
  const isSelectModeActive = ref(false);
  const isFullscreen = computed(() => mobileStore.isFullscreen); 
  const isExtensionEnabled = computed(() => settingsStore.settings?.EXTENSION_ENABLED !== false);
  const showDesktopFab = computed(() => settingsStore.settings?.SHOW_DESKTOP_FAB !== false);
  const showMobileFab = computed(() => settingsStore.settings?.SHOW_MOBILE_FAB !== false);

  // Determine if we should use Mobile UI based on device and user preference
  const isMobileUI = computed(() => {
    const mode = settingsStore.settings?.MOBILE_UI_MODE || MOBILE_CONSTANTS.UI_MODE.AUTO;
    if (mode === MOBILE_CONSTANTS.UI_MODE.MOBILE) return true;
    if (mode === MOBILE_CONSTANTS.UI_MODE.DESKTOP) return false;
    return deviceDetector.shouldEnableMobileUI();
  });

  /**
   * Update fullscreen state based on document events
   */
  const updateFullscreenState = () => {
    const isNowFullscreen = !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );
    mobileStore.setFullscreen(isNowFullscreen);
  };

  onMounted(() => {
    // Initial check
    updateFullscreenState();

    // Fullscreen listeners via tracker
    tracker.addEventListener(document, 'fullscreenchange', updateFullscreenState);
    tracker.addEventListener(document, 'webkitfullscreenchange', updateFullscreenState);
    tracker.addEventListener(document, 'mozfullscreenchange', updateFullscreenState);
    tracker.addEventListener(document, 'MSFullscreenChange', updateFullscreenState);

    // Listen for Select Element Mode changes
    const pageEventBus = window.pageEventBus;
    if (pageEventBus) {
      tracker.addEventListener(pageEventBus, 'select-mode-activated', () => {
        logger.info('Event: select-mode-activated');
        isSelectModeActive.value = true;
      });

      tracker.addEventListener(pageEventBus, 'select-mode-deactivated', () => {
        logger.info('Event: select-mode-deactivated');
        isSelectModeActive.value = false;
      });
    }
  });

  return {
    isTopFrame,
    canAccessTop,
    shouldShowGlobalUI,
    isSelectModeActive,
    isFullscreen,
    isExtensionEnabled,
    showDesktopFab,
    showMobileFab,
    isMobileUI,
    updateFullscreenState
  };
}
