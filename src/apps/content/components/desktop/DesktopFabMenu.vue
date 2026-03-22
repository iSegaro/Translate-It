<template>
  <div
    class="desktop-fab-container notranslate"
    translate="no"
    ref="fabContainerRef"
    :style="containerStyle"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <!-- Revert Action (Small Badge Button) -->
    <Transition name="fade-scale">
      <div 
        v-if="mobileStore.hasElementTranslations && (isHovered || isMenuOpen)" 
        class="fab-revert-badge"
        @click.stop="handleRevert"
        title="Revert Element Translations"
        style="position: absolute !important; bottom: 55px !important; right: 15px !important; width: 32px !important; height: 32px !important; border-radius: 50% !important; background-color: #fa5252 !important; display: flex !important; justify-content: center !important; align-items: center !important; cursor: pointer !important; box-shadow: 0 2px 8px rgba(0,0,0,0.2) !important; z-index: 2147483647 !important; transition: transform 0.2s ease !important; pointer-events: auto !important;"
        @mouseenter="isRevertHovered = true"
        @mouseleave="isRevertHovered = false"
        :style="{ transform: isRevertHovered ? 'scale(1.15)' : 'scale(1)' }"
      >
        <img :src="IconRevert" alt="Revert" style="width: 16px !important; height: 16px !important; filter: brightness(0) invert(1) !important;" />
      </div>
    </Transition>

    <!-- Menu -->
    <Transition name="fab-menu">
      <div 
        v-if="isMenuOpen" 
        class="desktop-fab-menu"
        style="position: absolute !important; bottom: 0px !important; right: 80px !important; background-color: #ffffff !important; border-radius: 12px !important; box-shadow: 0 8px 30px rgba(0,0,0,0.2) !important; padding: 8px 0 !important; min-width: 200px !important; width: max-content !important; border: 1px solid #ddd !important; display: flex !important; flex-direction: column !important; z-index: 2147483647 !important; overflow: hidden !important; margin: 0 !important;"
      >
        <div 
          v-for="item in menuItems" 
          :key="item.id" 
          class="fab-menu-item"
          :class="{ 'is-disabled': item.disabled }"
          @click.stop="item.disabled ? null : handleMenuItemClick(item)"
          style="display: flex !important; align-items: center !important; padding: 12px 16px !important; cursor: pointer !important; color: #333 !important; width: 100% !important; box-sizing: border-box !important; transition: background 0.2s !important;"
          :style="item.disabled ? 'opacity: 0.6 !important; cursor: default !important; pointer-events: none !important;' : ''"
        >
          <img 
            v-if="item.icon" 
            :src="item.icon" 
            :alt="item.label" 
            style="width: 20px !important; height: 20px !important; min-width: 20px !important; min-height: 20px !important; max-width: 20px !important; max-height: 20px !important; margin-right: 12px !important; object-fit: contain !important; display: block !important; border: none !important; padding: 0 !important; margin: 0 !important;"
          />
          <span style="font-size: 14px !important; font-weight: 600 !important; white-space: nowrap !important; font-family: sans-serif !important; line-height: 1.2 !important;">{{ item.label }}</span>
        </div>
      </div>
    </Transition>

    <!-- Main Button -->
    <div
      class="desktop-fab-button"
      :class="{ 'is-open': isMenuOpen, 'is-dragging': isDragging }"
      @mousedown="startDrag"
      @click.stop="toggleMenu"
      :title="t('desktop_fab_tooltip') || 'Quick Actions'"
      :style="{ transform: isHovered || isMenuOpen ? 'translateX(-15px)' : 'translateX(0)' }"
    >
      <img src="@/icons/extension/extension_icon_64.svg" :alt="t('desktop_fab_alt') || 'Translate Actions'" class="fab-icon" />
    </div>  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { sendMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { useMobileStore } from '@/store/modules/mobile.js';

import IconSelectElement from '@/icons/ui/select.png';
import IconTranslatePage from '@/icons/ui/whole-page.png';
import IconRevert from '@/icons/ui/revert.png';
import IconRestore from '@/icons/ui/restore.svg';
import IconClear from '@/icons/ui/clear.png';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT_APP, 'DesktopFabMenu');
const pageEventBus = window.pageEventBus;
const mobileStore = useMobileStore();
const { t } = useI18n();

const isMenuOpen = ref(false);
const isFaded = ref(false);
const isHovered = ref(false);
const isRevertHovered = ref(false);
const fabContainerRef = ref(null);

const menuItems = computed(() => {
  const items = [
    {
      id: 'select_element',
      label: t('select_element_label') || 'Select Element',
      icon: IconSelectElement,
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
  const isDone = pageData.totalCount > 0 && pageData.translatedCount >= pageData.totalCount;
  const isCurrentlyTranslating = pageData.isTranslating && !isDone;

  if (isCurrentlyTranslating) {
    const percent = pageData.totalCount > 0 ? Math.round((pageData.translatedCount / pageData.totalCount) * 100) : 0;
    items.push({
      id: 'page_translating',
      label: `${t('translating_label') || 'Translating'} (${percent}%) - ${t('stop_auto_translating_label') || 'Stop'}`,
      icon: IconClear,
      action: () => pageEventBus.emit(MessageActions.PAGE_TRANSLATE_STOP_AUTO)
    });
  } else if (pageData.isAutoTranslating) {
    // If auto-translating, primary action is to STOP it
    items.push({
      id: 'stop_auto',
      label: t('stop_auto_translating_label') || 'Stop Auto Translating',
      icon: IconClear,
      action: () => pageEventBus.emit(MessageActions.PAGE_TRANSLATE_STOP_AUTO)
    });
  } else if (pageData.isTranslated || isDone) {
    // If translated but NOT auto-translating, show Restore
    items.push({
      id: 'restore_page',
      label: t('restore_original_label') || 'Restore Original',
      icon: IconRestore,
      action: () => pageEventBus.emit(MessageActions.PAGE_RESTORE)
    });
  } else {
    // Default state: Translate Page
    items.push({
      id: 'translate_page',
      label: t('translate_page_label') || 'Translate Page',
      icon: IconTranslatePage,
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
    transition: 'opacity 0.8s ease, transform 0.3s ease !important',
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
  isMenuOpen.value = false;
  if (typeof item.action === 'function') {
    await item.action();
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
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background-color: #4A90E2;
  box-shadow: -4px 0 15px rgba(0, 0, 0, 0.2);
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  pointer-events: auto;
  user-select: none;
  transition: transform 0.3s ease, background-color 0.2s ease;
}

.desktop-fab-button.is-open {
  background-color: #357ABD;
}

.fab-icon { 
  width: 28px; 
  height: 28px; 
  pointer-events: none;
  margin-right: 15px; 
}

.fab-menu-item:hover { background-color: #f5f5f5 !important; }

/* Transitions */
.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;
}

.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0 !important;
  transform: scale(0.5) translateY(10px) !important;
}

.fab-menu-enter-active,
.fab-menu-leave-active {
  transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  transform-origin: bottom right;
}

.fab-menu-enter-from,
.fab-menu-leave-to {
  opacity: 0;
  transform: scale(0.8) translateY(10px);
}
</style>