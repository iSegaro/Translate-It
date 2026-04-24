import { nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'HighlightManager');

/**
 * Composable to handle spotlighting/highlighting specific elements in the options page.
 * It looks for a 'highlight' query parameter in the URL and applies an animation to the target element.
 */
export function useHighlightManager() {
  const route = useRoute();
  const router = useRouter();

  /**
   * Internal helper to perform the scroll and animation
   */
  const applyHighlight = (elementId) => {
    const element = document.getElementById(elementId);
    if (!element) {
      logger.warn(`Element with ID "${elementId}" not found for highlighting.`);
      return;
    }

    // 1. Scroll into view
    logger.debug(`Scrolling to element: ${elementId}`);
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });

    // 2. Apply highlight class
    // Wait for scroll to finish approximately
    setTimeout(() => {
      logger.debug(`Applying highlight animation to: ${elementId}`);
      element.classList.add('is-highlighting');

      // 3. Remove highlight class after animation finishes (matches CSS duration)
      setTimeout(() => {
        element.classList.remove('is-highlighting');
        logger.debug(`Highlight class removed from: ${elementId}`);
      }, 3600);
    }, 500);
  };

  /**
   * Manually trigger a highlight on a specific element ID.
   * Useful for programmatic highlighting (e.g., when a setting is missing).
   * 
   * @param {string} elementId - The ID of the element to highlight
   */
  const highlightElement = (elementId) => {
    if (!elementId) return;
    logger.debug(`Manual highlight requested for: ${elementId}`);
    applyHighlight(elementId);
  };

  /**
   * Checks the current route for a highlight parameter and performs the reveal/scroll/highlight sequence.
   * @param {Object} options Configuration options
   * @param {Function} options.revealAction Optional callback to open accordions or parents before highlighting
   */
  const checkAndHighlight = async (options = {}) => {
    const targetId = route.query.highlight;
    if (!targetId) return;

    logger.debug(`Target highlight detected from URL: ${targetId}`);

    // Wait for the next tick to ensure components are mounted
    await nextTick();

    // Small delay to allow for lazy-loaded tabs to stabilize
    setTimeout(async () => {
      // Unified Reveal Logic
      const globalReveal = (id) => {
        if (id.startsWith('PROXY_')) return 'proxy';
        if (id === 'DEBUG_MODE' || id.startsWith('LOG_LEVEL_')) return 'debug';
        if (id.startsWith('DICTIONARY_')) return 'dictionary';
        if (id.startsWith('BILINGUAL_')) return 'bilingual';
        if (id.startsWith('AI_OPT_')) return 'ai';
        if (id.startsWith('OPTIMIZATION_')) return 'api';
        return null;
      };

      const accordionToOpen = globalReveal(targetId);
      
      if (accordionToOpen || typeof options.revealAction === 'function') {
        logger.debug(`Attempting to reveal: ${targetId}`);
        
        if (typeof options.revealAction === 'function') {
          options.revealAction(targetId);
        } else if (accordionToOpen) {
          window.dispatchEvent(new CustomEvent('options-reveal-accordion', { detail: accordionToOpen }));
        }

        await nextTick();
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // Apply the actual highlight logic
      applyHighlight(targetId);

      // Clean up URL
      const newQuery = { ...route.query };
      delete newQuery.highlight;
      router.replace({ query: newQuery });
    }, 100);
  };

  return {
    checkAndHighlight,
    highlightElement
  };
}
