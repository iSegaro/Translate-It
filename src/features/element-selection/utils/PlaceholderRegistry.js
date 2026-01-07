// PlaceholderRegistry - Manages inline element placeholders for contextual translation
// Part of the Contextual Sentence Translation system

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

/**
 * PlaceholderRegistry manages the mapping between placeholder markers and original DOM elements.
 * This enables extraction of complete sentences with inline elements preserved as placeholders.
 *
 * Key Features:
 * - Unique identifier generation for each placeholder
 * - Complete subtree HTML storage for nested elements
 * - DOM reference resilience with recovery mechanism
 * - Streaming state tracking
 * - Automatic cleanup of temporary attributes
 */
export class PlaceholderRegistry {
  #registry = new Map();
  #nextId = 0;
  #isStreaming = false;
  logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'PlaceholderRegistry');

  /**
   * Register an inline element as a placeholder
   * @param {HTMLElement} element - The inline element to register
   * @returns {number} The placeholder ID
   */
  register(element) {
    const id = this.#nextId++;
    const uniqueId = `aiwc-orig-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Set unique identifier on element BEFORE storing (for recovery)
    element.setAttribute('data-aiwc-original-id', uniqueId);

    // Store complete subtree HTML for nested elements
    const entry = {
      id,
      root: element,
      html: element.outerHTML, // Complete subtree including nested elements
      uniqueId,
      tagName: element.tagName,
      textContent: element.textContent
    };

    this.#registry.set(id, entry);
    this.logger.debug(`Registered placeholder [${id}]`, {
      tagName: element.tagName,
      uniqueId,
      htmlLength: entry.html.length
    });

    return id;
  }

  /**
   * Get a placeholder by ID
   * @param {number} id - The placeholder ID
   * @returns {HTMLElement|null} The original element or null if not found
   */
  getPlaceholder(id) {
    const entry = this.#registry.get(id);
    if (!entry) {
      this.logger.warn(`Placeholder [${id}] not found in registry`);
      return null;
    }

    // Check if element is still in DOM
    if (document.contains(entry.root)) {
      return entry.root;
    }

    this.logger.warn(`Placeholder [${id}] element no longer in DOM`);
    return null;
  }

  /**
   * Get a placeholder with recovery mechanism
   * Attempts to recover lost DOM references using unique identifier
   * @param {number} id - The placeholder ID
   * @returns {HTMLElement|null} The original element or null if not found
   */
  getPlaceholderOrRecover(id) {
    const entry = this.#registry.get(id);
    if (!entry) {
      this.logger.warn(`Placeholder [${id}] not found in registry`);
      return null;
    }

    // If reference is still valid, return it
    if (entry.root && document.contains(entry.root)) {
      return entry.root;
    }

    // Attempt recovery using unique identifier
    if (entry.uniqueId) {
      const recovered = document.querySelector(`[data-aiwc-original-id="${entry.uniqueId}"]`);
      if (recovered) {
        entry.root = recovered; // Update reference
        this.logger.debug(`Recovered placeholder [${id}] using unique identifier`);
        return recovered;
      }
    }

    this.logger.warn(`Could not recover placeholder [${id}]`);
    return null;
  }

  /**
   * Get the HTML for a placeholder
   * @param {number} id - The placeholder ID
   * @returns {string|null} The HTML string or null if not found
   */
  getPlaceholderHTML(id) {
    const entry = this.#registry.get(id);
    return entry ? entry.html : null;
  }

  /**
   * Get all placeholder IDs
   * @returns {number[]} Array of placeholder IDs
   */
  getAllIds() {
    return Array.from(this.#registry.keys());
  }

  /**
   * Get the number of registered placeholders
   * @returns {number} The count of placeholders
   */
  get size() {
    return this.#registry.size;
  }

  /**
   * Check if registry is empty
   * @returns {boolean} True if no placeholders registered
   */
  isEmpty() {
    return this.#registry.size === 0;
  }

  /**
   * Set streaming state
   * @param {boolean} isStreaming - Whether streaming is active
   */
  setStreamingState(isStreaming) {
    this.#isStreaming = isStreaming;
    this.logger.debug(`Streaming state set to: ${isStreaming}`);
  }

  /**
   * Get streaming state
   * @returns {boolean} Whether streaming is active
   */
  isStreaming() {
    return this.#isStreaming;
  }

  /**
   * Get registry entries for debugging
   * @returns {Object} Debug information
   */
  getDebugInfo() {
    const entries = [];
    for (const [id, entry] of this.#registry) {
      entries.push({
        id,
        tagName: entry.tagName,
        uniqueId: entry.uniqueId,
        htmlLength: entry.html.length,
        inDOM: entry.root && document.contains(entry.root)
      });
    }
    return {
      count: this.#registry.size,
      isStreaming: this.#isStreaming,
      entries
    };
  }

  /**
   * Clear all placeholders and cleanup DOM attributes
   * This should be called after translation completion or on error
   */
  clear(blockContainer = null) {
    if (this.#registry.size === 0) {
      this.logger.debug('Registry already empty');
      return;
    }

    // Cleanup temporary attributes from DOM
    if (blockContainer) {
      cleanupPlaceholderIds(blockContainer);
    } else {
      // If no container provided, try to cleanup all marked elements
      const allMarked = document.querySelectorAll('[data-aiwc-original-id]');
      allMarked.forEach(el => el.removeAttribute('data-aiwc-original-id'));
      this.logger.debug(`Cleaned up ${allMarked.length} elements from global DOM`);
    }

    const count = this.#registry.size;
    this.#registry.clear();
    this.#nextId = 0;
    this.#isStreaming = false;

    this.logger.debug(`Cleared ${count} placeholders from registry`);
  }

  /**
   * Validate that all placeholders are still recoverable
   * @returns {Object} Validation result with valid/invalid IDs
   */
  validate() {
    const valid = [];
    const invalid = [];

    for (const [id] of this.#registry) {
      const element = this.getPlaceholderOrRecover(id);
      if (element) {
        valid.push(id);
      } else {
        invalid.push(id);
      }
    }

    return {
      valid,
      invalid,
      validCount: valid.length,
      invalidCount: invalid.length
    };
  }
}

/**
 * Cleanup temporary placeholder attributes from DOM
 * CRITICAL: Always call this after translation completion to prevent addon trace pollution
 *
 * @param {HTMLElement} blockContainer - The block container to cleanup
 * @returns {number} Number of elements cleaned
 */
export function cleanupPlaceholderIds(blockContainer) {
  const markedElements = blockContainer.querySelectorAll('[data-aiwc-original-id]');
  let cleanedCount = 0;

  for (const element of markedElements) {
    element.removeAttribute('data-aiwc-original-id');
    cleanedCount++;
  }

  const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'PlaceholderRegistry');
  logger.debug(`Cleaned up ${cleanedCount} placeholder ID attributes`);

  return cleanedCount;
}

/**
 * Export singleton instance for convenience
 */
export const placeholderRegistry = new PlaceholderRegistry();
