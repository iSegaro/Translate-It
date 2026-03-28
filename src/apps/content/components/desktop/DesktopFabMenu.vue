<template>
  <div
    v-show="!isFullscreen"
    ref="fabContainerRef"
    class="desktop-fab-container notranslate"
    :class="[settingsStore.isDarkTheme ? 'theme-dark' : 'theme-light', { 'is-dark': settingsStore.isDarkTheme }]"
    translate="no"
    :style="containerStyle"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <!-- Revert Action (Small Badge Button) -->
    <Transition name="fade-scale">
      <div 
        v-if="mobileStore.hasElementTranslations && (isHovered || isMenuOpen)" 
        class="fab-revert-badge"
        :title="t('desktop_fab_revert_tooltip')"
        :style="[
          { 
            'position': 'absolute !important', 
            'bottom': '42px !important', 
            'width': '32px !important', 
            'height': '32px !important', 
            'border-radius': '50% !important', 
            'background-color': '#fa5252 !important', 
            'display': 'flex !important', 
            'justify-content': 'center !important', 
            'align-items': 'center !important', 
            'cursor': 'pointer !important', 
            'box-shadow': side === 'right' ? '-4px 4px 12px rgba(250, 82, 82, 0.3) !important' : '4px 4px 12px rgba(250, 82, 82, 0.3) !important', 
            'z-index': '2147483647 !important', 
            'transition': 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease, left 0.5s ease, right 0.5s ease !important', 
            'pointer-events': 'auto !important' 
          },
          side === 'right' ? { 'right': '15px !important' } : { 'left': '15px !important' },
          { 'transform': getBadgeTransform(isHovered || isMenuOpen, isRevertHovered) }
        ]"
        @click.stop="handleRevert"
        @mouseenter="isRevertHovered = true"
        @mouseleave="isRevertHovered = false"
      >
        <img
          :src="IconRevert"
          :alt="t('desktop_fab_revert_tooltip')"
          style="width: 16px !important; height: 16px !important; filter: brightness(0) invert(1) !important;"
        >
      </div>
    </Transition>

    <!-- Menu -->
    <Transition name="fab-menu">
      <div 
        v-if="isMenuOpen" 
        class="desktop-fab-menu"
        :style="[
          menuStyle,
          side === 'right' ? { 'right': '85px !important' } : { 'left': '85px !important' },
          { 
            'position': 'absolute !important', 
            'bottom': '0px !important', 
            'border-radius': '14px !important', 
            'padding': '8px 0 !important', 
            'min-width': '230px !important', 
            'width': 'max-content !important', 
            'display': 'flex !important', 
            'flex-direction': 'column !important', 
            'z-index': '2147483647 !important', 
            'overflow': 'hidden !important', 
            'margin': '0 !important',
            'transition': 'all 0.3s ease, left 0.5s ease, right 0.5s ease !important',
            'transform-origin': side === 'right' ? 'bottom right' : 'bottom left'
          }
        ]"
      >
        <div 
          v-for="item in menuItems" 
          :key="item.id" 
          class="fab-menu-item"
          :class="{ 'is-disabled': item.disabled }"
          style="display: flex !important; align-items: center !important; padding: 12px 18px !important; cursor: pointer !important; width: 100% !important; box-sizing: border-box !important; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;"
          :style="item.disabled ? { 'opacity': '0.5 !important', 'cursor': 'default !important', 'pointer-events': 'none !important' } : {}"
          @click.stop="item.disabled ? null : handleMenuItemClick(item)"
        >
          <div :style="{ 'margin-right': side === 'right' ? '12px !important' : '0 !important', 'margin-left': side === 'left' ? '12px !important' : '0 !important', 'order': side === 'left' ? 2 : 0 }" style="display: flex !important; align-items: center !important; justify-content: center !important; width: 24px !important; height: 24px !important; flex-shrink: 0 !important;">
            <img 
              v-if="item.icon" 
              :src="item.icon" 
              :alt="item.label" 
              class="fab-menu-icon"
              :style="menuIconStyle"
            >
          </div>
          <span :style="[menuItemTextStyle, { 'text-align': side === 'right' ? 'left' : 'right' }]" style="font-size: 14px !important; font-weight: 500 !important; white-space: nowrap !important; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important; line-height: 1.4 !important; flex: 1 !important;">{{ item.label }}</span>
        </div>
      </div>
    </Transition>

    <!-- Main Button -->
    <div
      class="desktop-fab-button"
      :class="{ 'is-open': isMenuOpen, 'is-dragging': isDragging }"
      :title="t('desktop_fab_tooltip')"
      :style="[
        { 
          'transform': (isHovered || isMenuOpen ? (side === 'right' ? 'translateX(-18px)' : 'translateX(18px)') : 'translateX(0)'),
          'cursor': 'pointer !important',
          'pointer-events': 'auto !important',
          'box-shadow': side === 'right' ? '-4px 0 20px rgba(0, 0, 0, 0.2)' : '4px 0 20px rgba(0, 0, 0, 0.2)'
        },
        side === 'right' ? { 'border-radius': '50% 0 0 50% !important' } : { 'border-radius': '0 50% 50% 0 !important' }
      ]"
      @mousedown="startDrag"
      @click.stop="toggleMenu"
    >
      <img 
        src="@/icons/extension/extension_icon_64.svg" 
        :alt="t('desktop_fab_alt')" 
        :style="[
          { 'width': '32px !important', 'height': '32px !important', 'display': 'block !important', 'pointer-events': 'none !important', 'object-fit': 'contain !important', 'filter': 'none !important', 'opacity': '1 !important', 'visibility': 'visible !important', 'transition': 'transform 0.5s ease !important' },
          side === 'right' ? { 'margin-right': '15px !important', 'transform': 'scaleX(1)' } : { 'margin-left': '15px !important', 'transform': 'scaleX(-1)' }
        ]"
      >
      <!-- Pending Selection Badge (ONLY in onFabClick mode) -->
      <Transition name="fade-scale">
        <div 
          v-if="pendingSelection.hasSelection && pendingSelection.mode === 'onFabClick'"
          class="fab-translate-badge"
          :style="side === 'right' ? { 'left': '-5px !important' } : { 'right': '-5px !important' }"
          style="position: absolute !important; top: -5px !important; width: 22px !important; height: 22px !important; border-radius: 50% !important; background-color: #4A90E2 !important; border: 2px solid #ffffff !important; display: flex !important; justify-content: center !important; align-items: center !important; box-shadow: 0 2px 6px rgba(0,0,0,0.2) !important; z-index: 2147483647 !important;"
        >
          <img
            :src="IconTranslateSelection"
            style="width: 12px !important; height: 12px !important; filter: brightness(0) invert(1) !important;"
          >
        </div>
      </Transition>
    </div>

    <!-- Settings Button (Dynamic position based on TTS visibility) -->
    <Transition name="fade-scale">
      <div 
        v-if="isMenuOpen" 
        class="fab-settings-badge"
        :title="t('desktop_fab_settings_tooltip')"
        :style="[
          settingsBadgeStyle, 
          side === 'right' ? { 'right': '15px !important' } : { 'left': '15px !important' },
          { 
            'position': 'absolute !important', 
            'width': '32px !important', 
            'height': '32px !important', 
            'border-radius': '50% !important', 
            'display': 'flex !important', 
            'justify-content': 'center !important', 
            'align-items': 'center !important', 
            'cursor': 'pointer !important', 
            'z-index': '2147483647 !important', 
            'transition': 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease, bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1), left 0.5s ease, right 0.5s ease !important', 
            'pointer-events': 'auto !important',
            'bottom': (isTTSActive && (isHovered || isMenuOpen) ? '-84px' : '-42px') + ' !important',
            'transform': getBadgeTransform(isHovered || isMenuOpen, isSettingsHovered)
          }
        ]"
        @click.stop="handleOpenSettings"
        @mouseenter="isSettingsHovered = true"
        @mouseleave="isSettingsHovered = false"
      >
        <img
          :src="IconSettings"
          :alt="t('desktop_fab_settings_tooltip')"
          class="fab-menu-icon"
          :style="settingsIconStyle"
        >
      </div>
    </Transition>

    <!-- TTS Button (Visible when selection present OR when playing) -->
    <Transition name="fade-scale">
      <div 
        v-if="isTTSActive && (isHovered || isMenuOpen)" 
        class="fab-tts-badge"
        :title="tts.isPlaying.value ? t('desktop_fab_tts_stop_tooltip') : t('desktop_fab_tts_play_tooltip')"
        :style="[
          settingsBadgeStyle, 
          side === 'right' ? { 'right': '15px !important' } : { 'left': '15px !important' },
          { 
            'position': 'absolute !important', 
            'bottom': '-42px !important', 
            'width': '32px !important', 
            'height': '32px !important', 
            'border-radius': '50% !important', 
            'display': 'flex !important', 
            'justify-content': 'center !important', 
            'align-items': 'center !important', 
            'cursor': 'pointer !important', 
            'z-index': '2147483647 !important', 
            'transition': 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease, background-color 0.3s ease, left 0.5s ease, right 0.5s ease !important', 
            'pointer-events': 'auto !important',
            'background-color': tts.isPlaying.value ? '#4A90E2 !important' : (settingsStore.isDarkTheme ? '#3d3d3d !important' : '#ffffff !important'),
            'transform': getBadgeTransform(isHovered || isMenuOpen, isTTSHovered)
          }
        ]"
        @click.stop="handleTTS"
        @mouseenter="isTTSHovered = true"
        @mouseleave="isTTSHovered = false"
      >
        <div v-if="tts.isLoading.value" class="fab-tts-loader" style="width: 16px !important; height: 16px !important; border: 2px solid rgba(74, 144, 226, 0.3) !important; border-top-color: #4A90E2 !important; border-radius: 50% !important; animation: fab-spin 0.8s linear infinite !important;"></div>
        <img
          v-else
          :src="IconTTS"
          :alt="t('desktop_fab_tts_tooltip')"
          class="fab-menu-icon"
          :style="[settingsIconStyle, { 'filter': tts.isPlaying.value ? 'brightness(0) invert(1) !important' : (settingsIconStyle.filter || '') }]"
        >
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { sendMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { useMobileStore } from '@/store/modules/mobile.js';
import useSettingsStore from '@/features/settings/stores/settings.js';
import { TRANSLATION_STATUS } from '@/shared/config/constants.js';
import { useResourceTracker } from '@/composables/core/useResourceTracker';
import { storageManager } from '@/shared/storage/core/StorageCore.js';
import { getDesktopFabPositionAsync } from '@/shared/config/config.js';
import { pageEventBus, WINDOWS_MANAGER_EVENTS, WindowsManagerEvents } from '@/core/PageEventBus.js';
import { useTTSSmart } from '@/features/tts/composables/useTTSSmart.js';

import IconSelectElement from '@/icons/ui/select.png';
import IconTranslatePage from '@/icons/ui/whole-page.png';
import IconRevert from '@/icons/ui/revert.png';
import IconRestore from '@/icons/ui/restore.svg';
import IconClear from '@/icons/ui/clear.png';
import IconSettings from '@/icons/ui/settings.png';
import IconTranslateSelection from '@/icons/ui/translate.png';
import IconTTS from '@/icons/ui/speaker.png';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT_APP, 'DesktopFabMenu');
const mobileStore = useMobileStore();
const settingsStore = useSettingsStore();
const { t } = useUnifiedI18n();
const tracker = useResourceTracker('desktop-fab-menu');
const tts = useTTSSmart();

