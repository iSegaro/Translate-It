<template>
  <div
    class="desktop-fab-container notranslate"
    translate="no"
    ref="fabContainerRef"
    :style="containerStyle"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <!-- Revert Action (Small Badge Button) -->
    <Transition name="fade-scale">
      <div 
        v-if="mobileStore.hasElementTranslations && (isHovered || isMenuOpen)" 
        class="fab-revert-badge"
        @click.stop="handleRevert"
        :title="t('desktop_fab_revert_tooltip')"
        style="position: absolute !important; bottom: 42px !important; right: 15px !important; width: 32px !important; height: 32px !important; border-radius: 50% !important; background-color: #fa5252 !important; display: flex !important; justify-content: center !important; align-items: center !important; cursor: pointer !important; box-shadow: 0 4px 12px rgba(250, 82, 82, 0.3) !important; z-index: 2147483647 !important; transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease !important; pointer-events: auto !important;"
        @mouseenter="isRevertHovered = true"
        @mouseleave="isRevertHovered = false"
        :style="{ transform: (isHovered || isMenuOpen ? 'translateX(-18px) ' : 'translateX(0) ') + (isRevertHovered ? 'scale(1.15)' : 'scale(1)') }"
      >
        <img :src="IconRevert" :alt="t('desktop_fab_revert_tooltip')" style="width: 16px !important; height: 16px !important; filter: brightness(0) invert(1) !important;" />
      </div>
    </Transition>

    <!-- Menu -->
    <Transition name="fab-menu">
      <div 
        v-if="isMenuOpen" 
        class="desktop-fab-menu"
        style="position: absolute !important; bottom: 0px !important; right: 85px !important; background-color: #ffffff !important; border-radius: 14px !important; box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.15), 0 8px 15px -6px rgba(0, 0, 0, 0.1) !important; padding: 8px 0 !important; min-width: 230px !important; width: max-content !important; border: 1px solid rgba(0, 0, 0, 0.06) !important; display: flex !important; flex-direction: column !important; z-index: 2147483647 !important; overflow: hidden !important; margin: 0 !important;"
      >
        <div 
          v-for="item in menuItems" 
          :key="item.id" 
          class="fab-menu-item"
          :class="{ 'is-disabled': item.disabled }"
          @click.stop="item.disabled ? null : handleMenuItemClick(item)"
          style="display: flex !important; align-items: center !important; padding: 12px 18px !important; cursor: pointer !important; color: #374151 !important; width: 100% !important; box-sizing: border-box !important; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;"
          :style="item.disabled ? 'opacity: 0.5 !important; cursor: default !important; pointer-events: none !important;' : ''"
        >
          <div style="display: flex !important; align-items: center !important; justify-content: center !important; width: 24px !important; height: 24px !important; margin-right: 12px !important; flex-shrink: 0 !important;">
            <img 
              v-if="item.icon" 
              :src="item.icon" 
              :alt="item.label" 
              style="width: 20px !important; height: 20px !important; object-fit: contain !important; display: block !important; border: none !important; padding: 0 !important;"
            />
          </div>
          <span style="font-size: 14px !important; font-weight: 500 !important; white-space: nowrap !important; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important; line-height: 1.4 !important; flex: 1 !important;">{{ item.label }}</span>
        </div>
      </div>
    </Transition>

    <!-- Main Button -->
    <div
      class="desktop-fab-button"
      :class="{ 'is-open': isMenuOpen, 'is-dragging': isDragging }"
      @mousedown="startDrag"
      @click.stop="toggleMenu"
      :title="t('desktop_fab_tooltip')"
      :style="{ transform: isHovered || isMenuOpen ? 'translateX(-18px)' : 'translateX(0)' }"
    >
      <img 
        src="@/icons/extension/extension_icon_64.svg" 
        :alt="t('desktop_fab_alt')" 
        style="width: 32px !important; height: 32px !important; display: block !important; pointer-events: none !important; margin-right: 15px !important; object-fit: contain !important; filter: none !important; opacity: 1 !important; visibility: visible !important;"
      />
    </div>

    <!-- Settings Button (below main button when open) -->
    <Transition name="fade-scale">
      <div 
        v-if="isMenuOpen" 
        class="fab-settings-badge"
        @click.stop="handleOpenSettings"
        :title="t('desktop_fab_settings_tooltip')"
        style="position: absolute !important; bottom: -42px !important; right: 15px !important; width: 32px !important; height: 32px !important; border-radius: 50% !important; background-color: #ffffff !important; display: flex !important; justify-content: center !important; align-items: center !important; cursor: pointer !important; box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important; z-index: 2147483647 !important; transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease !important; pointer-events: auto !important; border: 1px solid rgba(0,0,0,0.05) !important;"
        @mouseenter="isSettingsHovered = true"
        @mouseleave="isSettingsHovered = false"
        :style="{ transform: (isHovered || isMenuOpen ? 'translateX(-18px) ' : 'translateX(0) ') + (isSettingsHovered ? 'scale(1.15)' : 'scale(1)') }"
      >
        <img :src="IconSettings" :alt="t('desktop_fab_settings_tooltip')" style="width: 16px !important; height: 16px !important; filter: opacity(0.7) !important;" />
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { sendMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { useMobileStore } from '@/store/modules/mobile.js';
import { TRANSLATION_STATUS } from '@/shared/config/constants.js';

import IconSelectElement from '@/icons/ui/select.png';
import IconTranslatePage from '@/icons/ui/whole-page.png';
import IconRevert from '@/icons/ui/revert.png';
import IconRestore from '@/icons/ui/restore.svg';
import IconClear from '@/icons/ui/clear.png';
import IconSettings from '@/icons/ui/settings.png';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT_APP, 'DesktopFabMenu');
const pageEventBus = window.pageEventBus;
const mobileStore = useMobileStore();
const { t } = useUnifiedI18n();

