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
    <Transition name="fade-scale" :duration="{ enter: ANIMATION_CONFIG.MENU_ENTER }">
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
    <Transition name="fab-menu" :duration="{ enter: ANIMATION_CONFIG.MENU_ENTER }">
      <div 
        v-if="isMenuOpen" 
        class="desktop-fab-menu"
        :style="[
          menuStyle,
          side === 'right' ? { 'right': '80px !important' } : { 'left': '80px !important' },
          { 
            'position': 'absolute !important', 
            'bottom': '0px !important', 
            'border-radius': '14px !important', 
            'padding': '5px !important', 
            'min-width': '190px !important', 
            'width': 'max-content !important', 
            'display': 'flex !important', 
            'flex-direction': 'column !important', 
            'z-index': '2147483647 !important', 
            'overflow': 'hidden !important', 
            'margin': '0 !important',
            'pointer-events': 'auto !important',
            'transform-origin': side === 'right' ? 'bottom right' : 'bottom left'
          }
        ]"
      >
        <template v-for="(item, index) in menuItems" :key="item.id">
          <!-- Divider -->
          <div 
            v-if="index > 0" 
            style="height: 1px !important; width: calc(100% - 10px) !important; margin: 1px auto !important; opacity: 0.06 !important;"
            :style="{ backgroundColor: settingsStore.isDarkTheme ? '#ffffff' : '#000000' }"
          ></div>

          <div 
            class="fab-menu-item"
            :class="{ 'is-disabled': item.disabled }"
            style="display: flex !important; align-items: center !important; padding: 7px 9px !important; cursor: pointer !important; width: 100% !important; box-sizing: border-box !important; transition: all 0.2s ease !important; border-radius: 9px !important; pointer-events: auto !important;"
            :style="[
              item.disabled ? { 'opacity': '0.35 !important', 'cursor': 'default !important', 'pointer-events': 'none !important' } : {},
              hoveredItemIndex === index ? { 
                'background-color': settingsStore.isDarkTheme ? 'rgba(255, 255, 255, 0.08) !important' : 'rgba(74, 144, 226, 0.1) !important',
                'transform': 'scale(1.015) !important'
              } : {}
            ]"
            @click.stop="item.disabled ? null : handleMenuItemClick(item)"
            @mouseenter="hoveredItemIndex = index"
            @mouseleave="hoveredItemIndex = -1"
          >
            <div 
              :style="{ 
                marginRight: side === 'right' ? '10px !important' : '0 !important', 
                marginLeft: side === 'left' ? '10px !important' : '0 !important', 
                order: side === 'left' ? 2 : 0,
                backgroundColor: settingsStore.isDarkTheme ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                transform: hoveredItemIndex === index ? 'scale(1.05)' : 'scale(1)'
              }" 
              style="display: flex !important; align-items: center !important; justify-content: center !important; width: 28px !important; height: 28px !important; flex-shrink: 0 !important; border-radius: 7px !important; transition: all 0.2s ease !important;"
              class="menu-icon-wrapper"
            >
              <img 
                v-if="item.icon" 
                :src="item.icon" 
                :alt="item.label" 
                class="fab-menu-icon"
                :style="getMenuIconStyle(item.id)"
              >
            </div>
            <span :style="[menuItemTextStyle, { 'text-align': side === 'right' ? 'left' : 'right' }]" style="font-size: 13px !important; font-weight: 600 !important; white-space: nowrap !important; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important; line-height: 1.2 !important; flex: 1 !important;">{{ item.label }}</span>
          </div>
        </template>
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
          'transition': `transform ${isHovered || isMenuOpen ? ANIMATION_CONFIG.MOVE_IN : ANIMATION_CONFIG.MOVE_OUT} ${ANIMATION_CONFIG.SOFT_EASING}, background-color 0.2s ease, box-shadow 0.3s ease !important`,
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
      <!-- Pending Selection Badge (ONLY in onFabClick mode OR when WindowsManager is disabled) -->
      <Transition name="fade-scale" :duration="{ enter: ANIMATION_CONFIG.MENU_ENTER }">
        <div 
          v-if="pendingSelection.hasSelection && (pendingSelection.mode === SelectionTranslationMode.ON_FAB_CLICK || !isTextSelectionEnabled)"
          class="fab-translate-badge"
          :style="[
            translateBadgeStyle,
            side === 'right' ? { 'left': '-6px !important' } : { 'right': '-6px !important' }
          ]"
          @click.stop="triggerTranslation"
        >
          <!-- Pulsing Background (Moved to inner div to avoid Transition conflict) -->
          <div class="fab-badge-pulse-glow"></div>
          <div style="width: 4px !important; height: 4px !important; background-color: white !important; border-radius: 50% !important; box-shadow: 0 0 2px rgba(255, 255, 255, 0.8) !important; z-index: 1;"></div>
        </div>
      </Transition>
    </div>

    <!-- Settings Button (Dynamic position based on TTS visibility) -->
    <Transition name="fade-scale" :duration="{ enter: ANIMATION_CONFIG.MENU_ENTER }">
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
    <Transition name="fade-scale" :duration="{ enter: ANIMATION_CONFIG.MENU_ENTER }">
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
          :style="ttsIconStyle"
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
import { getDesktopFabPositionAsync, SelectionTranslationMode } from '@/shared/config/config.js';
import { pageEventBus, WINDOWS_MANAGER_EVENTS, WindowsManagerEvents } from '@/core/PageEventBus.js';
import { useTTSSmart } from '@/features/tts/composables/useTTSSmart.js';
import useFabSelection from '@/apps/content/composables/useFabSelection.js';

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

