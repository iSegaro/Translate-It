import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { hoverPreviewLookup } from '@/features/shared/hover-preview/HoverPreviewLookup.js';
import { PAGE_TRANSLATION_ATTRIBUTES } from '@/features/page-translation/PageTranslationConstants.js';
import { detectDirectionFromContent, applyNodeDirection, BIDI_MARKS } from '@/utils/dom/DomDirectionManager.js';

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'BlockGroupReconstructor');

/**
 * Reconstructor engine for whitespace-marker based translation block reconstruction.
 * Implements strict all-or-nothing transactional safety, pre-apply DOM revalidation,
 * printable segment markers [---SEG:nN---] with unescaping, and flicker prevention.
 */
export class BlockGroupReconstructor {
  /**
   * Concatenates TranslationUnit texts into a single string joined by printable markers.
   *
   * @param {TranslationUnit[]} units - Array of TranslationUnits in the block group
   * @returns {string} The assembled block text
   */
  static injectMarkers(units) {
    if (!units || units.length === 0) return '';
    
    // First node start is block start (no marker prefix)
    let result = units[0].text;
    
    for (let i = 1; i < units.length; i++) {
      result += `[--SEG:${units[i].id}--]${units[i].text}`;
    }
    
    return result;
  }

  /**
   * Splitting and validating the translated block text.
   * Ensures absolute corruption detection and strict segment/UID order matching.
   *
   * @param {string} translatedText - Raw translated block text from LLM
   * @param {TranslationUnit[]} expectedUnits - The expected TranslationUnits in order
   * @returns {Object[]} Parsed segment objects { id, text }
   * @throws {Error} If markers are corrupted, count mismatches, or UID order is broken
   */
  static splitTranslatedBlock(translatedText, expectedUnits) {
    if (!translatedText || typeof translatedText !== 'string') {
      throw new Error('Translated text is empty or invalid');
    }

    // Split text using the printable marker regex (captures UIDs in alternating indices)
    const parts = translatedText.split(/\[--SEG:(n\d+)--\]/);
    
    const segments = [];
    // The first segment has no leading marker, maps to first expected unit
    segments.push({
      id: expectedUnits[0].id,
      text: parts[0] || ''
    });

    // Subsequent segments alternating UID and content
    for (let i = 1; i < parts.length; i += 2) {
      const id = parts[i];
      const text = parts[i + 1] || '';
      segments.push({ id, text });
    }

    // --- Strict Corruption Detection Validation Gates ---
    
    // 1. Verify exact segment count matches expected
    if (segments.length !== expectedUnits.length) {
      throw new Error(`Segment count mismatch: expected ${expectedUnits.length}, received ${segments.length}`);
    }

    // 2. Verify each segment UID maps perfectly in the expected sequential order
    for (let i = 0; i < expectedUnits.length; i++) {
      if (segments[i].id !== expectedUnits[i].id) {
        throw new Error(`Segment UID sequence mismatch: expected ${expectedUnits[i].id}, received ${segments[i].id}`);
      }
    }

    return segments;
  }

  /**
   * Applies the parsed translations atomically to the DOM.
   * Synchronously performs connection validation check first, ensuring 100% rollback safety.
   *
   * @param {TranslationUnit[]} expectedUnits - The extracted TranslationUnits
   * @param {string} translatedText - The raw translated block text
   * @param {string} targetLanguage - The target language code
   * @param {HTMLElement} rootElement - The active translation root element
   * @returns {boolean} True if successfully reconstructed and written
   * @throws {Error} If connection validation fails, marker parsing fails, or state is stale
   */
  static apply(expectedUnits, translatedText, targetLanguage, rootElement) {
    if (!expectedUnits || expectedUnits.length === 0) {
      return false;
    }

    const blockId = expectedUnits[0].blockId;
    logger.debug(`[Reconstructor] Starting apply for block group ${blockId}`);

    // --- Read-Only Validation Phase (Pre-Apply Connection Revalidation) ---
    for (const unit of expectedUnits) {
      if (!unit.node || !unit.node.isConnected) {
        throw new Error(`Stale or detached DOM node reference for segment ${unit.id}`);
      }
    }

    // --- Parsing & Structural Verification Phase ---
    // If splitting throws, it aborts before any DOM mutations begin (all-or-nothing rollback)
    const parsedSegments = this.splitTranslatedBlock(translatedText, expectedUnits);

    // --- Mutation Phase (Synchronous DOM writes with Flicker Prevention) ---
    const firstNodeParent = expectedUnits[0].node.parentElement;
    
    try {
      // 1. Flicker Prevention: synchronous visibility gate
      if (firstNodeParent) {
        firstNodeParent.classList.add('ti-translating');
      }

      // 2. Synchronous Write loop with unescaping, whitespace, bidi, and direction restoration
      for (let i = 0; i < expectedUnits.length; i++) {
        const unit = expectedUnits[i];
        const segment = parsedSegments[i];
        
        // Reversible unescaping: convert [--ESCAPED_SEG: back to [--SEG:
        const cleanText = segment.text.replace(/\[--ESCAPED_SEG:/g, '[--SEG:');
        const trimmedTranslation = cleanText.trim();
        
        // 1. Register original text before modification for Hover Tooltip
        const originalText = unit.node.textContent;
        hoverPreviewLookup.add(unit.node, originalText);

        // 2. Mark the immediate parent element as having original text (Surgical marking)
        const parentElement = unit.node.parentElement;
        if (parentElement && parentElement.getAttribute(PAGE_TRANSLATION_ATTRIBUTES.HAS_ORIGINAL) !== 'true') {
          parentElement.setAttribute(PAGE_TRANSLATION_ATTRIBUTES.HAS_ORIGINAL, 'true');
        }

        // BiDi Text & Punctuation Support
        const detectedDir = detectDirectionFromContent(trimmedTranslation);
        const bidiMark = detectedDir === 'rtl' ? BIDI_MARKS.RLM : BIDI_MARKS.LRM;

        // Boundary strip-and-restore reconstruction with BiDi mark injection
        const finalValue = unit.leadingWS + bidiMark + trimmedTranslation + bidiMark + unit.trailingWS;
        
        // Mutate node
        unit.node.nodeValue = finalValue;

        // Apply node direction
        applyNodeDirection(unit.node, targetLanguage, rootElement);
      }

      return true;
    } finally {
      // Restore visibility immediately
      if (firstNodeParent) {
        firstNodeParent.classList.remove('ti-translating');
      }
    }
  }
}
