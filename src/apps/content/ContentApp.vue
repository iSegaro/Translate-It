<template>
  <div
    :class="[
      'content-app-container', 
      TRANSLATION_HTML.NO_TRANSLATE_CLASS,
      settingsStore.isDarkTheme ? 'theme-dark' : 'theme-light'
    ]"
    :translate="TRANSLATION_HTML.NO_TRANSLATE_VALUE"
  >
    <!-- This will host all in-page UI components -->
    <Toaster
      v-if="shouldShowGlobalUI"
      rich-colors
      position="bottom-right"
      expand
      :toast-options="{
        style: {
          pointerEvents: 'auto',
          cursor: 'auto',
          zIndex: 2147483647,
          unicodeBidi: 'plaintext',
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
          maxWidth: '320px',
          minWidth: '280px',
          whiteSpace: 'pre-wrap',
          overflow: 'hidden',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
        }
      }"
    />
    <template v-if="isExtensionEnabled && settingsStore.isInitialized">
      <!-- TextField Interaction Icons -->
      <TextFieldIcon
        v-for="icon in activeIcons"
        :id="icon.id"
        :key="icon.id"
        :ref="el => setIconRef(icon.id, el)"
        :position="icon.position"
        :visible="icon.visible !== false"
        :target-element="icon.targetElement"
        :attachment-mode="icon.attachmentMode || 'smart'"
        :positioning-mode="icon.positioningMode || 'absolute'"
        @click="onIconClick"
        @position-updated="onIconPositionUpdated"
      />

      <!-- WindowsManager Translation Windows -->
      <TranslationWindow
        v-for="window in translationWindows"
        :id="window.id"
        :key="window.id"
        :position="window.position"
        :selected-text="window.selectedText"
        :initial-translated-text="window.translatedText"
        :theme="window.theme"
        :is-loading="window.isLoading"
        :is-error="window.isError"
        :error-type="window.errorType"
        :can-retry="window.canRetry"
        :needs-settings="window.needsSettings"
        :initial-size="window.initialSize"
        :target-language="window.targetLanguage || 'auto'"
        :source-language="window.sourceLanguage || 'auto'"
        :detected-source-language="window.detectedSourceLanguage"
        :provider="window.provider"
        @close="onTranslationWindowClose"
        @speak="onTranslationWindowSpeak"
      />

      <!-- WindowsManager Translation Icons -->
      <TranslationIcon
        v-for="icon in translationIcons"
        :id="icon.id"
        :key="icon.id"
        :position="icon.position"
        :text="icon.text"
        @click="onTranslationIconClick"
        @close="onTranslationIconClose"
      />

      <!-- Select Element Overlays -->
      <ElementHighlightOverlay />

      <!-- Mobile Bottom Sheet -->
      <MobileSheet v-if="isMobileUI && isTopFrame" />

      <!-- Desktop FAB Menu -->
      <DesktopFabMenu 
        v-if="!isMobileUI && showDesktopFab && isTopFrame" 
      />

      <!-- Mobile Floating Action Button (FAB) -->
      <MobileFab
        v-if="isMobileUI && showMobileFab && !mobileStore.isOpen && !isSelectModeActive && !isFullscreen && isTopFrame"
      />

      <!-- Page Translation Original Text Tooltip -->
      <PageTranslationTooltip />
    </template>
  </div>
</template>

<script setup>
import './ContentApp.scss'
import { onUnmounted, defineAsyncComponent } from 'vue';
import { Toaster } from 'vue-sonner';
import { useWindowsManager } from '@/features/windows/composables/useWindowsManager.js';
import { useSettingsStore } from '@/features/settings/stores/settings.js';
import { useMobileStore } from '@/store/modules/mobile.js';
import { useResourceTracker } from '@/composables/core/useResourceTracker.js';
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js';

// --- UI Components ---

// Static Imports (Critical & Immediate UI)
// These are loaded immediately to ensure responsiveness and core system integrity.
import TextFieldIcon from '@/features/text-field-interaction/components/TextFieldIcon.vue';
import ElementHighlightOverlay from './components/ElementHighlightOverlay.vue';