// Centralized Animation Configuration for Maintainability
const ANIMATION_CONFIG = {
  MOVE_IN: '0.4s',
  MOVE_OUT: '1.0s',
  FADE_IN: '0.2s',
  FADE_OUT: '1.0s', // Matches MOVE_OUT for simultaneity
  QUICK_FADE: '0.3s', // Used for instant feedback when menu is open
  MENU_ENTER: 400,
  SOFT_EASING: 'cubic-bezier(0.22, 1, 0.36, 1)',
  STANDARD_EASING: 'ease',
  IDLE_TIMEOUT: 500,
  LEAVE_DELAY: 400, // Grace period before starting the exit animation
  OPACITY_DIMMED: 0.2,
  OPACITY_FULL: 1
};

const isMenuOpen = ref(false);
const isFaded = ref(true); // Start faded on page load
const isHovered = ref(false);
const isRevertHovered = ref(false);
const isSettingsHovered = ref(false);
const isTTSHovered = ref(false);
const hoveredItemIndex = ref(-1);
const isFullscreen = computed(() => mobileStore.isFullscreen);
const isTextSelectionEnabled = computed(() => settingsStore.settings?.TRANSLATE_ON_TEXT_SELECTION !== false);

// Theme-aware styles as OBJECTS
const menuStyle = computed(() => {
  if (settingsStore.isDarkTheme) {
    return {
      'background-color': 'rgba(40, 40, 40, 0.95) !important',
      'backdrop-filter': 'blur(16px) saturate(180%) !important',
      'border': '1px solid rgba(255, 255, 255, 0.12) !important',
      'box-shadow': '0 20px 40px -8px rgba(0, 0, 0, 0.6), 0 12px 20px -10px rgba(0, 0, 0, 0.4) !important'
    };
  }
  return {
    'background-color': 'rgba(255, 255, 255, 0.92) !important',
    'backdrop-filter': 'blur(16px) saturate(180%) !important',
    'border': '1px solid rgba(0, 0, 0, 0.08) !important',
    'box-shadow': '0 20px 40px -12px rgba(0, 0, 0, 0.18), 0 12px 20px -8px rgba(0, 0, 0, 0.1) !important'
  };
});

const settingsBadgeStyle = computed(() => {
  if (settingsStore.isDarkTheme) {
    return {
      'background-color': 'rgba(50, 50, 50, 0.9) !important',
      'backdrop-filter': 'blur(12px) !important',
      'border': '1px solid rgba(255, 255, 255, 0.1) !important',
      'box-shadow': '0 8px 24px rgba(0, 0, 0, 0.4) !important'
    };
  }
  return {
    'background-color': 'rgba(255, 255, 255, 0.9) !important',
    'backdrop-filter': 'blur(12px) !important',
    'border': '1px solid rgba(0, 0, 0, 0.06) !important',
    'box-shadow': '0 8px 24px rgba(0, 0, 0, 0.12) !important'
  };
});

const getMenuIconStyle = (itemId) => {
  const isColored = itemId === 'translate_page' || itemId === 'translate_selection';
  const filter = (settingsStore.isDarkTheme && !isColored) 
    ? 'brightness(0) invert(1) !important' 
    : 'none !important';

  return `width: 20px !important; height: 20px !important; object-fit: contain !important; display: block !important; border: none !important; padding: 0 !important; filter: ${filter}; transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) !important;`;
};

