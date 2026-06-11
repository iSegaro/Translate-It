import { ref, computed, onMounted } from 'vue';
import { deviceDetector } from '@/utils/browser/compatibility.js';
import { MOBILE_CONSTANTS } from '@/shared/constants/mobile.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { UI_HOST_IDS } from '@/shared/constants/ui.js';

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
  const isScreenCaptureActive = ref(false);
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
   * Update fullscreen state based on document events.
   * 
   * Strategy:
   * During browser fullscreen, only descendants of the active fullscreenElement are rendered.
   * Since our main Shadow DOM host starts attached to document.documentElement, it is hidden
   * when any other element enters fullscreen. To support Live Caption overlay, FAB, and other UIs
   * in fullscreen mode, we dynamically relocate the UI host inside the active fullscreenElement.
   * 
   * Tradeoffs:
   * 1. DOM Mutation: Appending the UI host inside video containers (e.g. YouTube wrappers) may trigger
   *    minor layout shifts or player resizing, though typically bypassed via absolute/fixed positioning.
   * 2. Shadow DOM Containment: The host remains fully isolated and doesn't pollute the target's style space.
   * 3. Z-Index Stack: Appending as the last child of the fullscreen root, combined with z-index 2147483647,
   *    guarantees our UIs sit above the player overlay/controls.
   */
  const updateFullscreenState = () => {
    const fullscreenEl = (
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );
    const isNowFullscreen = !!fullscreenEl;
    mobileStore.setFullscreen(isNowFullscreen);

    const hostId = isTopFrame ? UI_HOST_IDS.MAIN : UI_HOST_IDS.IFRAME;
    const hostElement = document.getElementById(hostId);
    if (hostElement) {
      if (fullscreenEl) {
        if (hostElement.parentNode !== fullscreenEl) {
          try {
            fullscreenEl.appendChild(hostElement);
            logger.debug('Moved UI host to fullscreen element', { hostId });
          } catch (error) {
            logger.warn('Failed to move UI host to fullscreen element', { error, hostId });
          }
        }
      } else {
        if (hostElement.parentNode !== document.documentElement) {
          try {
            document.documentElement.appendChild(hostElement);
            logger.debug('Restored UI host to document root', { hostId });
          } catch (error) {
            logger.warn('Failed to restore UI host to document root', { error, hostId });
          }
        }
      }
    }
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

      tracker.addEventListener(pageEventBus, 'screen-capture-activated', () => {
        logger.info('Event: screen-capture-activated');
        isScreenCaptureActive.value = true;
      });

      tracker.addEventListener(pageEventBus, 'screen-capture-deactivated', () => {
        logger.info('Event: screen-capture-deactivated');
        isScreenCaptureActive.value = false;
      });
    }
  });

  return {
    isTopFrame,
    canAccessTop,
    shouldShowGlobalUI,
    isSelectModeActive,
    isScreenCaptureActive,
    isFullscreen,
    isExtensionEnabled,
    showDesktopFab,
    showMobileFab,
    isMobileUI,
    updateFullscreenState
  };
}
