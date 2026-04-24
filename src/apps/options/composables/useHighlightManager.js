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
   * Checks the current route for a highlight parameter and performs the reveal/scroll/highlight sequence.
   * @param {Object} options Configuration options
   * @param {Function} options.revealAction Optional callback to open accordions or parents before highlighting
   */
  const checkAndHighlight = async (options = {}) => {
    const targetId = route.query.highlight;
    if (!targetId) return;

    logger.debug(`Target highlight detected: ${targetId}`);

    // Wait for the next tick to ensure components are mounted
    await nextTick();

    // Small delay to allow for lazy-loaded tabs to stabilize
    setTimeout(async () => {
      // 1. Unified Reveal Logic
      // This helps open accordions automatically based on ID patterns
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
        
        // If the tab has a custom reveal action, use it
        if (typeof options.revealAction === 'function') {
          options.revealAction(targetId);
        } else if (accordionToOpen) {
          // If no custom action, try to find and trigger the tab's internal accordion state
          // This assumes the tab exposes its activeAccordion or uses a shared pattern
          window.dispatchEvent(new CustomEvent('options-reveal-accordion', { detail: accordionToOpen }));
        }

        await nextTick();
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      const element = document.getElementById(targetId);
      if (!element) {
        logger.warn(`Element with ID "${targetId}" not found for highlighting.`);
        return;
      }

      // 2. Scroll into view
      logger.debug(`Scrolling to element: ${targetId}`);
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });

      // 3. Apply highlight class
      // Wait for scroll to finish approximately
      setTimeout(() => {
        logger.debug(`Applying highlight animation to: ${targetId}`);
        element.classList.add('is-highlighting');

        // 4. Remove highlight class after animation finishes (matches CSS duration)
        setTimeout(() => {
          element.classList.remove('is-highlighting');
          logger.debug(`Highlight class removed from: ${targetId}`);
        }, 3600);

        // 5. Clean up URL (optional but recommended for professional UX)
        const newQuery = { ...route.query };
        delete newQuery.highlight;
        router.replace({ query: newQuery });
      }, 500);
    }, 100);
  };

  return {
    checkAndHighlight
  };
}
