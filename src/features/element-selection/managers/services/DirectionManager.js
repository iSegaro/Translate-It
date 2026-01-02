import { getScopedLogger } from "../../../../shared/logging/logger.js";
import { LOG_COMPONENTS } from "../../../../shared/logging/logConstants.js";
import { isRTLLanguage, detectTextDirectionFromContent } from "../../utils/textDirection.js";

/**
 * DirectionManager - RTL/LTR direction management
 * Handles direction detection, application, and text container parent detection
 *
 * Responsibilities:
 * - RTL/LTR direction detection and application
 * - Text container parent detection
 * - Direction attribute management
 * - Proper text alignment for translated content
 *
 * @memberof module:features/element-selection/managers/services
 */
export class DirectionManager {
  constructor(uiManager) {
    this.uiManager = uiManager;
    this.logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'DirectionManager');
  }

  /**
   * Initialize the direction manager
   */
  initialize() {
    this.logger.debug('DirectionManager initialized');
  }

  /**
   * Apply RTL direction to parent elements containing translated segments
   * Simplified approach - just applies dir attribute, no wrapper structure
   * This avoids double-wrapping and spacing collapse issues
   * @param {HTMLElement} targetElement - The element containing translated content
   * @param {Map} translations - Map of original text to translated text
   * @param {string} messageId - Message ID for tracking (unused in simplified version)
   * @param {string} targetLanguage - Target language code
   */
  async applyImmersiveTranslatePattern(targetElement, translations, _messageId, targetLanguage) {
    this.logger.debug('Applying RTL direction to target element', {
      tagName: targetElement.tagName,
      translationsSize: translations.size
    });

    // CRITICAL FIX: Analyze actual translated content to determine direction
    // This handles bidirectional translation where targetLanguage might not match actual translation language
    // Sample a few translations to detect the actual direction of translated content
    let detectedDirection = 'ltr';
    let rtlCount = 0;
    let ltrCount = 0;
    let samplesChecked = 0;
    let hasRTLCharacters = false;

    // Regex for Strong RTL characters (Arabic, Hebrew, Syriac, Thaana, NKo, etc.)
    const rtlCharRegex = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u07C0-\u07FF\u08A0-\u08FF\uFB1D-\uFB4F\uFB50-\uFDFF\uFE70-\uFEFF]/;

    // Sample up to 15 translations to determine direction
    // CRITICAL FIX: Sample ALL translations, not just changed ones
    // This ensures accurate direction detection even when some content remains unchanged
    // Increased sample size to avoid bias from short initial segments (e.g. usernames)
    for (const translated of translations.values()) {
      if (samplesChecked >= 15) break;
      // Count all translations including unchanged ones for accurate direction detection
      if (translated) {
        const dir = detectTextDirectionFromContent(translated, null); // Don't pass targetLanguage - rely on content
        if (dir === 'rtl') {
          rtlCount++;
        } else {
          ltrCount++;
        }

        // Check for presence of stronger RTL characters even if the string is mostly LTR
        if (!hasRTLCharacters && rtlCharRegex.test(translated)) {
          hasRTLCharacters = true;
        }

        samplesChecked++;
      }
    }

    // Determine direction based on actual translated content
    if (samplesChecked > 0) {
      // Improved Heuristic:
      // If the User's Target Language is RTL (e.g. Persian), we should prioritize RTL direction
      // if there is ANY significant RTL content found.
      // This fixes issues where mixed content (e.g. "ZenML: یکی...") is dominantly LTR by char count
      // but should be displayed as RTL in a Persian interface.
      if (isRTLLanguage(targetLanguage) && hasRTLCharacters) {
        detectedDirection = 'rtl';
      } else {
        // Use majority direction for LTR targets or if no RTL content found
        detectedDirection = rtlCount > ltrCount ? 'rtl' : 'ltr';
      }
    } else {
      // No actual translations found, fall back to target language
      detectedDirection = isRTLLanguage(targetLanguage) ? 'rtl' : 'ltr';
    }

    const isRTL = detectedDirection === 'rtl';
    const processedParents = new Set();

    // Find all segment elements
    const segmentElements = targetElement.querySelectorAll('[data-segment-id]');

    // CRITICAL FIX: Clean up segments themselves to allow continuous flow
    // Segments often come with dir="auto/rtl" and unicode-bidi: isolate which breaks the sentence flow
    // We must neutralize them so they participate in the container's 'plaintext' flow
    for (const segment of segmentElements) {
       // Remove dir to allow inheritance
       if (segment.hasAttribute('dir')) {
         segment.removeAttribute('dir');
       }
       
       // Reset isolation to normal
       // We check style directly because it's usually set via style attribute on segments
       if (segment.style.unicodeBidi) {
         segment.style.unicodeBidi = 'normal';
       }
    }

    // Identify all elements that need direction adjustments
    // We separate them into 'Text Containers' (Block-like) and 'Inline Wrappers'
    const textContainers = new Set();
    const inlineWrappers = new Set();
    
    // Always include the main target element as a container (even if inline, plaintext works)
    textContainers.add(targetElement);

    // Traverse ancestors for each segment to categorize elements
    for (const segment of segmentElements) {
      let current = segment.parentNode;
      while (current && current !== document.body) {
         // Stop if we go past the target element
        if (!targetElement.contains(current) && targetElement !== current) break;
        if (current === targetElement) {
           break; // Already added
        }

        const computedStyle = window.getComputedStyle(current);
        const display = computedStyle.display;

        // Check if strictly inline (transparent wrapper)
        if (display === 'inline') {
          inlineWrappers.add(current);
        } else {
          // It's a block, inline-block, list-item, etc. -> Text Container
          // This governs the text flow/alignment
          textContainers.add(current);
        }
        
        current = current.parentNode;
      }
    }

    // APPLY: Text Containers -> Plaintext + Text-Align
    for (const container of textContainers) {
       // 1. Remove dir attribute (Store original)
       if (container.hasAttribute('dir')) {
         if (!container.hasAttribute('data-original-direction')) {
           container.setAttribute('data-original-direction', container.getAttribute('dir') || '');
         }
         container.removeAttribute('dir');
       }

       // 2. Set unicode-bidi: plaintext (Store original)
       if (!container.hasAttribute('data-original-unicode-bidi')) {
         container.setAttribute('data-original-unicode-bidi', container.style.unicodeBidi || '');
       }
       container.style.unicodeBidi = 'plaintext';

       // 3. Set text-align (Store original)
       // We assume textContainers (blocks) support text-align.
       // Even if inline-block, it supports text-align (for its content? no, for itself relative to parent? No).
       // Actually text-align on inline-block affects likely nothing inside unless specific?
       // But safe to set.
       if (!container.hasAttribute('data-original-text-align')) {
         container.setAttribute('data-original-text-align', container.style.textAlign || '');
       }

       // CRITICAL: Respect original center/justify alignment
       // Only swap left/right based on direction
       const originalAlign = container.getAttribute('data-original-text-align') ||
                            container.style.textAlign ||
                            window.getComputedStyle(container).textAlign;

       if (originalAlign === 'center' || originalAlign === 'justify') {
         container.style.textAlign = originalAlign;
       } else {
         container.style.textAlign = isRTL ? 'right' : 'left';
       }

       // 4. Lang
       if (targetLanguage) {
         if (!container.hasAttribute('data-original-lang')) {
           container.setAttribute('data-original-lang', container.getAttribute('lang') || '');
         }
         container.setAttribute('lang', targetLanguage);
       }
    }

    // APPLY: Inline Wrappers -> Normal (Inherit)
    for (const wrapper of inlineWrappers) {
      // 1. Remove dir attribute (Store original)
       if (wrapper.hasAttribute('dir')) {
         if (!wrapper.hasAttribute('data-original-direction')) {
           wrapper.setAttribute('data-original-direction', wrapper.getAttribute('dir') || '');
         }
         wrapper.removeAttribute('dir');
       }

       // 2. Reset unicode-bidi to normal (Store original)
       // This removes isolation and allows text to flow with the container
       const currentBidi = wrapper.style.unicodeBidi;
       if (currentBidi || getComputedStyle(wrapper).unicodeBidi !== 'normal') {
          if (!wrapper.hasAttribute('data-original-unicode-bidi')) {
             wrapper.setAttribute('data-original-unicode-bidi', wrapper.style.unicodeBidi || '');
          }
          wrapper.style.unicodeBidi = 'normal';
       }

       // 3. Reset text-align (inline shouldn't have it, but clear just in case)
       if (wrapper.style.textAlign) {
         if (!wrapper.hasAttribute('data-original-text-align')) {
           wrapper.setAttribute('data-original-text-align', wrapper.style.textAlign);
         }
         wrapper.style.textAlign = '';
       }

       // 4. Lang
       if (targetLanguage) {
          if (!wrapper.hasAttribute('data-original-lang')) {
            wrapper.setAttribute('data-original-lang', wrapper.getAttribute('lang') || '');
          }
          wrapper.setAttribute('lang', targetLanguage);
       }
    }

    this.logger.debug(`RTL direction applied to ${textContainers.size} containers, ${inlineWrappers.size} inline wrappers`);
  }

  /**
   * Find the text container parent element for a segment
   * This looks for the nearest parent that is a text container (like span, p, etc.)
   * @param {HTMLElement} segment - The segment element
   * @returns {HTMLElement|null} The text container parent or null
   */
  _findTextContainerParent(segment) {
    const textContainerClasses = new Set([
      'Text__StyledText',
      'search-match',
      'prc-Text-Text'
    ]);

    let parent = segment.parentNode;
    while (parent && parent !== document.body) {
      // Check if this parent has text-related class
      const classList = parent.classList ? Array.from(parent.classList) : [];
      const hasTextClass = classList.some(cls =>
        Array.from(textContainerClasses).some(textClass => cls.includes(textClass))
      );

      if (hasTextClass) {
        return parent;
      }

      parent = parent.parentNode;
    }

    return null;
  }

  /**
   * Apply direction correction during streaming translation
   * Optimized version that processes only currently translated segments.
   * Uses actual translated content for direction detection (accurate).
   * @param {HTMLElement} targetElement - The element containing translated content
   * @param {string} targetLanguage - Target language code (used as fallback, not primary)
   */
  async applyStreamingDirection(targetElement, targetLanguage) {
    this.logger.debug('Applying streaming direction correction', {
      tagName: targetElement.tagName
    });

    // Find translated segments (single query)
    const segmentElements = targetElement.querySelectorAll('[data-segment-id]');

    if (segmentElements.length === 0) {
      return;
    }

    // CRITICAL: Detect direction from actual translated content, not just targetLanguage
    // This ensures correct direction when translating to/from RTL languages
    let rtlCount = 0;
    let ltrCount = 0;
    let samplesChecked = 0;
    let hasRTLCharacters = false;

    // Regex for Strong RTL characters
    const rtlCharRegex = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u07C0-\u07FF\u08A0-\u08FF\uFB1D-\uFB4F\uFB50-\uFDFF\uFE70-\uFEFF]/;

    // Sample up to 15 translated segments to determine direction
    for (const segment of segmentElements) {
      if (samplesChecked >= 15) break;

      const text = segment.textContent?.trim();
      if (text) {
        const dir = detectTextDirectionFromContent(text, null); // Don't pass targetLanguage - rely on content
        if (dir === 'rtl') {
          rtlCount++;
        } else {
          ltrCount++;
        }

        // Check for presence of RTL characters
        if (!hasRTLCharacters && rtlCharRegex.test(text)) {
          hasRTLCharacters = true;
        }

        samplesChecked++;
      }
    }

    // Determine direction based on actual translated content
    let isRTL = false;
    if (samplesChecked > 0) {
      // Use the same logic as applyImmersiveTranslatePattern
      if (isRTLLanguage(targetLanguage) && hasRTLCharacters) {
        isRTL = true;
      } else {
        isRTL = rtlCount > ltrCount;
      }
    } else {
      // No content found, fall back to target language
      isRTL = isRTLLanguage(targetLanguage);
    }

    // Clean up segments and collect containers in single pass
    const containers = new Set();
    containers.add(targetElement);

    // Single pass: clean segments + find containers
    for (const segment of segmentElements) {
      // Remove segment-level direction so they flow with container
      if (segment.hasAttribute('dir')) {
        segment.removeAttribute('dir');
      }
      if (segment.style.unicodeBidi) {
        segment.style.unicodeBidi = 'normal';
      }

      // Find containers up to target element
      let current = segment.parentNode;
      while (current && current !== document.body && targetElement.contains(current)) {
        if (current === targetElement) break;

        const display = window.getComputedStyle(current).display;
        if (display !== 'inline') {
          containers.add(current);
        }
        current = current.parentNode;
      }
    }

    // Apply direction to containers
    for (const container of containers) {
      if (!container.hasAttribute('data-original-unicode-bidi')) {
        container.setAttribute('data-original-unicode-bidi', container.style.unicodeBidi || '');
      }
      if (!container.hasAttribute('data-original-text-align')) {
        container.setAttribute('data-original-text-align', container.style.textAlign || '');
      }

      container.style.unicodeBidi = 'plaintext';

      // CRITICAL: Respect original center/justify alignment
      // Only swap left/right based on direction
      const originalAlign = container.getAttribute('data-original-text-align') ||
                           container.style.textAlign ||
                           window.getComputedStyle(container).textAlign;

      if (originalAlign === 'center' || originalAlign === 'justify') {
        container.style.textAlign = originalAlign;
      } else {
        container.style.textAlign = isRTL ? 'right' : 'left';
      }
    }

    this.logger.debug(`Streaming direction: ${containers.size} containers, ${segmentElements.length} segments`);
  }

  /**
   * Cleanup direction manager
   */
  cleanup() {
    this.logger.debug('DirectionManager cleanup completed');
  }
}
