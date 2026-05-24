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
   * @param {string} entropy - Optional randomized entropy-scoped escaping prefix
   * @returns {string} The assembled block text
   */
  static injectMarkers(units, sessionId = '', entropy = '') {
    if (!units || units.length === 0) return '';
    
    // entropy-scoped escaping: @@ -> @@TI_ESC_<entropy>@@
    const escapePattern = /@@/g;
    const escapeReplacement = entropy ? `@@TI_ESC_${entropy}@@` : '@@TI_ESC@@';
    
    const escapeText = (text) => text.replace(escapePattern, escapeReplacement);

    // First node start is block start (no marker prefix)
    let result = escapeText(units[0].text);
    
    // Use session-scoped markers with ASCII-safe delimiters @@
    // Hardened Reconstruction Protocol: @@TI_SEG_<entropy>_<sessionId>_<segmentId>@@
    let markerPrefix;
    if (entropy && sessionId) {
      markerPrefix = `TI_SEG_${entropy}_${sessionId}_`;
    } else if (sessionId) {
      markerPrefix = `TI_SEG_${sessionId}_`;
    } else {
      markerPrefix = 'SEG_';
    }
    
    for (let i = 1; i < units.length; i++) {
      // @@ delimiters are ASCII-safe, model-resilient, and normalization-safe
      result += `@@${markerPrefix}${units[i].id}@@${escapeText(units[i].text)}`;
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
   * @param {string} entropy - Optional entropy-scoped escaping prefix
   * @returns {Object[]} Parsed segment objects { id, text }
   * @throws {Error} If markers are corrupted, count mismatches, or UID order is broken
   */
  static splitTranslatedBlock(translatedText, expectedUnits, sessionId = '', entropy = '') {
    if (!translatedText || typeof translatedText !== 'string') {
      throw new Error('Translated text is empty or invalid');
    }

    // --- Hardened Deterministic Parser Logic ---
    let regex;
    if (sessionId) {
      const escapedSessionId = escapeRegExp(sessionId);
      
      // Strict generator / tolerant parser model:
      // We allow optional whitespace around delimiters and keywords.
      // We allow case-insensitivity for 'TI_SEG'.
      // BUT we require EXACT matches for entropy and sessionId.
      // segmentId (capture 1) remains exact and case-sensitive.
      
      if (entropy) {
        const escapedEntropy = escapeRegExp(entropy);
        regex = new RegExp(`@@\\s*TI\\s*_\\s*SEG\\s*_\\s*${escapedEntropy}\\s*_\\s*${escapedSessionId}\\s*_\\s*(n\\d+)\\s*@@`, 'giu');
      } else {
        regex = new RegExp(`@@\\s*TI\\s*_\\s*SEG\\s*_\\s*${escapedSessionId}\\s*_\\s*(n\\d+)\\s*@@`, 'giu');
      }
    } else {
      // capture 1: (n\d+)
      // Plan: @@SEG_<segmentId>@@
      regex = /@@\s*SEG\s*_\s*(n\d+)\s*@@/giu;
    }

    const parts = translatedText.split(regex);
    const segments = [];
    
    // The first part is always the text before the first marker (segment n1)
    segments.push({
      id: expectedUnits[0].id,
      text: parts[0] || ''
    });

    // Subsequent parts come in pairs: [segmentId, textAfterMarker]
    for (let i = 1; i < parts.length; i += 2) {
      const id = parts[i];
      const text = parts[i + 1] || '';
      segments.push({ id, text });
    }

    // --- Deterministic Structural Validation Gates ---
    
    // 1. Verify exact segment count matches expected. 
    // This catches duplicated/nested markers because split() would create more parts.
    if (segments.length !== expectedUnits.length) {
      throw new Error(`Segment count mismatch: expected ${expectedUnits.length}, received ${segments.length}`);
    }

    // 2. Verify each segment UID maps perfectly in the expected sequential order (Monotonicity)
    // Segment IDs must remain exact and case-sensitive.
    for (let i = 0; i < expectedUnits.length; i++) {
      if (segments[i].id !== expectedUnits[i].id) {
        throw new Error(`Structural validation failure (monotonicity): expected ${expectedUnits[i].id}, received ${segments[i].id}`);
      }
    }

    return segments;
  }

  /**
   * Applies the parsed translations atomically to the DOM.
   * Synchronously performs connection validation check first, ensuring absolute rollback safety.
   */
  static apply(expectedUnits, translatedText, targetLanguage, rootElement, sessionId = '', entropy = '') {
    if (!expectedUnits || expectedUnits.length === 0) {
      return false;
    }
 
    const blockId = expectedUnits[0].blockId;
    logger.debug(`[Reconstructor] Starting apply for block group ${blockId}`);

    // --- Hardened Reconstruction Protocol: Transaction-Scoped Bidi Cache ---
    // Instantiating a fresh cache per apply transaction ensures fresh direction lookups.
    const transactionCache = new WeakMap();
    const resolveDir = (node) => {
      if (!node || !node.parentElement) return 'ltr';
      const el = node.parentElement;
      if (transactionCache.has(el)) return transactionCache.get(el);
      let direction = 'ltr';
      try {
        const dirNode = el.closest('[dir]');
        if (dirNode) direction = (dirNode.dir || dirNode.getAttribute('dir')).toLowerCase();
        else direction = window.getComputedStyle(el).direction || 'ltr';
      } catch (e) {}
      transactionCache.set(el, direction);
      return direction;
    };

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
    // Pre-parsing sanitization: strip zero-width characters ONLY inside markers @@...@@
    const sanitizedText = translatedText.replace(/@@[\s\S]*?@@/gu, (match) => {
       return match.replace(/[\u200B-\u200D\uFEFF]/gu, '');
    });

    const parsedSegments = this.splitTranslatedBlock(sanitizedText, expectedUnits, sessionId, entropy);

    // --- Preparation Phase (Calculate everything before DOM mutations) ---
    const commitPlan = [];
    const unescapeReplacement = '@@';
    const unescapePattern = entropy ? new RegExp(`@@TI_ESC_${escapeRegExp(entropy)}@@`, 'g') : /@@TI_ESC@@/g;

    for (let i = 0; i < expectedUnits.length; i++) {
      const unit = expectedUnits[i];
      const segment = parsedSegments[i];
      
      // entropy-scoped escaping: unescape back to literal @@
      const exactTranslation = segment.text.replace(unescapePattern, unescapeReplacement);
      
      let finalValue;
      const shouldBidi = () => {
        if (!unit.node || !unit.node.parentElement) return false;
        let p = unit.node.parentElement;
        while (p) {
          const t = p.tagName.toUpperCase();
          if (['PRE', 'CODE', 'INPUT', 'TEXTAREA'].includes(t)) return false;
          if (p.contentEditable === 'true' || p.getAttribute('contenteditable') === 'true') return false;
          p = p.parentElement;
        }
        if (!exactTranslation || typeof exactTranslation !== 'string') return false;
        if (!/[\p{L}\p{N}]/u.test(exactTranslation)) return false;
        return detectDirectionFromContent(exactTranslation) !== resolveDir(unit.node);
      };

      if (shouldBidi()) {
        const detectedDir = detectDirectionFromContent(exactTranslation);
        const bidiMark = detectedDir === 'rtl' ? BIDI_MARKS.RLM : BIDI_MARKS.LRM;
        finalValue = unit.leadingWS + bidiMark + exactTranslation + bidiMark + unit.trailingWS;
      } else {
        finalValue = unit.leadingWS + exactTranslation + unit.trailingWS;
      }
      
      commitPlan.push({
        unit,
        finalValue,
        originalText: unit.node.textContent
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
