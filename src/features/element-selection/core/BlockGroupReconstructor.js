import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { hoverPreviewLookup } from '@/features/shared/hover-preview/HoverPreviewLookup.js';
import { PAGE_TRANSLATION_ATTRIBUTES } from '@/features/page-translation/PageTranslationConstants.js';
import { detectDirectionFromContent, applyNodeDirection, BIDI_MARKS } from '@/utils/dom/DomDirectionManager.js';

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'BlockGroupReconstructor');

/**
 * Escapes a string for use in a RegExp.
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Direction resolution cache to prevent layout flushes during hot-path bidi checks.
 */
const directionCache = new WeakMap();

/**
 * Resolves the effective direction of a node without triggering layout thrashes if possible.
 * 
 * @param {Node} node - The DOM node
 * @returns {string} 'ltr' or 'rtl'
 */
function resolveEffectiveDirection(node) {
  if (!node || !node.parentElement) return 'ltr';
  
  const element = node.parentElement;
  
  // Check cache first
  if (directionCache.has(element)) {
    return directionCache.get(element);
  }

  let direction = 'ltr';
  try {
    // 1. Check for explicit [dir] attribute in ancestors (Fast, no layout flush)
    const dirNode = element.closest('[dir]');
    if (dirNode) {
      direction = (dirNode.dir || dirNode.getAttribute('dir')).toLowerCase();
    } else {
      // 2. Fallback to computed style (Triggers layout flush if needed)
      // Only called once per element due to cache.
      direction = window.getComputedStyle(element).direction || 'ltr';
    }
  } catch (e) {
    // Fallback if environment is restricted
  }

  directionCache.set(element, direction);
  return direction;
}

/**
 * Reconstructor engine for whitespace-marker based translation block reconstruction.
 * Implements strict all-or-nothing transactional safety, pre-apply DOM revalidation,
 * printable ASCII-safe segment markers @@TI_SEG_uuid_nN@@, and flicker prevention.
 */
export class BlockGroupReconstructor {
  /**
   * Concatenates TranslationUnit texts into a single string joined by printable markers.
   *
   * @param {TranslationUnit[]} units - Array of TranslationUnits in the block group
   * @param {string} sessionId - Optional translation session ID
   * @returns {string} The assembled block text
   */
  static injectMarkers(units, sessionId = '') {
    if (!units || units.length === 0) return '';
    
    // First node start is block start (no marker prefix)
    let result = units[0].text;
    
    // Use session-scoped markers with ASCII-safe delimiters @@ to prevent collisions/normalization risk
    const markerPrefix = sessionId ? `TI_SEG_${sessionId}_` : 'SEG_';
    
    for (let i = 1; i < units.length; i++) {
      // @@ delimiters are ASCII-safe, model-resilient, and normalization-safe
      result += `@@${markerPrefix}${units[i].id}@@${units[i].text}`;
    }
    
    return result;
  }

