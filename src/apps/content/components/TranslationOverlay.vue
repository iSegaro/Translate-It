<template>
  <!-- Direct DOM Manipulation - no template needed -->
  <div v-show="!isFullscreen" style="display: none;" />
</template>

<script setup>
import { computed } from 'vue';
import { pageEventBus } from '@/core/PageEventBus.js';
import { shouldApplyRtl } from '@/shared/utils/text/textAnalysis.js';
import { useResourceTracker } from '@/composables/core/useResourceTracker.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { useMobileStore } from '@/store/modules/mobile.js';

// State management for translated elements using direct DOM manipulation
const translatedElementsMap = new Map(); // element -> {originalText, translationId}
const originalTextsMap = new Map(); // element -> originalText
let translationIdCounter = 0;

// Resource tracker for automatic cleanup
const tracker = useResourceTracker('translation-overlay')
const logger = getScopedLogger(LOG_COMPONENTS.CONTENT_APP, 'TranslationOverlay')
const mobileStore = useMobileStore();

const isFullscreen = computed(() => mobileStore.isFullscreen);

// Generate unique IDs for translations
const generateUniqueTranslationId = () => {
  return `translate-${Date.now()}-${++translationIdCounter}`;
};

// Apply translations directly to DOM elements
const applyTranslationsToNodes = (element, translationsMap) => {
  const originalText = element.textContent?.trim() || '';
  const translationId = generateUniqueTranslationId();
  
  // Store original text for revert functionality
  originalTextsMap.set(element, originalText);
  translatedElementsMap.set(element, {
    originalText,
    translationId
  });
  
  // Mark element as translated
  element.setAttribute('data-translate-id', translationId);
  element.setAttribute('data-translate-original', 'true');
  
  // Apply translations to text nodes
  const traverse = (node) => {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
      const originalText = node.textContent.trim();
      const translatedText = translationsMap.get(originalText);
      
      if (translatedText && originalText) {
        // Direct text replacement
        node.textContent = translatedText;
        
        // Apply RTL direction to parent element if needed
        const parentElement = node.parentNode;
        if (parentElement && parentElement.nodeType === Node.ELEMENT_NODE) {
          const isRtl = shouldApplyRtl(translatedText);
          parentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
          parentElement.style.textAlign = isRtl ? 'right' : 'left';
        }
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // Traverse child nodes
      const children = Array.from(node.childNodes);
      for (const child of children) {
        traverse(child);
      }
    }
  };
  
  traverse(element);
  logger.debug('Applied translation directly to DOM element:', element.tagName, 'with', translationsMap.size, 'translations');
};

// Revert translations (restore original text)
const revertTranslations = (element) => {
  const originalText = originalTextsMap.get(element);
  if (!originalText) return;
  
  // Simply replace textContent with original
  element.textContent = originalText;
  
  // Remove translation attributes
  element.removeAttribute('data-translate-id');
  element.removeAttribute('data-translate-original');
  element.removeAttribute('dir');
  element.style.textAlign = '';
  
  // Clean up state
  originalTextsMap.delete(element);
  translatedElementsMap.delete(element);
  
  logger.debug('Reverted translation for element:', element.tagName);
};

// Clear all translations
const clearAllTranslations = () => {
  translatedElementsMap.forEach((data, element) => {
    revertTranslations(element);
  });
  
  translatedElementsMap.clear();
  originalTextsMap.clear();
  
  logger.debug('All translations cleared');
};

// Listen for translation events using tracker
tracker.addEventListener(pageEventBus, 'show-translation', (detail) => {
  logger.debug('Received show-translation event for', detail.element.tagName, 'with', detail.translations?.size || 0, 'translations');
  const { element, translations } = detail;
  applyTranslationsToNodes(element, translations);
});

tracker.addEventListener(pageEventBus, 'hide-translation', (detail) => {
  if (detail.element) {
    revertTranslations(detail.element);
  } else {
    clearAllTranslations();
  }
});

tracker.addEventListener(pageEventBus, 'clear-all-translations', () => {
  clearAllTranslations();
});

// Navigation detection for automatic cleanup
let currentUrl = window.location.href;

const handleNavigationChange = () => {
  const newUrl = window.location.href;
  if (newUrl !== currentUrl) {
    logger.debug('Navigation detected, cleaning up translations');
    clearAllTranslations();
    currentUrl = newUrl;
    
    pageEventBus.emit('navigation-detected', { 
      oldUrl: currentUrl, 
      newUrl: newUrl 
    });
  }
};

// Listen for navigation events with automatic cleanup
tracker.addEventListener(window, 'popstate', handleNavigationChange);
tracker.addEventListener(window, 'pushstate', handleNavigationChange);

// For SPAs that use history.pushState/replaceState
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

// Use tracker.trackResource to store the restore function for pushState
tracker.trackResource('history-hook-cleanup', () => {
  history.pushState = originalPushState;
  history.replaceState = originalReplaceState;
});

history.pushState = function(...args) {
  originalPushState.apply(this, args);
  tracker.trackTimeout(handleNavigationChange, 0);
};

history.replaceState = function(...args) {
  originalReplaceState.apply(this, args);
  tracker.trackTimeout(handleNavigationChange, 0);
};
</script>

<style scoped>
/* No styles needed */
</style>