const settingsIconStyle = computed(() => {
  const filter = settingsStore.isDarkTheme 
    ? 'brightness(0) invert(1) !important' 
    : 'opacity(0.8) !important';
    
  return `width: 18px !important; height: 18px !important; filter: ${filter}; transition: transform 0.3s ease !important;`;
});

const ttsIconStyle = computed(() => {
  // If playing (blue background) or in Dark Mode, the icon should be white
  const shouldBeWhite = tts.isPlaying.value || settingsStore.isDarkTheme;
  const filter = shouldBeWhite 
    ? 'brightness(0) invert(1) !important' 
    : 'none !important';

  return `width: 18px !important; height: 18px !important; filter: ${filter}; transition: transform 0.3s ease !important;`;
});

const menuItemTextStyle = computed(() => {
  return {
    'color': settingsStore.isDarkTheme ? '#f8fafc !important' : '#1e293b !important',
    'letter-spacing': '-0.01em !important'
  };
});

const translateBadgeStyle = computed(() => {
  return {
    'position': 'absolute !important',
    'top': '-6px !important',
    'width': '20px !important',
    'height': '20px !important',
    'border-radius': '50% !important',
    'display': 'flex !important',
    'justify-content': 'center !important',
    'align-items': 'center !important',
    'z-index': '2147483647 !important',
    'cursor': 'pointer !important',
    'background': 'linear-gradient(135deg, #FF9800, #F44336) !important',
    'border': '1.5px solid #ffffff !important',
    'box-shadow': '0 2px 8px rgba(244, 67, 54, 0.4) !important',
    'transition': 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)'
  };
});

const fabContainerRef = ref(null);
let hoverTimerId = null;
let fadeTimerId = null;

// Initialize FAB selection logic (Decoupled from WindowsManager)
const { pendingSelection, triggerTranslation } = useFabSelection({
  onSelectionPending: (detail) => {
    // Wake up the FAB (unfade) if:
    // 1. We are in onFabClick mode
    // 2. OR if WindowsManager is disabled (FAB is the primary handler)
    if (detail.mode === SelectionTranslationMode.ON_FAB_CLICK || !isTextSelectionEnabled.value) {
      startFadeTimer();
    }
  }
});

const startFadeTimer = (forceVisible = true) => {
  if (fadeTimerId) {
    tracker.clearTimer(fadeTimerId);
  }
  if (forceVisible) {
    isFaded.value = false;
  }
  fadeTimerId = tracker.trackTimeout(() => {
    isFaded.value = true;
    fadeTimerId = null;
  }, ANIMATION_CONFIG.IDLE_TIMEOUT);
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
  // Start a timer before closing/fading to give user a grace period
  hoverTimerId = tracker.trackTimeout(() => {
    isHovered.value = false;
    isFaded.value = true;
    hoverTimerId = null;
  }, ANIMATION_CONFIG.LEAVE_DELAY);
};