const isMenuOpen = ref(false);
const isFaded = ref(false);
const isHovered = ref(false);
const isRevertHovered = ref(false);
const isSettingsHovered = ref(false);
const isTTSHovered = ref(false);
const isFullscreen = computed(() => mobileStore.isFullscreen);

// Theme-aware styles as OBJECTS
const menuStyle = computed(() => {
  if (settingsStore.isDarkTheme) {
    return {
      'background-color': '#2d2d2d !important',
      'border': '1px solid rgba(255, 255, 255, 0.1) !important',
      'box-shadow': '0 10px 30px -5px rgba(0, 0, 0, 0.5) !important'
    };
  }
  return {
    'background-color': '#ffffff !important',
    'border': '1px solid rgba(0, 0, 0, 0.06) !important',
    'box-shadow': '0 10px 30px -5px rgba(0, 0, 0, 0.15), 0 8px 15px -6px rgba(0, 0, 0, 0.1) !important'
  };
});

const settingsBadgeStyle = computed(() => {
  if (settingsStore.isDarkTheme) {
    return {
      'background-color': '#3d3d3d !important',
      'border': '1px solid rgba(255, 255, 255, 0.1) !important',
      'box-shadow': '0 4px 12px rgba(0, 0, 0, 0.4) !important'
    };
  }
  return {
    'background-color': '#ffffff !important',
    'border': '1px solid rgba(0, 0, 0, 0.05) !important',
    'box-shadow': '0 4px 12px rgba(0, 0, 0, 0.1) !important'
  };
});

