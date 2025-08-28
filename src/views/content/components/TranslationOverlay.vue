<template>
  <div class="translation-overlay">
    <div 
      v-for="(translation, index) in activeTranslations" 
      :key="translation.id"
      :class="['translated-element', translation.isInteractive ? 'interactive' : 'non-interactive']"
      :style="translation.style"
      @click="onTranslationClick(translation, $event)"
      :ref="el => { if (el) translatedElements[index] = el }"
    >
      <!-- The cloned element will be mounted here by the script -->
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, onBeforeUpdate } from 'vue';
import { pageEventBus } from '@/utils/core/PageEventBus.js';
import { shouldApplyRtl } from '@/utils/text/textDetection.js';

const activeTranslations = ref([]);
const translatedElements = ref([]);

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
    // Skip direction and text-align properties as they will be handled by correctTextDirection
    if (prop === 'direction' || prop === 'text-align') {
      continue;
    }
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
    console.log('Received show-translation event for', detail.element.tagName, 'with', detail.translations?.size || 0, 'translations');
    const { element, translations, textNodes, originalText } = detail;
    
    const rect = element.getBoundingClientRect();

    // Clone the original element with all its styles
    const clonedElement = cloneWithStyles(element);

    // Function to traverse the cloned node and replace text nodes with translations
    // Uses the same logic as the old system's applyTranslationsToNodes function
    const replaceTextInClone = (node) => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
        const originalText = node.textContent;
        const trimmedOriginalText = originalText.trim();
        
        // Check if we have a translation for this trimmed text
        const translatedText = translations.get(trimmedOriginalText);
        
        if (translatedText && trimmedOriginalText) {
          // Replace the entire text node content with translation
          node.textContent = translatedText;
          
          // Apply correct text direction to the parent element containing the translated text
          const parentElement = node.parentNode;
          if (parentElement && parentElement.nodeType === Node.ELEMENT_NODE) {
            const isRtl = shouldApplyRtl(translatedText);
            parentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
            parentElement.style.textAlign = isRtl ? 'right' : 'left';
          }
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // Traverse all child nodes
        const children = Array.from(node.childNodes);
        for (const child of children) {
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
      style: style,
      isInteractive: isElementInteractive(element) // Determine if element needs special handling
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

    console.log('Translation overlay added for', translation.isInteractive ? 'interactive' : 'static', 'element:', element.tagName);
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
    translation.element.style.visibility = '';
    translation.element.style.pointerEvents = '';
  });
  activeTranslations.value = [];
});

const onTranslationClick = (translation, event) => {
  // Check if this is a critical interactive element that should preserve original behavior
  const isInteractiveElement = isElementInteractive(translation.element);
  
  if (isInteractiveElement) {
    // Forward the click to the original element instead of handling it here
    forwardEventToOriginalElement(translation.element, event);
    return;
  }
  
  // Handle translation-specific clicks (like showing actions)
  pageEventBus.emit('translation-clicked', translation);
};

// Check if element has interactive behavior that should be preserved
const isElementInteractive = (element) => {
  // Check for common interactive patterns
  const interactiveSelectors = [
    'a', 'button', 'input', 'textarea', 'select',
    '[role="button"]', '[role="link"]', '[onclick]',
    '[data-testid*="tweet"]', // Twitter-specific
    '[data-tweet-id]',        // Twitter-specific
    '.tweet', '.post',        // General social media
    '[href]'                  // Any element with href
  ];
  
  // Check if element itself matches
  for (const selector of interactiveSelectors) {
    if (element.matches?.(selector)) {
      return true;
    }
  }
  
  // Check if element has click listeners or is within an interactive container
  const hasClickHandler = element.onclick || 
    element.addEventListener?.name || 
    getComputedStyle(element).cursor === 'pointer';
    
  return hasClickHandler;
};

// Forward events to original element to preserve functionality
const forwardEventToOriginalElement = (originalElement, event) => {
  console.log('Forwarding event to original element:', originalElement);
  
  // Create a new event with the same properties
  const forwardedEvent = new event.constructor(event.type, {
    bubbles: event.bubbles,
    cancelable: event.cancelable,
    view: event.view,
    detail: event.detail,
    screenX: event.screenX,
    screenY: event.screenY,
    clientX: event.clientX,
    clientY: event.clientY,
    button: event.button,
    buttons: event.buttons,
    relatedTarget: event.relatedTarget,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey
  });
  
  // Temporarily restore visibility to allow proper event handling
  const originalVisibility = originalElement.style.visibility;
  const originalPointerEvents = originalElement.style.pointerEvents;
  
  originalElement.style.visibility = 'visible';
  originalElement.style.pointerEvents = 'auto';
  
  // Dispatch the event
  originalElement.dispatchEvent(forwardedEvent);
  
  // Restore the hidden state after a short delay to prevent flicker
  setTimeout(() => {
    originalElement.style.visibility = originalVisibility;
    originalElement.style.pointerEvents = originalPointerEvents;
  }, 10);
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

// Navigation detection for automatic cleanup
let currentUrl = window.location.href;

const handleNavigationChange = () => {
  const newUrl = window.location.href;
  if (newUrl !== currentUrl) {
    console.log('Navigation detected, cleaning up overlays');
    // Clear all overlays when navigation occurs
    clearAllTranslations();
    currentUrl = newUrl;
    
    // Emit event to notify other components
    pageEventBus.emit('navigation-detected', { 
      oldUrl: currentUrl, 
      newUrl: newUrl 
    });
  }
};

// Listen for navigation events (works for both traditional and SPA navigation)
window.addEventListener('popstate', handleNavigationChange);
window.addEventListener('pushstate', handleNavigationChange);

// For SPAs that use history.pushState/replaceState, we need to override them
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function(...args) {
  originalPushState.apply(this, args);
  setTimeout(handleNavigationChange, 0); // Use setTimeout to ensure URL has changed
};

history.replaceState = function(...args) {
  originalReplaceState.apply(this, args);
  setTimeout(handleNavigationChange, 0);
};

// Also watch for URL changes via MutationObserver (fallback)
const urlChangeObserver = new MutationObserver(() => {
  handleNavigationChange();
});

// Watch for document title changes (often indicates navigation in SPAs)
urlChangeObserver.observe(document.querySelector('title') || document.head, {
  childList: true,
  subtree: true
});

const clearAllTranslations = () => {
  // Restore all elements
  activeTranslations.value.forEach(translation => {
    translation.element.style.visibility = '';
    translation.element.style.pointerEvents = '';
  });
  activeTranslations.value = [];
  
  // Also emit clear event to ensure other components are notified
  pageEventBus.emit('clear-all-translations');
};
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
  cursor: inherit; /* Inherit cursor from original element */
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

/* For interactive overlays, maintain proper cursor */
.translated-element.interactive {
  cursor: pointer;
}

/* For non-interactive overlays, use default cursor */
.translated-element.non-interactive {
  cursor: default;
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