const isMenuOpen = ref(false);
const isFaded = ref(false);
const isHovered = ref(false);
const isRevertHovered = ref(false);
const isSettingsHovered = ref(false);
const fabContainerRef = ref(null);
let hoverTimer = null;

const handleMouseEnter = () => {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
  isHovered.value = true;
};

const handleMouseLeave = () => {
  // 1 second delay before closing
  hoverTimer = setTimeout(() => {
    isHovered.value = false;
    hoverTimer = null;
  }, 750);
};

const menuItems = computed(() => {
  const items = [
    {
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
  ];

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
    // If auto-translating, primary action is to STOP it
    items.push({
      id: 'stop_auto',
      label: t('desktop_fab_stop_auto_translating_label'),
      icon: IconClear,
      closeMenu: false,
      action: () => pageEventBus.emit(MessageActions.PAGE_TRANSLATE_STOP_AUTO)
    });
  } else if (pageData.isTranslated || isDone) {
    // If translated but NOT auto-translating, show Restore
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

const verticalPos = ref(-1);
const isDragging = ref(false);
let startY = 0;

const containerStyle = computed(() => {
  let opacityValue = 1;
  if (isFaded.value && !isHovered.value && !isMenuOpen.value) {
    opacityValue = 0.2; 
  }

  const baseStyle = {
    position: 'fixed !important',
    right: '-25px !important',
    zIndex: 2147483647,
    transition: 'opacity 0.8s ease, transform 0.4s cubic-bezier(0.4, 0, 0.2, 1) !important',
    opacity: `${opacityValue} !important`,
    left: 'auto !important'
  };

  if (verticalPos.value === -1) {
    return { ...baseStyle, bottom: '150px !important', top: 'auto !important' };
  }
  return { ...baseStyle, top: `${verticalPos.value}px !important`, bottom: 'auto !important' };
});

const toggleMenu = () => {
  if (isDragging.value) return;
  isMenuOpen.value = !isMenuOpen.value;
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
    // Content scripts usually can't open options directly, so we use our messaging system
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

const startDrag = (e) => {
  if (e.button !== 0) return;
  if (verticalPos.value === -1) {
    const rect = fabContainerRef.value.getBoundingClientRect();
    verticalPos.value = rect.top;
  }
  isDragging.value = false;
  startY = e.clientY - verticalPos.value;
  window.addEventListener('mousemove', onDrag);
  window.addEventListener('mouseup', stopDrag);
};

const onDrag = (e) => {
  if (!isDragging.value) {
    const dy = e.clientY - startY - verticalPos.value;
    if (Math.abs(dy) > 5) {
      isDragging.value = true;
      isMenuOpen.value = false;
    }
  }
  if (isDragging.value) {
    e.preventDefault();
    let newY = e.clientY - startY;
    const maxY = window.innerHeight - 60;
    newY = Math.max(10, Math.min(newY, maxY));
    verticalPos.value = newY;
  }
};

const stopDrag = () => {
  window.removeEventListener('mousemove', onDrag);
  window.removeEventListener('mouseup', stopDrag);
  setTimeout(() => { isDragging.value = false; }, 100);
};

onMounted(() => {
  setTimeout(() => {
    isFaded.value = true;
  }, 2000);

  const handleClickOutside = (e) => {
    if (!isMenuOpen.value) return;
    const path = e.composedPath ? e.composedPath() : [];
    if (!path.includes(fabContainerRef.value)) {
      isMenuOpen.value = false;
    }
  };

  window.addEventListener('click', handleClickOutside);
  onUnmounted(() => {
    window.removeEventListener('click', handleClickOutside);
  });
});

onUnmounted(() => {
  window.removeEventListener('mousemove', onDrag);
  window.removeEventListener('mouseup', stopDrag);
  if (hoverTimer) clearTimeout(hoverTimer);
});
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
  cursor: pointer;
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
  color: #111827 !important;
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
</style>