const menuIconStyle = computed(() => {
  return {
    'width': '20px !important',
    'height': '20px !important',
    'object-fit': 'contain !important',
    'display': 'block !important',
    'border': 'none !important',
    'padding': '0 !important',
    'filter': settingsStore.isDarkTheme ? 'invert(1) brightness(2) !important' : 'none !important'
  };
});

const settingsIconStyle = computed(() => {
  return {
    'width': '16px !important',
    'height': '16px !important',
    'filter': settingsStore.isDarkTheme ? 'invert(1) brightness(2) !important' : 'opacity(0.7) !important'
  };
});

const menuItemTextStyle = computed(() => {
  return {
    'color': settingsStore.isDarkTheme ? '#f3f4f6 !important' : '#374151 !important'
  };
});

const fabContainerRef = ref(null);
let hoverTimerId = null;
let fadeTimerId = null;

const pendingSelection = ref({
  hasSelection: false,
  text: '',
  position: null,
  mode: 'onClick' // Track which mode triggered the selection
});

const startFadeTimer = () => {
  if (fadeTimerId) {
    tracker.clearTimer(fadeTimerId);
  }
  isFaded.value = false;
  fadeTimerId = tracker.trackTimeout(() => {
    isFaded.value = true;
    fadeTimerId = null;
  }, 1000); // Set to 1s as requested
};

