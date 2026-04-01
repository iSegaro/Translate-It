<template>
  <div
    v-show="!isFullscreen"
    ref="fabContainerRef"
    class="desktop-fab-container notranslate"
    :class="[
      settingsStore.isDarkTheme ? 'theme-dark' : 'theme-light',
      side === 'right' ? 'is-right' : 'is-left'
    ]"
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
        :style="{ 'transform': getBadgeTransform(isHovered || isMenuOpen, isRevertHovered) }"
        @click.stop="handleRevert"
        @mouseenter="isRevertHovered = true"
        @mouseleave="isRevertHovered = false"
      >
        <img :src="IconRevert" :alt="t('desktop_fab_revert_tooltip')">
      </div>
    </Transition>

    <!-- Menu -->
    <Transition name="fab-menu" :duration="{ enter: ANIMATION_CONFIG.MENU_ENTER }">
      <div v-if="isMenuOpen" class="desktop-fab-menu">
        <template v-for="(item, index) in menuItems" :key="item.id">
          <!-- Divider -->
          <div v-if="index > 0" class="fab-menu-divider"></div>

          <div 
            class="fab-menu-item"
            :class="{ 
              'is-disabled': item.disabled,
              'is-hovered': hoveredItemIndex === index
            }"
            @click.stop="item.disabled ? null : handleMenuItemClick(item)"
            @mouseenter="hoveredItemIndex = index"
            @mouseleave="hoveredItemIndex = -1"
          >
            <div 
              class="menu-icon-wrapper"
              :style="{ 
                marginRight: side === 'right' ? '10px !important' : '0 !important', 
                marginLeft: side === 'left' ? '10px !important' : '0 !important', 
                order: side === 'left' ? 2 : 0
              }" 
            >
              <!-- Circle Progress for Page Translation -->
              <svg v-if="item.showProgress" class="fab-circle-progress" viewBox="0 0 32 32">
                <circle class="progress-bg" cx="16" cy="16" r="14" fill="none" stroke-width="3" />
                <circle 
                  class="progress-fill" 
                  cx="16" 
                  cy="16" 
                  r="14" 
                  fill="none" 
                  stroke-width="3" 
                  stroke-dasharray="88" 
                  :stroke-dashoffset="88 - (88 * item.percent) / 100" 
                />
              </svg>

              <img 
                v-if="item.icon" 
                :src="item.icon" 
                :alt="item.label" 
                class="fab-menu-icon"
                :class="{ 'is-colored': item.id === 'translate_page' || item.id === 'translate_selection' }"
              >
            </div>
            <span 
              class="fab-menu-item-text"
              :style="{ 'text-align': side === 'right' ? 'left' : 'right' }"
            >
              {{ item.label }}
            </span>
          </div>
        </template>
      </div>
    </Transition>

    <!-- Main Button -->
    <div
      class="desktop-fab-button"
      :class="{ 
        'is-open': isMenuOpen, 
        'is-dragging': isDragging,
        'has-status': pageTranslationStatus.isActive
      }"
      :title="t('desktop_fab_tooltip')"
      :style="mainButtonStyle"
      @mousedown="startDrag"
      @click.stop="toggleMenu"
    >
      <img :src="IconExtension" :alt="t('desktop_fab_alt')">

      <!-- Page Translation Status Badge (Bottom) -->
      <Transition name="fade-scale" :duration="{ enter: ANIMATION_CONFIG.MENU_ENTER }">
        <PageTranslationStatus 
          v-if="pageTranslationStatus.isActive" 
          mode="desktop-fab" 
        />
      </Transition>

      <!-- Pending Selection Badge (Top) -->
      <Transition name="fade-scale" :duration="{ enter: ANIMATION_CONFIG.MENU_ENTER }">
        <div 
          v-if="pendingSelection.hasSelection && (pendingSelection.mode === SelectionTranslationMode.ON_FAB_CLICK || !isTextSelectionEnabled)"
          class="fab-translate-badge"
          @click.stop="triggerTranslation"
        >
          <div class="fab-badge-pulse-glow"></div>
          <div style="width: 4px !important; height: 4px !important; background-color: white !important; border-radius: 50% !important; box-shadow: 0 0 2px rgba(255, 255, 255, 0.8) !important; z-index: 1;"></div>
        </div>
      </Transition>
    </div>

    <!-- Settings Button -->
    <Transition name="fade-scale" :duration="{ enter: ANIMATION_CONFIG.MENU_ENTER }">
      <div 
        v-if="isMenuOpen" 
        class="fab-settings-badge"
        :title="t('desktop_fab_settings_tooltip')"
        :style="{ 
          'bottom': (isTTSActive && (isHovered || isMenuOpen) ? '-84px' : '-42px') + ' !important',
          'transform': getBadgeTransform(isHovered || isMenuOpen, isSettingsHovered)
        }"
        @click.stop="handleOpenSettings"
        @mouseenter="isSettingsHovered = true"
        @mouseleave="isSettingsHovered = false"
      >
        <img :src="IconSettings" :alt="t('desktop_fab_settings_tooltip')">
      </div>
    </Transition>

    <!-- TTS Button -->
    <Transition name="fade-scale" :duration="{ enter: ANIMATION_CONFIG.MENU_ENTER }">
      <div 
        v-if="isTTSActive && (isHovered || isMenuOpen)" 
        class="fab-tts-badge"
        :class="{ 'is-playing': isThisTTSActive && tts.isPlaying.value }"
        :title="(isThisTTSActive && tts.isPlaying.value) ? t('desktop_fab_tts_stop_tooltip') : t('desktop_fab_tts_play_tooltip')"
        :style="{ 
          'bottom': '-42px !important', 
          'transform': getBadgeTransform(isHovered || isMenuOpen, isTTSHovered),
          'background-color': (isThisTTSActive && tts.isPlaying.value) ? '#fa5252 !important' : ''
        }"
        @click.stop="handleTTS"
        @mouseenter="isTTSHovered = true"
        @mouseleave="isTTSHovered = false"
      >
        <div v-if="isThisTTSActive && tts.isLoading.value" class="fab-tts-loader"></div>
        <img
          v-else
          :src="IconTTS"
          :alt="t('desktop_fab_tts_tooltip')"
          :style="{ filter: (isThisTTSActive && tts.isPlaying.value) ? 'brightness(0) invert(1) !important' : '' }"
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
import { pageEventBus } from '@/core/PageEventBus.js';
import { useTTSSmart } from '@/features/tts/composables/useTTSSmart.js';
import useFabSelection from '@/apps/content/composables/useFabSelection.js';
import PageTranslationStatus from '@/components/shared/PageTranslationStatus.vue';

