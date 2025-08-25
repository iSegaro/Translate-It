<template>
  <div class="translation-overlay">
    <div 
      v-for="translation in activeTranslations" 
      :key="translation.id"
      class="translated-element"
      :style="translation.style"
      @click="onTranslationClick(translation)"
    >
      <div class="translation-content">
        {{ translation.translatedText }}
      </div>
      <div class="translation-actions" v-if="showActions">
        <button class="action-btn revert" @click.stop="onRevert(translation)">
          ↶
        </button>
        <button class="action-btn copy" @click.stop="onCopy(translation)">
          📋
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { pageEventBus } from '@/utils/core/PageEventBus.js';

const activeTranslations = ref([]);
const showActions = ref(true);

// Generate unique IDs for translations
let translationCounter = 0;
const generateId = () => `translation-${Date.now()}-${translationCounter++}`;

  // Listen for translation events
  pageEventBus.on('show-translation', (detail) => {
    console.log('Received show-translation event:', detail);
    const { element, translatedText, originalText } = detail;
    const rect = element.getBoundingClientRect();
    
    const translation = {
      id: detail.id || generateId(),
      element,
      translatedText,
      originalText,
      style: {
        top: `${rect.top + window.scrollY}px`,
        left: `${rect.left + window.scrollX}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        fontSize: getComputedStyle(element).fontSize,
        fontFamily: getComputedStyle(element).fontFamily,
        lineHeight: getComputedStyle(element).lineHeight,
        color: getComputedStyle(element).color,
        backgroundColor: getComputedStyle(element).backgroundColor,
        textAlign: getComputedStyle(element).textAlign,
        padding: getComputedStyle(element).padding,
        margin: getComputedStyle(element).margin,
        display: getComputedStyle(element).display,
      }
    };
    
    // Hide original element visually but keep layout
    element.style.opacity = '0.01';
    element.style.pointerEvents = 'none';
    
    // Add translation
    activeTranslations.value.push(translation);
    console.log('Translation overlay added:', translation, 'Text:', translatedText);
    console.log('Element position:', rect, 'Scroll:', {scrollY: window.scrollY, scrollX: window.scrollX});
  });

pageEventBus.on('hide-translation', (detail) => {
  if (detail.id) {
    const translation = activeTranslations.value.find(t => t.id === detail.id);
    if (translation) {
      // Restore original element
      translation.element.style.opacity = '';
      translation.element.style.pointerEvents = '';
    }
    activeTranslations.value = activeTranslations.value.filter(t => t.id !== detail.id);
  } else if (detail.element) {
    const translation = activeTranslations.value.find(t => t.element === detail.element);
    if (translation) {
      translation.element.style.opacity = '';
      translation.element.style.pointerEvents = '';
    }
    activeTranslations.value = activeTranslations.value.filter(t => t.element !== detail.element);
  } else {
    // Restore all elements
    activeTranslations.value.forEach(translation => {
      translation.element.style.opacity = '';
      translation.element.style.pointerEvents = '';
    });
    activeTranslations.value = [];
  }
});

pageEventBus.on('clear-all-translations', () => {
  // Restore all elements
  activeTranslations.value.forEach(translation => {
    translation.element.style.opacity = '';
    translation.element.style.pointerEvents = '';
  });
  activeTranslations.value = [];
});

const onTranslationClick = (translation) => {
  pageEventBus.emit('translation-clicked', translation);
};

const onRevert = (translation) => {
  pageEventBus.emit('revert-translation', translation);
};

const onCopy = (translation) => {
  pageEventBus.emit('copy-translation', translation);
};

// Handle window resize and scroll to update positions
const updateTranslationPositions = () => {
  activeTranslations.value.forEach(translation => {
    const rect = translation.element.getBoundingClientRect();
    translation.style = {
      ...translation.style,
      top: `${rect.top + window.scrollY}px`,
      left: `${rect.left + window.scrollX}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    };
  });
};

// Set up resize and scroll listeners
window.addEventListener('resize', updateTranslationPositions);
window.addEventListener('scroll', updateTranslationPositions, { passive: true });
</script>

<style scoped>
.translation-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 2147483645; /* Below highlights but above page content */
  transform: translateZ(0);
  opacity: 1 !important;
  visibility: visible !important;
}

.translated-element {
  position: fixed !important;
  background-color: transparent !important;
  border: none !important;
  padding: 0 !important;
  pointer-events: auto;
  cursor: pointer;
  box-shadow: none !important;
  transition: all 0.2s ease;
  overflow: visible;
  word-wrap: break-word;
  display: block !important;
  transform: translateZ(0);
  opacity: 1 !important;
  visibility: visible !important;
}

.translated-element:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  transform: translateY(-1px);
}

.translation-content {
  color: inherit !important;
  line-height: inherit !important;
  background-color: inherit !important;
  font-size: inherit !important;
  font-family: inherit !important;
  text-align: inherit !important;
  white-space: pre-wrap !important;
  word-wrap: break-word !important;
}

.translation-actions {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.translated-element:hover .translation-actions {
  opacity: 1;
}

.action-btn {
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #ddd;
  border-radius: 3px;
  padding: 2px 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn:hover {
  background: #f0f0f0;
  border-color: #ccc;
}

.action-btn.revert:hover {
  color: #dc3545;
}

.action-btn.copy:hover {
  color: #007bff;
}
</style>