const handleMouseEnter = () => {
  if (hoverTimerId) {
    tracker.clearTimer(hoverTimerId);
    hoverTimerId = null;
  }
  if (fadeTimerId) {
    tracker.clearTimer(fadeTimerId);
    fadeTimerId = null;
  }
  isHovered.value = true;
  isFaded.value = false;
};

const handleMouseLeave = () => {
  // Combine hover and fade reset into one quick action
  hoverTimerId = tracker.trackTimeout(() => {
    isHovered.value = false;
    hoverTimerId = null;
    isFaded.value = true; // Directly fade out after hover ends
  }, 200);
};

const menuItems = computed(() => {
  const items = [];

  // Add Translate Selection ONLY if specifically in onFabClick mode
  if (pendingSelection.value.hasSelection && pendingSelection.value.mode === 'onFabClick') {
    items.push({
      id: 'translate_selection',
      label: t('desktop_fab_translate_selection_label'),
      icon: IconTranslateSelection,
      closeMenu: true,
      action: () => triggerTranslation()
    });
  }

  items.push({
      id: 'select_element',
      label: t('desktop_fab_select_element_label'),
      icon: IconSelectElement,
      closeMenu: true,
      action: async () => {
        try {
          await sendMessage({ action: MessageActions.ACTIVATE_SELECT_ELEMENT_MODE });
        } catch (err) {
          logger.error('Failed to trigger select element from FAB:', err);
        }
      }
    }
  );

  const pageData = mobileStore.pageTranslationData;
  const isCurrentlyBusy = pageData.status === TRANSLATION_STATUS.TRANSLATING;
  const isDone = pageData.totalCount > 0 && pageData.translatedCount >= pageData.totalCount;

  if (isCurrentlyBusy) {
    const percent = pageData.totalCount > 0 ? Math.round((pageData.translatedCount / pageData.totalCount) * 100) : 0;
    items.push({
      id: 'page_translating',
      label: `${percent}% - ${t('desktop_fab_stop_auto_translating_label')}`,
      icon: IconClear,
      closeMenu: false,
      action: () => pageEventBus.emit(MessageActions.PAGE_TRANSLATE_STOP_AUTO)
    });
  } else if (pageData.isAutoTranslating) {
    items.push({
      id: 'stop_auto',
      label: t('desktop_fab_stop_auto_translating_label'),
      icon: IconClear,
      closeMenu: false,
      action: () => pageEventBus.emit(MessageActions.PAGE_TRANSLATE_STOP_AUTO)
    });
  } else if (pageData.isTranslated || isDone) {
    items.push({
      id: 'restore_page',
      label: t('desktop_fab_restore_original_label'),
      icon: IconRestore,
      closeMenu: true,
      action: () => pageEventBus.emit(MessageActions.PAGE_RESTORE)
    });
  } else {
    // Default state: Translate Page
    items.push({
      id: 'translate_page',
      label: t('desktop_fab_translate_page_label'),
      icon: IconTranslatePage,
      closeMenu: false,
      action: () => pageEventBus.emit(MessageActions.PAGE_TRANSLATE)
    });
  }

  return items;
});

// UI Helpers
const isTTSActive = computed(() => pendingSelection.value.hasSelection || tts.isPlaying.value);

const verticalPos = ref(-1);
const side = ref('right'); // 'right' or 'left'
const isDragging = ref(false);
let startY = 0;
let startX = 0;

