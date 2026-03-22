<template>
  <div
    class="desktop-fab-container notranslate"
    translate="no"
    ref="fabContainerRef"
    :style="containerStyle"
  >
    <!-- Menu -->
    <Transition name="fab-menu">
      <div 
        v-if="isMenuOpen" 
        class="desktop-fab-menu"
        style="position: absolute !important; bottom: 65px !important; right: 0 !important; background-color: #ffffff !important; border-radius: 12px !important; box-shadow: 0 8px 30px rgba(0,0,0,0.2) !important; padding: 8px 0 !important; min-width: 200px !important; width: max-content !important; border: 1px solid #ddd !important; display: flex !important; flex-direction: column !important; z-index: 2147483647 !important; overflow: hidden !important; margin: 0 !important;"
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
            style="width: 20px !important; height: 20px !important; min-width: 20px !important; min-height: 20px !important; max-width: 20px !important; max-height: 20px !important; margin-right: 12px !important; object-fit: contain !important; display: block !important; border: none !important; padding: 0 !important; margin-top: 0 !important; margin-bottom: 0 !important; margin-left: 0 !important;"
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

const position = ref({ x: -1, y: -1 });
const isDragging = ref(false);
let startPos = { x: 0, y: 0 };

const containerStyle = computed(() => {
  if (position.value.x === -1) {
    return {
      position: 'fixed !important',
      bottom: '30px !important',
      right: '30px !important',
      left: 'auto !important',
      top: 'auto !important',
      zIndex: 2147483647
    };
  }
  return {
    position: 'fixed !important',
    left: `${position.value.x}px !important`,
    top: `${position.value.y}px !important`,
    right: 'auto !important',
    bottom: 'auto !important',
    zIndex: 2147483647
  };
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
  if (position.value.x === -1) {
    const rect = fabContainerRef.value.getBoundingClientRect();
    position.value = { x: rect.left, y: rect.top };
  }
  isDragging.value = false;
  startPos = { x: e.clientX - position.value.x, y: e.clientY - position.value.y };
  window.addEventListener('mousemove', onDrag);
  window.addEventListener('mouseup', stopDrag);
};

const onDrag = (e) => {
  if (!isDragging.value) {
    const dx = e.clientX - startPos.x - position.value.x;
    const dy = e.clientY - startPos.y - position.value.y;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      isDragging.value = true;
      isMenuOpen.value = false;
    }
  }
  if (isDragging.value) {
    e.preventDefault();
    position.value = { x: e.clientX - startPos.x, y: e.clientY - startPos.y };
  }
};

const stopDrag = () => {
  window.removeEventListener('mousemove', onDrag);
  window.removeEventListener('mouseup', stopDrag);
  setTimeout(() => { isDragging.value = false; }, 100);
};

onMounted(() => {
  const handleClickOutside = (e) => {
    if (!isMenuOpen.value) return;
    
    // Check if the click path includes our container (important for Shadow DOM)
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
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  pointer-events: auto;
  user-select: none;
  transition: transform 0.2s ease;
  opacity: 0.8;
}

.desktop-fab-button:hover { opacity: 1; transform: scale(1.05); }
.fab-icon { width: 28px; height: 28px; pointer-events: none; }
.fab-menu-item:hover { background-color: #f5f5f5 !important; }
</style>