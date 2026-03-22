<template>
  <div
    class="desktop-fab-container notranslate"
    translate="no"
    ref="fabContainerRef"
    :style="containerStyle"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <!-- Menu -->
    <Transition name="fab-menu">
      <div 
        v-if="isMenuOpen" 
        class="desktop-fab-menu"
        style="position: absolute !important; bottom: 0px !important; right: 45px !important; background-color: #ffffff !important; border-radius: 12px !important; box-shadow: 0 8px 30px rgba(0,0,0,0.2) !important; padding: 8px 0 !important; min-width: 200px !important; width: max-content !important; border: 1px solid #ddd !important; display: flex !important; flex-direction: column !important; z-index: 2147483647 !important; overflow: hidden !important; margin: 0 !important;"
      >
        <div 
          v-for="item in menuItems" 
          :key="item.id" 
          class="fab-menu-item"
          @click.stop="handleMenuItemClick(item)"
          style="display: flex !important; align-items: center !important; padding: 12px 16px !important; cursor: pointer !important; color: #333 !important; width: 100% !important; box-sizing: border-box !important; transition: background 0.2s !important;"
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
      title="Quick Actions"
      :style="{ transform: isHovered || isMenuOpen ? 'translateX(-15px)' : 'translateX(0)' }"
    >
      <img src="@/icons/extension/extension_icon_64.svg" alt="Translate Actions" class="fab-icon" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { sendMessage } from '@/shared/messaging/core/UnifiedMessaging.js';

import IconSelectElement from '@/icons/ui/select.png';
import IconTranslatePage from '@/icons/ui/whole-page.png';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT_APP, 'DesktopFabMenu');
const pageEventBus = window.pageEventBus;

const isMenuOpen = ref(false);
const isFaded = ref(false);
const isHovered = ref(false);
const fabContainerRef = ref(null);

const menuItems = ref([
  {
    id: 'select_element',
    label: 'Select Element',
    icon: IconSelectElement,
    action: async () => {
      try {
        await sendMessage({ action: MessageActions.ACTIVATE_SELECT_ELEMENT_MODE });
      } catch (err) {
        logger.error('Failed to trigger select element from FAB:', err);
      }
    }
  },
  {
    id: 'translate_page',
    label: 'Translate Page',
    icon: IconTranslatePage,
    action: () => {
      pageEventBus.emit(MessageActions.PAGE_TRANSLATE);
    }
  }
]);

const verticalPos = ref(-1);
const isDragging = ref(false);
let startY = 0;

const containerStyle = computed(() => {
  // Determine Opacity logic
  let opacityValue = 1;
  if (isFaded.value && !isHovered.value && !isMenuOpen.value) {
    opacityValue = 0.2; // 80% transparent when idle after 2s
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
</style>