const containerStyle = computed(() => {
  let opacityValue = 1;
  if (isFaded.value && !isHovered.value && !isMenuOpen.value) {
    opacityValue = 0.2; 
  }

  const isRight = side.value === 'right';
  const baseStyle = {
    'position': 'fixed !important',
    'z-index': '2147483647 !important',
    'transition': 'opacity 0.8s ease, transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), left 0.5s cubic-bezier(0.4, 0, 0.2, 1), right 0.5s cubic-bezier(0.4, 0, 0.2, 1) !important',
    'opacity': `${opacityValue} !important`,
  };

  if (isRight) {
    baseStyle.right = '-25px !important';
    baseStyle.left = 'auto !important';
  } else {
    baseStyle.left = '-25px !important';
    baseStyle.right = 'auto !important';
  }

  if (verticalPos.value === -1) {
    return { ...baseStyle, 'bottom': '150px !important', 'top': 'auto !important' };
  }
  return { ...baseStyle, 'top': `${verticalPos.value}px !important`, 'bottom': 'auto !important' };
});

const getBadgeTransform = (isHoveredOrOpen, isIndividualHovered) => {
  const isRight = side.value === 'right';
  const translateAmount = isRight ? -18 : 18;
  const scale = isIndividualHovered ? 1.15 : 1;
  return `translateX(${isHoveredOrOpen ? translateAmount : 0}px) scale(${scale})`;
};

const toggleMenu = () => {
  if (isDragging.value) return;
  
  /**
   * IMPORTANT: FAB Behavior Logic
   * 1. If mode is 'onFabClick' AND text is selected: Translate immediately.
   * 2. In ALL other cases (onClick, immediate, or no selection): JUST open the menu.
   * This ensures the TTS button is available without forcing a translation.
   */
  const isOnFabClickMode = pendingSelection.value.hasSelection && pendingSelection.value.mode === 'onFabClick';
  
  if (isOnFabClickMode) {
    logger.info('FAB executing direct translation (onFabClick mode)');
    triggerTranslation();
    isMenuOpen.value = false;
  } else {
    logger.debug('FAB opening menu (Standard mode)');
    isMenuOpen.value = !isMenuOpen.value;
  }
};

const triggerTranslation = () => {
  if (!pendingSelection.value.hasSelection) return;
  
  logger.info('Triggering pending translation from FAB');
  WindowsManagerEvents.desktopSelectionTrigger({
    text: pendingSelection.value.text,
    position: pendingSelection.value.position
  });
  
  // State is reset immediately for better responsiveness.
  // If you need the 'Translate Selection' menu item to stay visible during 
  // animation, add a small setTimeout here.
  // OR comment the below code to keep the Item visible
  pendingSelection.value = {
    hasSelection: false,
    text: '',
    position: null,
    mode: 'onClick'
  };
};

const handleMenuItemClick = async (item) => {
  if (item.closeMenu) {
    isMenuOpen.value = false;
  }
  if (typeof item.action === 'function') {
    await item.action();
  }
};

const handleOpenSettings = async () => {
  try {
    await sendMessage({ action: MessageActions.OPEN_OPTIONS_PAGE });
    isMenuOpen.value = false;
  } catch (err) {
    logger.error('Failed to open settings from FAB:', err);
  }
};

const handleRevert = async () => {
  logger.info('Triggering Revert from Desktop FAB badge');
  try {
    mobileStore.setHasElementTranslations(false);
    await sendMessage({ action: MessageActions.REVERT_SELECT_ELEMENT_MODE });
  } catch (err) {
    logger.error('Failed to revert translations from FAB:', err);
  }
};

const handleTTS = async () => {
  if (tts.isPlaying.value) {
    logger.info('Stopping TTS from Desktop FAB');
    await tts.stop();
  } else if (pendingSelection.value.hasSelection) {
    logger.info('Starting TTS from Desktop FAB for selected text');
    await tts.speak(pendingSelection.value.text);
  }
};

const startDrag = (e) => {
  if (e.button !== 0) return;
  if (verticalPos.value === -1) {
    const rect = fabContainerRef.value.getBoundingClientRect();
    verticalPos.value = rect.top;
  }
  isDragging.value = false;
  startY = e.clientY - verticalPos.value;
  startX = e.clientX;
  
  // Track temporary drag listeners through resource tracker
  tracker.addEventListener(window, 'mousemove', onDrag);
  tracker.addEventListener(window, 'mouseup', stopDrag);
};