import IconExtension from '@/icons/extension/extension_icon_64.svg';
import IconSelectElement from '@/icons/ui/select.png';
import IconTranslatePage from '@/icons/ui/whole-page.png';
import IconRevert from '@/icons/ui/revert.png';
import IconRestore from '@/icons/ui/restore.png';
import IconHourglass from '@/icons/ui/hourglass.png';
import IconSettings from '@/icons/ui/settings.png';
import IconTranslateSelection from '@/icons/ui/translate.png';
import IconTTS from '@/icons/ui/speaker.png';

const logger = getScopedLogger(LOG_COMPONENTS.DESKTOP_FAB, 'Menu');
const mobileStore = useMobileStore();
const settingsStore = useSettingsStore();
const { t } = useUnifiedI18n();
const tracker = useResourceTracker('desktop-fab-menu');
const tts = useTTSSmart();

const ANIMATION_CONFIG = {
  MOVE_IN: '0.4s',
  MOVE_OUT: '1.0s',
  FADE_IN: '0.2s',
  FADE_OUT: '1.0s',
  QUICK_FADE: '0.3s',
  MENU_ENTER: 400,
  SOFT_EASING: 'cubic-bezier(0.22, 1, 0.36, 1)',
  STANDARD_EASING: 'ease',
  IDLE_TIMEOUT: 500,
  LEAVE_DELAY: 400,
  OPACITY_DIMMED: 0.2,
  OPACITY_FULL: 1
};