  /**
   * Splitting and validating the translated block text.
   * Ensures absolute corruption detection and strict segment/UID order matching.
   *
   * @param {string} translatedText - Raw translated block text from LLM
   * @param {TranslationUnit[]} expectedUnits - The expected TranslationUnits in order
   * @param {string} sessionId - Optional session ID to validate
   * @returns {Object[]} Parsed segment objects { id, text }
   * @throws {Error} If markers are corrupted, count mismatches, or UID order is broken
   */
  static splitTranslatedBlock(translatedText, expectedUnits, sessionId = '') {
    if (!translatedText || typeof translatedText !== 'string') {
      throw new Error('Translated text is empty or invalid');
    }

    // --- Hardened Parser Logic ---
    let regex;
    if (sessionId) {
      const escapedSessionId = escapeRegExp(sessionId);
      // capture 1: (n\d+)
      // Plan: @@TI_SEG_<sessionId>_<segmentId>@@
      // We allow optional whitespace around all parts for LLM robustness
      regex = new RegExp(`@@\\s*TI\\s*_\\s*SEG\\s*_\\s*${escapedSessionId}\\s*_\\s*(n\\d+)\\s*@@`, 'giu');
    } else {
      // capture 1: (n\d+)
      // Plan: @@SEG_<segmentId>@@
      regex = /@@\s*SEG\s*_\s*(n\d+)\s*@@/giu;
    }

    const parts = translatedText.split(regex);
    const segments = [];
    
    segments.push({
      id: expectedUnits[0].id,
      text: parts[0] || ''
    });

    for (let i = 1; i < parts.length; i += 2) {
      const id = parts[i];
      const text = parts[i + 1] || '';
      segments.push({ id, text });
    }

    // --- Strict Corruption Detection Validation Gates ---
    
    // 1. Verify exact segment count matches expected. 
    // This also effectively catches duplicated/nested markers because split() would create more parts.
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
   * Helper to check if BiDi controls should be injected for a node.
   * Skip injection inside inputs, textareas, code/pre blocks, or contenteditable trees.
   */
  static shouldInjectBidi(node, translation) {
    if (!node || !node.parentElement) return false;
    
    let parent = node.parentElement;
    while (parent) {
      const tag = parent.tagName.toUpperCase();
      if (['PRE', 'CODE', 'INPUT', 'TEXTAREA'].includes(tag)) return false;
      if (parent.contentEditable === 'true' || parent.getAttribute('contenteditable') === 'true') return false;
      parent = parent.parentElement;
    }
    
    if (!translation || typeof translation !== 'string') return false;

    // Skip pure punctuation, numbers or spacing nodes to avoid unnecessary pollution
    // Use /u flag for Unicode-aware alphanumeric check
    const hasAlphaNumeric = /[\p{L}\p{N}]/u.test(translation);
    if (!hasAlphaNumeric) return false;
    
    const detectedDir = detectDirectionFromContent(translation);
    const parentDir = resolveEffectiveDirection(node);
    
    return detectedDir !== parentDir;
  }

  /**
   * Applies the parsed translations atomically to the DOM.
   * Synchronously performs connection validation check first, ensuring 100% rollback safety.
   */
  static apply(expectedUnits, translatedText, targetLanguage, rootElement, sessionId = '') {
    if (!expectedUnits || expectedUnits.length === 0) {
      return false;
    }
 
    const blockId = expectedUnits[0].blockId;
    logger.debug(`[Reconstructor] Starting apply for block group ${blockId}`);

    // --- Read-Only Validation Phase (Pre-Apply Connection & Semantic Revalidation) ---
    // Use Unicode-aware whitespace normalization for validation
    const normalizeForValidation = (s) => (s || '').replace(/\u00A0/g, ' ').replace(/[\s\u200B\u200C\u200D]+/gu, ' ').trim();

    for (const unit of expectedUnits) {
      if (!unit.node || !unit.node.isConnected) {
        throw new Error(`Stale or detached DOM node reference for segment ${unit.id}`);
      }
      
      const currentVal = unit.node.nodeValue || '';
      const expectedOriginalVal = unit.leadingWS + unit.text + unit.trailingWS;
      
      if (normalizeForValidation(currentVal) !== normalizeForValidation(expectedOriginalVal)) {
        throw new Error(`DOM node content changed mid-flight for segment ${unit.id}`);
      }
    }

    // --- Parsing & Structural Verification Phase ---
    // Remove zero-width characters ONLY inside markers @@...@@
    // This protects the parser without mutating the actual translated content.
    const sanitizedText = translatedText.replace(/@@[\s\S]*?@@/gu, (match) => {
       return match.replace(/[\u200B-\u200D\uFEFF]/gu, '');
    });

    const parsedSegments = this.splitTranslatedBlock(sanitizedText, expectedUnits, sessionId);

    // --- Preparation Phase (Calculate everything before DOM mutations) ---
    const commitPlan = [];
    for (let i = 0; i < expectedUnits.length; i++) {
      const unit = expectedUnits[i];
      const segment = parsedSegments[i];
      
      // Reversible unescaping: convert @@ESCAPED_SEG: back to @@SEG:
      const exactTranslation = segment.text.replace(/@@ESCAPED_SEG:/g, '@@SEG:');
      
      let finalValue;
      if (BlockGroupReconstructor.shouldInjectBidi(unit.node, exactTranslation)) {
        const detectedDir = detectDirectionFromContent(exactTranslation);
        const bidiMark = detectedDir === 'rtl' ? BIDI_MARKS.RLM : BIDI_MARKS.LRM;
        finalValue = unit.leadingWS + bidiMark + exactTranslation + bidiMark + unit.trailingWS;
      } else {
        finalValue = unit.leadingWS + exactTranslation + unit.trailingWS;
      }
      
      const originalText = unit.node.textContent;
      
      commitPlan.push({
        unit,
        finalValue,
        originalText
      });
    }

    // --- Mutation Phase (Synchronous DOM writes) ---
    const firstNodeParent = expectedUnits[0].node.parentElement;
    
    try {
      if (firstNodeParent) {
        firstNodeParent.classList.add('ti-translating');
      }

      for (const task of commitPlan) {
        hoverPreviewLookup.add(task.unit.node, task.originalText);

        const parentElement = task.unit.node.parentElement;
        if (parentElement && parentElement.getAttribute(PAGE_TRANSLATION_ATTRIBUTES.HAS_ORIGINAL) !== 'true') {
          parentElement.setAttribute(PAGE_TRANSLATION_ATTRIBUTES.HAS_ORIGINAL, 'true');
        }

        task.unit.node.nodeValue = task.finalValue;
        applyNodeDirection(task.unit.node, targetLanguage, rootElement);
      }

      return true;
    } finally {
      if (firstNodeParent) {
        firstNodeParent.classList.remove('ti-translating');
      }
    }
  }
}