const onDrag = (e) => {
  if (!isDragging.value) {
    const dy = e.clientY - startY - verticalPos.value;
    const dx = e.clientX - startX;
    if (Math.abs(dy) > 5 || Math.abs(dx) > 10) {
      isDragging.value = true;
      isMenuOpen.value = false;
    }
  }
  if (isDragging.value) {
    e.preventDefault();
    
    // Vertical movement
    let newY = e.clientY - startY;
    const maxY = window.innerHeight - 60;
    newY = Math.max(10, Math.min(newY, maxY));
    verticalPos.value = newY;

    // Horizontal detection for side switching
    const screenWidth = window.innerWidth;
    const currentSide = e.clientX > screenWidth / 2 ? 'right' : 'left';
    if (currentSide !== side.value) {
      side.value = currentSide;
      logger.debug('FAB side switched:', side.value);
    }
  }
};

const stopDrag = () => {
  // Use tracker to remove the specific listeners added during startDrag
  tracker.removeEventListener(window, 'mousemove', onDrag);
  tracker.removeEventListener(window, 'mouseup', stopDrag);
  
  setTimeout(async () => { 
    isDragging.value = false; 
    // Save position and side after drag ends
    try {
      const position = {
        side: side.value,
        y: verticalPos.value
      };
      
      await storageManager.set({ DESKTOP_FAB_POSITION: position });
      logger.debug('Saved FAB position:', position);
    } catch (err) {
      logger.info('Failed to save FAB state:', err);
    }
  }, 100);
};

onMounted(async () => {
  // Load saved state
  try {
    const position = await getDesktopFabPositionAsync();
    if (position) {
      if (position.y !== undefined && position.y !== -1) {
        verticalPos.value = position.y;
      }
      if (position.side) {
        side.value = position.side;
      }
    }
  } catch (err) {
    logger.info('Failed to load FAB state:', err);
  }

  startFadeTimer();

  const handleClickOutside = (e) => {
    if (!isMenuOpen.value) return;
    const path = e.composedPath ? e.composedPath() : [];
    if (!path.includes(fabContainerRef.value)) {
      isMenuOpen.value = false;
    }
  };

  tracker.addEventListener(window, 'click', handleClickOutside);

  // Listen for selection pending from WindowsManager
  tracker.addEventListener(pageEventBus, WINDOWS_MANAGER_EVENTS.DESKTOP_SELECTION_PENDING, (detail) => {
    logger.debug('Received desktop selection pending event', { mode: detail.mode });
    startFadeTimer(); // Trigger unfade and then auto-fade
    pendingSelection.value = {
      hasSelection: true,
      text: detail.text,
      position: detail.position,
      mode: detail.mode || 'onClick'
    };
  });

  // Listen for clear selection
  tracker.addEventListener(pageEventBus, WINDOWS_MANAGER_EVENTS.DESKTOP_SELECTION_CLEAR, () => {
    logger.debug('Received desktop selection clear event');
    pendingSelection.value = {
      hasSelection: false,
      text: '',
      position: null,
      mode: 'onClick'
    };
  });
});

// onBeforeUnmount is handled by tracker
</script>

<style scoped>
.desktop-fab-container {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  pointer-events: none;
}

.desktop-fab-button {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background-color: #4A90E2;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.2);
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer !important;
  pointer-events: auto;
  user-select: none;
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.2s ease, box-shadow 0.3s ease;
}

.desktop-fab-button:hover {
  background-color: #5097E8;
  box-shadow: -6px 0 25px rgba(0, 0, 0, 0.25);
}

.desktop-fab-button.is-open {
  background-color: #357ABD;
}

.fab-menu-item:hover { 
  background-color: #f9fafb !important; 
}

/* Dark mode overrides */
.is-dark .fab-menu-item:hover {
  background-color: #3d3d3d !important;
}

/* Base icon specificity */
.fab-menu-icon {
  transition: filter 0.2s ease !important;
}

/* Transitions */
.fade-scale-enter-active {
  transition: opacity 0.4s ease, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
}

.fade-scale-leave-active {
  transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.4, 0, 1, 1) !important;
}

.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0 !important;
  transform: scale(0.6) translateY(15px) !important;
}

.fab-menu-enter-active {
  transition: opacity 0.35s ease, transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  transform-origin: bottom right;
}

.fab-menu-leave-active {
  transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.4, 0, 1, 1);
  transform-origin: bottom right;
}

.fab-menu-enter-from,
.fab-menu-leave-to {
  opacity: 0;
  transform: scale(0.85) translateX(20px);
}

@keyframes fab-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>