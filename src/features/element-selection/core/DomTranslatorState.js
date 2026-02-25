/**
 * Global translation state and revert logic for Select Element mode
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import { TEXT_TAGS } from './DomTranslatorConstants.js';

export const globalSelectElementState = {
  currentTranslation: null,
  isTranslating: false,
};

// Make it available globally for legacy RevertHandler access if needed
if (typeof window !== 'undefined') {
  window.__selectElementTranslationState__ = globalSelectElementState;
}

/**
 * Get the global Select Element translation state
 * @returns {Object} Global state object
 */
export function getSelectElementTranslationState() {
  return globalSelectElementState;
}

/**
 * Global function to revert Select Element translation
 * Can be called independently of the Adapter class
 * @returns {Promise<boolean>} Success status
 */
export async function revertSelectElementTranslation() {
  if (!globalSelectElementState.currentTranslation) {
    return false;
  }

  const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'GlobalRevert');

  try {
    const { element, originalHTML, originalTextNodes } = globalSelectElementState.currentTranslation;

    if (originalTextNodes && originalTextNodes.length > 0) {
      // Restore each text node individually
      originalTextNodes.forEach(({ node, originalText }) => {
        if (node.parentNode) {
          node.nodeValue = originalText;
        }
      });
      logger.info('Text nodes restored via global function');
    } else if (originalHTML && element) {
      element.innerHTML = originalHTML;
    }

    // Clean up directions and styles
    if (element) {
      element.removeAttribute('dir');
      element.removeAttribute('data-translate-dir');
      element.style.textAlign = '';
      
      const childTextElements = element.querySelectorAll(Array.from(TEXT_TAGS).join(','));
      childTextElements.forEach(child => {
        child.removeAttribute('dir');
        child.style.textAlign = '';
      });

      pageEventBus.emit('hide-translation', { element });
    }

    globalSelectElementState.currentTranslation = null;
    return true;
  } catch (error) {
    logger.error('Failed to revert translation via global function', error);
    return false;
  }
}