// Lazy Loaded Components (Optimized Resource Usage)
// These components are loaded on-demand or based on device type to reduce the initial JS footprint.
const TranslationWindow = defineAsyncComponent(() => import('@/features/windows/components/TranslationWindow.vue'));
const TranslationIcon = defineAsyncComponent(() => import('@/features/windows/components/TranslationIcon.vue'));
const PageTranslationTooltip = defineAsyncComponent(() => import('./components/PageTranslationTooltip.vue'));

// Device-Specific Lazy Components
const MobileSheet = defineAsyncComponent(() => import('./components/mobile/MobileSheet.vue'));
const MobileFab = defineAsyncComponent(() => import('./components/mobile/MobileFab.vue'));
const DesktopFabMenu = defineAsyncComponent(() => import('./components/desktop/DesktopFabMenu.vue'));

import { TRANSLATION_HTML } from '@/shared/config/constants.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

// Import New Composables for modular architecture
import { useContentAppLocalization } from './composables/useContentAppLocalization.js';
import { useContentAppUIState } from './composables/useContentAppUIState.js';
import { useContentAppNotifications } from './composables/useContentAppNotifications.js';
import { useContentAppTextFieldIcons } from './composables/useContentAppTextFieldIcons.js';
import { useContentAppPageTranslation } from './composables/useContentAppPageTranslation.js';
import { useContentAppLifecycle } from './composables/useContentAppLifecycle.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT_APP, 'ContentApp');

// Localization helper for template (Standard project approach)
useUnifiedI18n();

// 1. Core Stores & Resource Tracker
const settingsStore = useSettingsStore();
const mobileStore = useMobileStore();
const tracker = useResourceTracker('content-app');

// 2. Localization & RTL Management
const { toastRTL, updateToastRTL } = useContentAppLocalization(settingsStore);

// 3. UI State Management (Frame detection, Fullscreen, Mobile/Desktop mode)
const {
  isTopFrame,
  shouldShowGlobalUI,
  isSelectModeActive,
  isFullscreen,
  isExtensionEnabled,
  showDesktopFab,
  showMobileFab,
  isMobileUI
} = useContentAppUIState(settingsStore, mobileStore, tracker);

// 4. Notifications (Toasts) Management
useContentAppNotifications({ shouldShowGlobalUI, toastRTL, tracker });

// 5. TextField Interaction Icons Management
const {
  activeIcons,
  setIconRef,
  onIconClick,
  onIconPositionUpdated
} = useContentAppTextFieldIcons(tracker);

// 6. WindowsManager (Translation Windows & Icons)
const {
  translationWindows,
  translationIcons,
  onTranslationIconClick,
  onTranslationWindowClose,
  onTranslationWindowSpeak,
  onTranslationIconClose,
  setupEventListeners,
  cleanupEventListeners
} = useWindowsManager();

// Initialize WindowsManager listeners
setupEventListeners();

// 7. Page Translation Sync Logic
useContentAppPageTranslation(mobileStore, tracker);

// 8. Lifecycle & Cleanup Logic
const onNavigationCleanup = () => {
  // Close all active translation windows
  if (translationWindows.value.length > 0) {
    translationWindows.value.forEach(window => {
      onTranslationWindowClose(window.id);
    });
  }
  
  // Close all active translation icons  
  if (translationIcons.value.length > 0) {
    translationIcons.value.forEach(icon => {
      onTranslationIconClose(icon.id);
    });
  }
  
  // Clear all text field icons
  activeIcons.value = [];
  
  // Reset selection mode state
  isSelectModeActive.value = false;
  
  // Dismiss all pending notifications
  const pageEventBus = window.pageEventBus;
  if (pageEventBus) {
    pageEventBus.emit('dismiss_all_notifications');
  }
};

useContentAppLifecycle({
  settingsStore,
  tracker,
  updateToastRTL,
  onNavigationCleanup
});

onUnmounted(() => {
  cleanupEventListeners();
  logger.debug('ContentApp unmounted, cleaned up WindowsManager listeners.');
});

logger.debug('ContentApp script setup executed (Modular Architecture).');
</script>