const isMenuOpen = ref(false);
const isFaded = ref(true);
const isHovered = ref(false);
const isRevertHovered = ref(false);
const isSettingsHovered = ref(false);
const isTTSHovered = ref(false);
const hoveredItemIndex = ref(-1);

// Track the specific TTS request started by this component instance
const localTTSId = ref(null);
const isLocalLoading = ref(false);

// Check if this specific instance is currently responsible for the active TTS
const isThisTTSActive = computed(() => {
  return isLocalLoading.value || (!!(localTTSId.value && tts.currentTTSId.value === localTTSId.value));
});

const isFullscreen = computed(() => mobileStore.isFullscreen);
const isTextSelectionEnabled = computed(() => settingsStore.settings?.TRANSLATE_ON_TEXT_SELECTION !== false);

const fabContainerRef = ref(null);
let hoverTimerId = null;
let fadeTimerId = null;

// Initialize FAB selection logic
const { pendingSelection, triggerTranslation } = useFabSelection({
  onSelectionPending: (detail) => {
    if (detail.mode === SelectionTranslationMode.ON_FAB_CLICK || !isTextSelectionEnabled.value) {
      startFadeTimer();
    }
  }
});

const startFadeTimer = (forceVisible = true) => {
  if (fadeTimerId) tracker.clearTimer(fadeTimerId);
  if (forceVisible) isFaded.value = false;
  fadeTimerId = tracker.trackTimeout(() => {
    isFaded.value = true;
    fadeTimerId = null;
  }, ANIMATION_CONFIG.IDLE_TIMEOUT);
};

const handleMouseEnter = () => {
  if (hoverTimerId) { tracker.clearTimer(hoverTimerId); hoverTimerId = null; }
  if (fadeTimerId) { tracker.clearTimer(fadeTimerId); fadeTimerId = null; }
  isHovered.value = true;
  isFaded.value = false;
};

const handleMouseLeave = () => {
  hoverTimerId = tracker.trackTimeout(() => {
    isHovered.value = false;
    isFaded.value = true;
    hoverTimerId = null;
  }, ANIMATION_CONFIG.LEAVE_DELAY);
};