const menuItems = computed(() => {
  const items = [];

  // Add Translate Selection ONLY if specifically in onFabClick mode
  if (pendingSelection.value.hasSelection && pendingSelection.value.mode === SelectionTranslationMode.ON_FAB_CLICK) {
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
const userPreferredY = ref(null); // The position user actually set
const side = ref('right'); // 'right' or 'left'
const isDragging = ref(false);
let startY = 0;
let startX = 0;

const checkBounds = () => {
  if (typeof window === 'undefined' || userPreferredY.value === null) return;
  
  // Constrain FAB within visible area (10px from top, 60px from bottom)
  const maxY = window.innerHeight - 60;
  verticalPos.value = Math.max(10, Math.min(userPreferredY.value, maxY));
  
  logger.debug('Desktop FAB bounds checked', { current: verticalPos.value, preferred: userPreferredY.value });
};

const containerStyle = computed(() => {
  let opacityValue = ANIMATION_CONFIG.OPACITY_FULL;
  if (isFaded.value && !isHovered.value && !isMenuOpen.value) {
    opacityValue = ANIMATION_CONFIG.OPACITY_DIMMED; 
  }

  const isRight = side.value === 'right';
  const isActive = isHovered.value || isMenuOpen.value;
  const moveDuration = isActive ? ANIMATION_CONFIG.MOVE_IN : ANIMATION_CONFIG.MOVE_OUT;
  const easing = ANIMATION_CONFIG.SOFT_EASING;
  
  // Construct transition parts without !important
  const transitions = [
    `transform ${moveDuration} ${easing}`,
    `left ${moveDuration} ${easing}`,
    `right ${moveDuration} ${easing}`
  ];

  // Use fast transition for Fade In (opacity 1) and slower for Fade Out (opacity 0.2)
  if (!isMenuOpen.value) {
    const opacityDuration = opacityValue === ANIMATION_CONFIG.OPACITY_FULL 
      ? ANIMATION_CONFIG.FADE_IN 
      : ANIMATION_CONFIG.FADE_OUT;
    transitions.push(`opacity ${opacityDuration} ${easing}`);
  } else {
    transitions.push(`opacity ${ANIMATION_CONFIG.QUICK_FADE} ${ANIMATION_CONFIG.STANDARD_EASING}`);
  }

  const baseStyle = {
    'position': 'fixed !important',
    'z-index': '2147483647 !important',
    'transition': `${transitions.join(', ')} !important`,
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
   * 1. If mode is SelectionTranslationMode.ON_FAB_CLICK AND text is selected: Translate immediately.
   * 2. In ALL other cases (onClick, immediate, or no selection): JUST open the menu.
   * This ensures the TTS button is available without forcing a translation.
   */
  const isOnFabClickMode = pendingSelection.value.hasSelection && pendingSelection.value.mode === SelectionTranslationMode.ON_FAB_CLICK;
  
  if (isOnFabClickMode) {
    logger.info('FAB executing direct translation (onFabClick mode)');
    triggerTranslation();
    isMenuOpen.value = false;
  } else {
    logger.debug('FAB opening menu (Standard mode)');
    isMenuOpen.value = !isMenuOpen.value;
  }
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
      userPreferredY.value = verticalPos.value;
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
        userPreferredY.value = position.y;
        verticalPos.value = position.y;
      }
      if (position.side) {
        side.value = position.side;
      }
    }
    
    // Initial bounds check
    checkBounds();
  } catch (err) {
    logger.info('Failed to load FAB state:', err);
  }

  // Add resize listener using tracker
  tracker.addEventListener(window, 'resize', checkBounds);

  startFadeTimer(false); // Initialize timer but keep initial faded state

  const handleClickOutside = (e) => {
    if (!isMenuOpen.value) return;
    const path = e.composedPath ? e.composedPath() : [];
    if (!path.includes(fabContainerRef.value)) {
      isMenuOpen.value = false;
    }
  };

  tracker.addEventListener(window, 'click', handleClickOutside);
});

// onBeforeUnmount is handled by tracker
</script>

<style lang="scss" scoped>
.desktop-fab-container {
  display: flex !important;
  flex-direction: column !important;
  align-items: flex-end !important;
  pointer-events: none !important;
  width: fit-content !important;
  height: fit-content !important;
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
  transition: transform 0.7s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.2s ease, box-shadow 0.3s ease;
}

.desktop-fab-button:hover {
  background-color: #5097E8;
  box-shadow: -6px 0 25px rgba(0, 0, 0, 0.25);
}

.desktop-fab-button.is-open {
  background-color: #357ABD;
}

.fab-menu-item:hover { 
  background-color: rgba(74, 144, 226, 0.08) !important; 
  transform: scale(1.015) !important;
}

.fab-menu-item:hover .menu-icon-wrapper {
  background-color: rgba(74, 144, 226, 0.15) !important;
  transform: scale(1.05) !important;
}

.fab-menu-item:hover .fab-menu-icon {
  transform: scale(1.1);
}

.fab-menu-item:active {
  transform: scale(0.98);
}

/* Dark mode overrides */
.is-dark .fab-menu-item:hover {
  background-color: rgba(255, 255, 255, 0.08) !important;
}

/* Transitions */
.fade-scale-enter-active {
  transition: opacity 0.4s ease, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
}

.fade-scale-leave-active {
  transition: none !important;
}

.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0 !important;
  transform: scale(0.6) translateY(15px) !important;
}

.fab-menu-enter-active {
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
}

.fab-menu-leave-active {
  transition: none !important;
}

.fab-menu-enter-from,
.fab-menu-leave-to {
  opacity: 0 !important;
  transform: scale(0.9) translateY(10px) !important;
}

.fab-badge-pulse-glow {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  border-radius: 50% !important;
  background: inherit !important;
  animation: pulse-glow 1.5s infinite ease-in-out !important;
  z-index: 0 !important;
  pointer-events: none !important;
}

@keyframes fab-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes pulse-glow {
  0% { box-shadow: 0 0 0 0 rgba(244, 67, 54, 0.4); transform: scale(1); }
  50% { box-shadow: 0 0 0 8px rgba(244, 67, 54, 0); transform: scale(1.1); }
  100% { box-shadow: 0 0 0 0 rgba(244, 67, 54, 0); transform: scale(1); }
}
</style>