<template>
  <div class="translation-overlay">
    <div 
      v-for="(translation, index) in activeTranslations" 
      :key="translation.id"
      class="translated-element"
      :style="translation.style"
      @click="onTranslationClick(translation)"
      :ref="el => { if (el) translatedElements[index] = el }"
    >
      <!-- The cloned element will be mounted here by the script -->
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, onBeforeUpdate } from 'vue';
import { pageEventBus } from '@/utils/core/PageEventBus.js';

const activeTranslations = ref([]);
const translatedElements = ref([]);
const showActions = ref(true);

// Ensure refs are cleared before each update
onBeforeUpdate(() => {
  translatedElements.value = [];
});

// Generate unique IDs for translations
let translationCounter = 0;
const generateId = () => `translation-${Date.now()}-${translationCounter++}`;

const cloneWithStyles = (sourceNode) => {
  if (sourceNode.nodeType === Node.TEXT_NODE) {
    return sourceNode.cloneNode(true);
  }

  if (sourceNode.nodeType !== Node.ELEMENT_NODE) {
    return sourceNode.cloneNode(false);
  }

  const clonedElement = sourceNode.cloneNode(false);

  const computedStyle = window.getComputedStyle(sourceNode);
  for (let i = 0; i < computedStyle.length; i++) {
    const prop = computedStyle[i];
    clonedElement.style.setProperty(prop, computedStyle.getPropertyValue(prop));
  }

  const children = sourceNode.childNodes;
  for (let i = 0; i < children.length; i++) {
    clonedElement.appendChild(cloneWithStyles(children[i]));
  }

  return clonedElement;
};

  // Listen for translation events
  pageEventBus.on('show-translation', (detail) => {
    console.log('Received show-translation event:', detail);
    const { element, translations, textNodes, originalText } = detail;
    const rect = element.getBoundingClientRect();

    // Clone the original element with all its styles
    const clonedElement = cloneWithStyles(element);

    // Function to traverse the cloned node and replace text nodes with translations
    const replaceTextInClone = (node) => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
        const originalNodeText = node.textContent;
        if (translations.has(originalNodeText)) {
          node.textContent = translations.get(originalNodeText);
        }
      } else {
        for (const child of node.childNodes) {
          replaceTextInClone(child);
        }
      }
    };

    // Replace the text in the cloned element
    replaceTextInClone(clonedElement);

    const style = {
      position: 'absolute',
      top: `${rect.top + window.scrollY}px`,
      left: `${rect.left + window.scrollX}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      zIndex: '2147483647',
      pointerEvents: 'auto',
    };

    const translation = {
      id: detail.id || generateId(),
      element,
      clonedElement, // Store the cloned element
      originalText,
      style: style
    };
    
    // Hide original element visually but keep layout
    element.style.visibility = 'hidden';
    element.style.pointerEvents = 'none';
    
    // Add translation
    activeTranslations.value.push(translation);

    nextTick(() => {
      const lastIndex = activeTranslations.value.length - 1;
      const lastTranslatedElement = translatedElements.value[lastIndex];
      if (lastTranslatedElement) {
        lastTranslatedElement.innerHTML = ''; // Clear previous content
        lastTranslatedElement.appendChild(clonedElement);
      }
    });

    console.log('Translation overlay added:', translation);
    console.log('Element position:', rect, 'Scroll:', {scrollY: window.scrollY, scrollX: window.scrollX});
  });

pageEventBus.on('hide-translation', (detail) => {
  if (detail.id) {
    const translation = activeTranslations.value.find(t => t.id === detail.id);
    if (translation) {
      // Restore original element
      translation.element.style.visibility = '';
      translation.element.style.pointerEvents = '';
    }
    activeTranslations.value = activeTranslations.value.filter(t => t.id !== detail.id);
  } else if (detail.element) {
    const translation = activeTranslations.value.find(t => t.element === detail.element);
    if (translation) {
      translation.element.style.visibility = '';
      translation.element.style.pointerEvents = '';
    }
    activeTranslations.value = activeTranslations.value.filter(t => t.element !== detail.element);
  } else {
    // Restore all elements
    activeTranslations.value.forEach(translation => {
      translation.element.style.visibility = '';
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
  z-index: 2147483647; /* Highest z-index */
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
  display: inline !important;
  transform: translateZ(0);
  opacity: 1 !important;
  visibility: visible !important;
  z-index: 2147483647 !important;
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
  width: 100% !important;
  height: 100% !important;
  display: flex !important;
  align-items: center !important;
  justify-content: inherit !important;
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