const menuItems = computed(() => {
  const items = [];
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
  });

  const status = pageTranslationStatus.value;

  if (status.isTranslating || status.isAuto) {
    items.push({
      id: 'page_translating',
      label: status.isTranslating ? t('desktop_fab_translating_label') : t('desktop_fab_stop_auto_translating_label'),
      icon: IconHourglass,
      showProgress: true,
      percent: status.percent,
      closeMenu: false,
      action: () => pageEventBus.emit(MessageActions.PAGE_TRANSLATE_STOP_AUTO)
    });
  } else if (status.isCompleted) {
    items.push({
      id: 'restore_page',
      label: t('desktop_fab_restore_original_label'),
      icon: IconRestore,
      closeMenu: true,
      action: () => pageEventBus.emit(MessageActions.PAGE_RESTORE)
    });
  } else {
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

const isTTSActive = computed(() => pendingSelection.value.hasSelection || (isThisTTSActive.value && tts.isPlaying.value));

// Page Translation Status & Progress Logic
const pageTranslationStatus = computed(() => {
  const data = mobileStore.pageTranslationData;
  const isTranslating = data.status === TRANSLATION_STATUS.TRANSLATING;
  const isAuto = data.isAutoTranslating;
  
  // A page is considered "Completed" (for UI purposes) if it's fully translated, 
  // marked as completed, OR has some partial translations that can be restored.
  const isCompleted = !isTranslating && !isAuto && (
    data.isTranslated || 
    data.status === TRANSLATION_STATUS.COMPLETED || 
    (data.totalCount > 0 && data.translatedCount >= data.totalCount)
  );
  
  const isError = data.status === TRANSLATION_STATUS.ERROR;
  
  const isActive = isTranslating || isAuto || isCompleted || isError;
  const percent = data.totalCount > 0 ? Math.round((data.translatedCount / data.totalCount) * 100) : 0;
  
  return {
    isActive,
    isTranslating,
    isAuto,
    isCompleted,
    isError,
    percent
  };
});

const verticalPos = ref(-1);
const userPreferredY = ref(null);
const side = ref('right');
const isDragging = ref(false);
let startY = 0;
let startX = 0;

const checkBounds = () => {
  if (typeof window === 'undefined' || userPreferredY.value === null) return;
  const maxY = window.innerHeight - 60;
  verticalPos.value = Math.max(10, Math.min(userPreferredY.value, maxY));
};

const containerStyle = computed(() => {
  let opacityValue = ANIMATION_CONFIG.OPACITY_FULL;
  if (isFaded.value && !isHovered.value && !isMenuOpen.value && !isDragging.value) {
    opacityValue = ANIMATION_CONFIG.OPACITY_DIMMED; 
  }

  const isActive = isHovered.value || isMenuOpen.value || isDragging.value;
  const moveDuration = isActive ? ANIMATION_CONFIG.MOVE_IN : ANIMATION_CONFIG.MOVE_OUT;
  const easing = ANIMATION_CONFIG.SOFT_EASING;
  
  const transitions = [
    `transform ${moveDuration} ${easing}`,
    `left ${moveDuration} ${easing}`,
    `right ${moveDuration} ${easing}`
  ];

  const opacityDuration = isMenuOpen.value ? ANIMATION_CONFIG.QUICK_FADE : (opacityValue === ANIMATION_CONFIG.OPACITY_FULL ? ANIMATION_CONFIG.FADE_IN : ANIMATION_CONFIG.FADE_OUT);
  transitions.push(`opacity ${opacityDuration} ${easing}`);

  const style = {
    'transition': `${transitions.join(', ')} !important`,
    'opacity': `${opacityValue} !important`
  };

  if (verticalPos.value === -1) {
    style.bottom = '150px !important';
    style.top = 'auto !important';
  } else {
    style.top = `${verticalPos.value}px !important`;
    style.bottom = 'auto !important';
  }

  return style;
});

const mainButtonStyle = computed(() => {
  const isRight = side.value === 'right';
  const isActive = isHovered.value || isMenuOpen.value || isDragging.value;
  const moveDuration = isActive ? ANIMATION_CONFIG.MOVE_IN : ANIMATION_CONFIG.MOVE_OUT;
  
  return {
    'transform': (isActive ? (isRight ? 'translateX(-18px)' : 'translateX(18px)') : 'translateX(0)'),
    'transition': `transform ${moveDuration} ${ANIMATION_CONFIG.SOFT_EASING}, background-color 0.2s ease, box-shadow 0.3s ease !important`
  };
});

const getBadgeTransform = (isHoveredOrOpen, isIndividualHovered) => {
  const isRight = side.value === 'right';
  const translateAmount = isRight ? -18 : 18;
  const scale = isIndividualHovered ? 1.15 : 1;
  return `translateX(${isHoveredOrOpen ? translateAmount : 0}px) scale(${scale})`;
};

const toggleMenu = () => {
  if (isDragging.value) return;
  const isOnFabClickMode = pendingSelection.value.hasSelection && pendingSelection.value.mode === SelectionTranslationMode.ON_FAB_CLICK;
  
  if (isOnFabClickMode) {
    logger.info('Translation triggered via Desktop FAB click');
    triggerTranslation();
    isMenuOpen.value = false;
  } else {
    isMenuOpen.value = !isMenuOpen.value;
    logger.debug(isMenuOpen.value ? 'Desktop FAB menu opened' : 'Desktop FAB menu closed');
  }
};

const handleMenuItemClick = async (item) => {
  logger.info('Desktop FAB menu item clicked', { id: item.id });
  if (item.closeMenu) isMenuOpen.value = false;
  if (typeof item.action === 'function') await item.action();
};

const handleOpenSettings = async () => {
  try {
    logger.info('Opening settings from Desktop FAB');
    await sendMessage({ action: MessageActions.OPEN_OPTIONS_PAGE });
    isMenuOpen.value = false;
  } catch (err) {
    logger.error('Failed to open settings from FAB:', err);
  }
};

const handleRevert = async () => {
  try {
    logger.info('Reverting translations from Desktop FAB');
    mobileStore.setHasElementTranslations(false);
    await sendMessage({ action: MessageActions.REVERT_SELECT_ELEMENT_MODE });
  } catch (err) {
    logger.error('Failed to revert translations from FAB:', err);
  }
};

const handleTTS = async () => {
  if (isThisTTSActive.value && (tts.isPlaying.value || tts.isLoading.value)) {
    logger.info('Stopping TTS from Desktop FAB');
    await tts.stop();
  } else if (pendingSelection.value.hasSelection) {
    logger.info('Starting TTS from Desktop FAB');
    isLocalLoading.value = true;
    try {
      const result = await tts.speak(pendingSelection.value.text);
      if (result) {
        localTTSId.value = tts.currentTTSId.value;
      }
    } finally {
      isLocalLoading.value = false;
    }
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
  tracker.addEventListener(window, 'mousemove', onDrag);
  tracker.addEventListener(window, 'mouseup', stopDrag);
};

const onDrag = (e) => {
  if (!isDragging.value) {
    const dy = e.clientY - startY - verticalPos.value;
    const dx = e.clientX - startX;
    if (Math.abs(dy) > 5 || Math.abs(dx) > 10) {
      isDragging.value = true;
      isFaded.value = false; // Stay visible while dragging
      // Do not force close the menu here
    }
  }
  if (isDragging.value) {
    e.preventDefault();
    let newY = e.clientY - startY;
    const maxY = window.innerHeight - 60;
    newY = Math.max(10, Math.min(newY, maxY));
    verticalPos.value = newY;

    const screenWidth = window.innerWidth;
    const currentSide = e.clientX > screenWidth / 2 ? 'right' : 'left';
    if (currentSide !== side.value) {
      side.value = currentSide;
    }
  }
};

const stopDrag = () => {
  tracker.removeEventListener(window, 'mousemove', onDrag);
  tracker.removeEventListener(window, 'mouseup', stopDrag);
  
  if (isDragging.value) {
    logger.debug('Desktop FAB drag ended', { side: side.value, y: verticalPos.value });
  }

  setTimeout(async () => { 
    isDragging.value = false; 
    try {
      userPreferredY.value = verticalPos.value;
      const position = { side: side.value, y: verticalPos.value };
      await storageManager.set({ DESKTOP_FAB_POSITION: position });
    } catch (err) {
      logger.info('Failed to save FAB state:', err);
    }
  }, 100);
};

onMounted(async () => {
  try {
    const position = await getDesktopFabPositionAsync();
    if (position) {
      if (position.y !== undefined && position.y !== -1) {
        userPreferredY.value = position.y;
        verticalPos.value = position.y;
      }
      if (position.side) side.value = position.side;
    }
    checkBounds();
  } catch (err) {
    logger.info('Failed to load FAB state:', err);
  }

  tracker.addEventListener(window, 'resize', checkBounds);
  startFadeTimer(false);

  const handleClickOutside = (e) => {
    if (!isMenuOpen.value) return;
    const path = e.composedPath ? e.composedPath() : [];
    if (!path.includes(fabContainerRef.value)) isMenuOpen.value = false;
  };

  tracker.addEventListener(window, 'click', handleClickOutside);
});
</script>
