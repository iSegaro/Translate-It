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
    for (const [original, translated] of translations.entries()) {
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

    this.logger.debug('Text direction determined from actual translated content', {
      detectedDirection,
      targetLanguage,
      isRTL,
      samplesChecked,
      rtlCount,
      ltrCount
    });

    // Find all segment elements
    const segmentElements = targetElement.querySelectorAll('[data-segment-id]');

    this.logger.debug(`Found ${segmentElements.length} segment elements for RTL direction`);

    // Group segments by their parent element
    const parentToSegments = new Map();
    for (const segment of segmentElements) {
      const parent = segment.parentNode;
      if (parent && parent !== targetElement) {
        if (!parentToSegments.has(parent)) {
          parentToSegments.set(parent, []);
        }
        parentToSegments.get(parent).push(segment);
      }
    }

    this.logger.debug(`Grouped segments into ${parentToSegments.size} unique parents`);

    // CRITICAL FIX: Check if targetElement has unicode-bidi: embed from the page
    // This can prevent text-align from working properly
    const hasUnicodeBidiEmbed = targetElement.style.unicodeBidi === 'embed' ||
                                getComputedStyle(targetElement).unicodeBidi === 'embed';

    // CRITICAL FIX: Apply proper text alignment based on DETECTED direction from translated content
    // RTL languages: align right, LTR languages: align left (or restore original)
    // This aligns text WITHOUT changing the element's dir attribute
    // (Changing dir would affect layout structure which is not desired)
    if (isRTL) {
      // CRITICAL FIX: If targetElement has unicode-bidi: embed, we need to also set dir
      // on the targetElement itself for proper RTL display, as text-align alone is not enough
      // IMPORTANT: We also need to change unicode-bidi to 'isolate' for proper RTL display
      if (hasUnicodeBidiEmbed) {
        // Store original unicode-bidi if not already stored
        if (!targetElement.hasAttribute('data-original-unicode-bidi')) {
          const originalBidi = targetElement.style.unicodeBidi || '';
          targetElement.setAttribute('data-original-unicode-bidi', originalBidi);
        }
        // Override unicode-bidi to isolate for proper RTL display
        targetElement.style.unicodeBidi = 'isolate';

        if (!targetElement.hasAttribute('data-original-direction')) {
          const currentDir = targetElement.getAttribute('dir');
          if (currentDir) {
            targetElement.setAttribute('data-original-direction', currentDir);
          } else {
            targetElement.setAttribute('data-original-direction', '');
          }
        }
        targetElement.setAttribute('dir', 'rtl');
        if (targetLanguage) {
          targetElement.setAttribute('lang', targetLanguage);
        }
        this.logger.debug('Applied dir attribute and override unicode-bidi to targetElement', {
          tagName: targetElement.tagName,
          hasUnicodeBidiEmbed,
          targetLanguage,
          newUnicodeBidi: 'isolate'
        });
      }

      this.logger.debug('Applied RTL text alignment to main text container', {
        tagName: targetElement.tagName,
        detectedDirection,
        targetLanguage,
        hasUnicodeBidiEmbed
      });
    } else {
      // CRITICAL FIX: If targetElement has unicode-bidi: embed, also set ltr dir
      // IMPORTANT: We also need to change unicode-bidi to 'isolate' for proper LTR display
      if (hasUnicodeBidiEmbed) {
        // Store original unicode-bidi if not already stored
        if (!targetElement.hasAttribute('data-original-unicode-bidi')) {
          const originalBidi = targetElement.style.unicodeBidi || '';
          targetElement.setAttribute('data-original-unicode-bidi', originalBidi);
        }
        // Override unicode-bidi to isolate for proper LTR display
        targetElement.style.unicodeBidi = 'isolate';

        if (!targetElement.hasAttribute('data-original-direction')) {
          const currentDir = targetElement.getAttribute('dir');
          if (currentDir) {
            targetElement.setAttribute('data-original-direction', currentDir);
          } else {
            targetElement.setAttribute('data-original-direction', '');
          }
        }
        targetElement.setAttribute('dir', 'ltr');
        if (targetLanguage) {
          targetElement.setAttribute('lang', targetLanguage);
        }
        this.logger.debug('Applied dir attribute and override unicode-bidi to targetElement', {
          tagName: targetElement.tagName,
          hasUnicodeBidiEmbed,
          targetLanguage,
          newUnicodeBidi: 'isolate'
        });
      }

      this.logger.debug('Applied LTR text alignment to main text container', {
        tagName: targetElement.tagName,
        detectedDirection,
        targetLanguage,
        hasUnicodeBidiEmbed
      });
    }

    // For each parent, wrap its content with Immersive Translate pattern
    let parentIndex = 0;
    for (const [parent, segments] of parentToSegments) {
      // Skip if already processed
      if (processedParents.has(parent)) continue;
      processedParents.add(parent);

      this.logger.debug(`Processing parent ${parentIndex}`, {
        parentTag: parent.tagName,
        parentClass: parent.className,
        segmentsCount: segments.length,
        firstSegmentId: segments[0]?.getAttribute('data-segment-id')
      });

      // Check if this parent has any translated segments
      let hasTranslatedContent = false;
      for (const segment of segments) {
        const originalText = segment.getAttribute('data-original-text') || segment.textContent;
        const trimmedOriginal = originalText.trim();
        const segmentId = segment.getAttribute('data-segment-id');

        // Look for translation using original text
        let translatedText = null;
        if (translations.has(trimmedOriginal)) {
          translatedText = translations.get(trimmedOriginal);
        } else if (translations.has(originalText)) {
          translatedText = translations.get(originalText);
        }

        this.logger.debug(`Checking segment ${segmentId}`, {
          originalText: originalText.substring(0, 30),
          trimmedOriginal: trimmedOriginal.substring(0, 30),
          foundTranslation: !!translatedText,
          translatedPreview: translatedText ? translatedText.substring(0, 30) : 'NONE'
        });

        if (translatedText && translatedText !== trimmedOriginal) {
          hasTranslatedContent = true;
          break;
        }
      }

      if (!hasTranslatedContent) {
        this.logger.debug(`Skipping parent ${parentIndex} - no translated content found`);
        continue;
      }

      // SIMPLIFIED: Just apply dir attribute directly to parent
      // No wrapper structure - avoids double-wrapping and spacing collapse

      // CRITICAL: Store original direction before changing it (for proper revert)
      if (!parent.hasAttribute('data-original-direction')) {
        const currentDir = parent.getAttribute('dir');
        if (currentDir) {
          parent.setAttribute('data-original-direction', currentDir);
        } else {
          parent.setAttribute('data-original-direction', '');
        }
      }

      parent.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
      if (targetLanguage) {
        parent.setAttribute('lang', targetLanguage);
      }

      // CRITICAL FIX: Check if parent has unicode-bidi: embed from the page
      // This can prevent text-align from working properly
      const parentHasUnicodeBidiEmbed = parent.style.unicodeBidi === 'embed' ||
                                        getComputedStyle(parent).unicodeBidi === 'embed';

      // CRITICAL FIX: Override unicode-bidi to isolate for proper text direction display
      // This prevents parent dir="auto" interference and ensures proper RTL/LTR display
      if (parentHasUnicodeBidiEmbed) {
        // Store original unicode-bidi if not already stored
        if (!parent.hasAttribute('data-original-unicode-bidi')) {
          const originalBidi = parent.style.unicodeBidi || '';
          parent.setAttribute('data-original-unicode-bidi', originalBidi);
        }
        // Override unicode-bidi to isolate for proper text direction display
        parent.style.unicodeBidi = 'isolate';
      } else if (isRTL) {
        // For RTL parents without embed, still set isolate for consistency
        parent.style.unicodeBidi = 'isolate';
      }

      this.logger.debug('Applied dir attribute to parent element', {
        parentTag: parent.tagName,
        parentClass: parent.className,
        dir: isRTL ? 'rtl' : 'ltr',
        targetLanguage
      });

      parentIndex++;
    }

    this.logger.debug('RTL direction applied', {
      processedParentsCount: processedParents.size
    });
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
   * Cleanup direction manager
   */
  cleanup() {
    this.logger.debug('DirectionManager cleanup completed');
  }
}
