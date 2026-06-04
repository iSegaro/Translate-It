/**
 * Utility functions for DOM analysis and manipulation
 * Specifically for the "Select Element" feature
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { SELECT_ELEMENT_BLOCK_TAGS } from '@/utils/dom/DomTranslatorConstants.js';
import { DOM_FILTERS } from '@/utils/dom/DomFilters.js';
import { TranslationUnit } from '@/features/translation/ir/TranslationUnit.js';
import { detectDirectionFromContent } from '@/utils/dom/DomDirectionManager.js';
import { TRANSLATION_HTML } from '@/shared/constants/translation.js';

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'DomTranslatorUtils');

/**
 * Shared configuration for elements that should be excluded from translation
 */
const EXCLUDED_TAGS = [
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'TEXTAREA', 'INPUT', 
  'SELECT', 'OPTION', 'BUTTON',
  'HEAD', 'META', 'LINK', 'SVG', 'TIME',
  'RUBY', 'RT', 'RP', 'PRE', 'CODE', 'KBD', 'SAMP'
];

const EXCLUDED_ROLES = ['textbox', 'searchbox', 'combobox', 'code'];
const PREFORMATTED_TAGS = new Set(['PRE', 'CODE', 'KBD', 'SAMP']);

/**
 * Finds the closest block-level parent for a node based on context boundaries
 * @param {Node} node - The DOM node to check
 * @returns {HTMLElement} - The block-level ancestor or document.body
 */
function findClosestBlockParent(node) {
  let parent = node.parentElement;
  while (parent) {
    if (SELECT_ELEMENT_BLOCK_TAGS.has(parent.tagName)) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return document.body;
}

/**
 * Helper to determine if a node or any of its ancestors are preformatted (pre/code/textarea/etc.)
 * or have pre-computed white-space styling.
 * @param {Node} node - The DOM node to check
 * @returns {boolean}
 */
function isPreformatted(node) {
  let parent = node.parentElement;
  while (parent) {
    const tagName = parent.tagName.toUpperCase();
    if (['PRE', 'CODE', 'TEXTAREA', 'SAMP', 'KBD'].includes(tagName)) {
      return true;
    }
    try {
      const style = window.getComputedStyle(parent);
      if (['pre', 'pre-wrap', 'pre-line'].includes(style.whiteSpace)) {
        return true;
      }
    } catch {
      // computed style check failed, traverse parent
    }
    parent = parent.parentElement;
  }
  return false;
}

/**
 * Resolves the computed layout direction for a text node, inheriting parent attributes
 * before falling back to statistical content detection.
 * @param {Node} node - The text node to check
 * @returns {'rtl'|'ltr'|null}
 */
function getDirectionHint(node) {
  let parent = node.parentElement;
  while (parent) {
    const dir = parent.getAttribute('dir');
    if (dir === 'rtl' || dir === 'ltr') {
      return dir;
    }
    parent = parent.parentElement;
  }
  const text = node.textContent || '';
  try {
    return detectDirectionFromContent(text);
  } catch {
    // Simple fallback if service is unavailable
    const rtlRegex = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;
    return rtlRegex.test(text) ? 'rtl' : 'ltr';
  }
}

/**
 * Collects an ordered array of inline ancestor tag names between the node and block parent.
 * @param {Node} node - The text node
 * @param {HTMLElement} blockParent - The block-level parent
 * @returns {string[]}
 */
function getInlineParentTags(node, blockParent) {
  const tags = [];
  let parent = node.parentElement;
  while (parent && parent !== blockParent) {
    tags.push(parent.tagName.toLowerCase());
    parent = parent.parentElement;
  }
  return tags;
}

/**
 * Extracts page and heading context to enrich translation requests (especially for AI)
 * @param {HTMLElement} element - The selected element
 * @returns {Object} - Metadata including page title, heading context and element role
 */
export function extractContextMetadata(element) {
  const metadata = {
    pageTitle: document.title,
    heading: '',
    role: element.tagName.toLowerCase(),
    contextSummary: ''
  };

  // Find the nearest preceding heading to provide semantic context
  try {
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    if (headings.length > 0) {
      const elementRect = element.getBoundingClientRect();
      let closestHeading = null;
      let minDistance = Infinity;

      for (const h of headings) {
        const hRect = h.getBoundingClientRect();
        const distance = elementRect.top - hRect.bottom;
        
        if (distance >= 0 && distance < minDistance) {
          minDistance = distance;
          closestHeading = h;
        }
      }
      
      if (closestHeading) {
        metadata.heading = closestHeading.textContent.trim().substring(0, 100);
      }
    }

    // Build context summary for providers like DeepL
    const parts = [];
    if (metadata.pageTitle) parts.push(`Page: ${metadata.pageTitle}`);
    if (metadata.heading) parts.push(`Section: ${metadata.heading}`);
    if (metadata.role) parts.push(`Role: ${metadata.role}`);
    
    // Add full text of the element for better phrase translation
    const fullText = element.textContent.trim().substring(0, 300);
    if (fullText) parts.push(`Full context: ${fullText}`);
    
    // Add parent context if available
    const parent = element.parentElement;
    if (parent && parent.tagName !== 'BODY') {
      parts.push(`Parent: ${parent.tagName.toLowerCase()}`);
    }

    metadata.contextSummary = parts.join(' | ').substring(0, 1000);

  } catch (e) {
    logger.debug('Failed to extract heading context', e);
  }

  return metadata;
}

/**
 * Checks if a single element should be excluded based on its tags, classes, or attributes.
 * Does NOT check ancestors.
 * 
 * @param {Element} el - The element to check
 * @param {boolean} isRoot - Whether this is the root element being translated
 * @returns {boolean}
 */
function isExcludedElement(el, isRoot = false, options = {}) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
  
  const tagName = el.tagName.toUpperCase();
  
  // 1. Technical/Interactive tags
  if (EXCLUDED_TAGS.includes(tagName)) {
    if (options.allowPreformatted && PREFORMATTED_TAGS.has(tagName)) {
      return false;
    }
    logger.debug(`[isExcludedElement] Rejected by tag: ${tagName}`, el);
    return true;
  }
  
  // 2. Explicit exclusions (class/attribute)
  if (el.classList?.contains(TRANSLATION_HTML.NO_TRANSLATE_CLASS) || 
      el.classList?.contains(TRANSLATION_HTML.IGNORE_CLASS) ||
      el.getAttribute?.('translate') === TRANSLATION_HTML.NO_TRANSLATE_VALUE ||
      el.hasAttribute?.('data-translate-ignore')) {
    logger.debug(`[isExcludedElement] Rejected by exclusion marker (class or attr)`, el);
    return true;
  }

  // 3. GitHub and other common code editor line detection
  if (el.classList?.contains('react-code-text') || 
      el.classList?.contains('react-file-line') ||
      el.classList?.contains('blob-code')) {
    if (!isRoot) {
      logger.debug(`[isExcludedElement] Rejected by code-related class`, el);
      return true;
    }
  }

  // 4. User-editable content (Attribute check is more robust in some environments)
  const contentEditable = el.getAttribute?.('contenteditable');
  if (el.isContentEditable || (contentEditable !== null && contentEditable !== 'false')) {
    logger.debug(`[isExcludedElement] Rejected by contenteditable`, el);
    return true;
  }

  // 5. Custom interactive or code roles
  const role = el.getAttribute?.('role')?.toLowerCase();
  if (role && EXCLUDED_ROLES.includes(role)) {
    logger.debug(`[isExcludedElement] Rejected by role: ${role}`, el);
    return true;
  }

  return false;
}

/**
 * Recursively checks if a node or any of its ancestors should be excluded from translation.
 * 
 * @param {Node} node - The DOM node to check
 * @param {boolean} isRoot - Whether this is the root element
 * @returns {boolean} True if the node should be excluded
 */
export function isExcludedAncestor(node, isRoot = false) {
  return isExcludedAncestorWithOptions(node, isRoot);
}

function isExcludedAncestorWithOptions(node, isRoot = false, options = {}) {
  if (!node) return false;
  
  // Start from the node itself if it's an element, or its parent if it's text
  let curr = node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode;
  let currentIsRoot = isRoot;

  while (curr) {
    if (isExcludedElement(curr, currentIsRoot, options)) return true;

    // Cross Shadow DOM boundary
    if (curr.host) {
      curr = curr.host;
    } else {
      curr = curr.parentNode;
    }
    currentIsRoot = false; // Ancestors are never the root
  }
  return false;
}

/**
 * Collect all visible text nodes with unique structural IDs for accurate batch mapping
 * @param {HTMLElement} element - Root element to crawl
 * @returns {Object[]} Array of objects { node, text, uid, blockId, role }
 */
export function collectTextNodes(element) {
  // 1. Entry check: If the starting element is already excluded, return empty
  if (isExcludedAncestor(element, true)) {
    return [];
  }

  const textNodesData = [];
  
  // 2. High-performance filter that rejects entire branches
  const filter = (node) => {
    // Branch Filtering (Elements)
    if (node.nodeType === Node.ELEMENT_NODE) {
      // Business logic exclusions (Tags, Class, Attributes, Editable, Roles)
      if (isExcludedElement(node)) return NodeFilter.FILTER_REJECT;
      
      // Visibility check
      try {
        const style = window.getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') {
          return NodeFilter.FILTER_REJECT;
        }
      } catch {
        // Skip current element but visit children if style check fails
      }

      return NodeFilter.FILTER_SKIP;
    }

    // Leaf Filtering (Text Nodes)
    if (node.nodeType === Node.TEXT_NODE) {
      if (isExcludedAncestor(node)) {
        return NodeFilter.FILTER_REJECT;
      }

      const trimmed = node.textContent.trim();
      if (!trimmed || DOM_FILTERS.isTechnicalPattern(trimmed)) {
        return NodeFilter.FILTER_REJECT;
      }
      
      // Skip pure numbers, symbols, or whitespace (Line numbers, etc.)
      if (DOM_FILTERS.NUMERIC_REGEX.test(trimmed) || /^[\d\s\p{P}\p{S}]+$/u.test(trimmed)) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    }

    return NodeFilter.FILTER_SKIP;
  };

  // Necessary for cross-browser compatibility with TreeWalker
  filter.acceptNode = filter;

  // Use SHOW_ELEMENT | SHOW_TEXT to allow branch rejection
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, filter);

  let node;
  let nodeCounter = 0;
  while ((node = walker.nextNode())) {
    // Skip element nodes in the loop, we only process accepted text nodes
    if (node.nodeType === Node.ELEMENT_NODE) continue;

    const blockParent = findClosestBlockParent(node);
    
    // Ensure blockId persists for mapping back to the DOM
    if (!blockParent.dataset.blockId) {
      blockParent.dataset.blockId = `b${Math.random().toString(36).substr(2, 4)}`;
    }

    nodeCounter++;
    textNodesData.push({
      node,
      text: node.textContent || '',
      uid: `n${nodeCounter}`,
      blockId: blockParent.dataset.blockId,
      role: blockParent.tagName.toLowerCase()
    });
  }

  logger.debug(`Collected ${textNodesData.length} text nodes with structural data.`);
  
  // Diagnostic Ancestor Path Logging
  textNodesData.forEach((d, idx) => {
    let path = [];
    let curr = d.node.parentElement || d.node.parentNode;
    let depth = 0;
    while (curr && depth < 5) {
      const tag = curr.tagName || 'ShadowRoot';
      const cls = curr.className || '';
      const id = curr.id || '';
      const role = curr.getAttribute?.('role') || '';
      const editable = curr.isContentEditable ? 'true' : 'false';
      path.push(`${tag}[class="${cls}", id="${id}", role="${role}", editable="${editable}"]`);
      curr = curr.parentElement || curr.parentNode?.host;
      depth++;
    }
    logger.debug(`  Node #${idx + 1}: "${d.text.trim().substring(0, 40)}" | Path: ${path.join(' -> ')}`);
  });

  return textNodesData;
}

/**
 * Collect visible text nodes grouped and enriched into TranslationUnit objects.
 * Employs a session-scoped WeakMap context to track blockIds cleanly without DOM mutation.
 *
 * @param {HTMLElement} element - Root element to crawl
 * @param {Object} [sessionContext={}] - Session-scoped context to track block IDs across calls
 * @param {WeakMap} [sessionContext.blockMap] - Maps elements to blockIds
 * @param {Object} [sessionContext.blockCounter] - Sequential counter object { value: number }
 * @returns {TranslationUnit[]} Array of enriched TranslationUnits
 */
export function collectBlockGroups(element, sessionContext = {}) {
  // 1. Entry check: If the starting element is already excluded, return empty
  if (isExcludedAncestorWithOptions(element, true, { allowPreformatted: true })) {
    return [];
  }

  if (!sessionContext.blockMap) {
    sessionContext.blockMap = new WeakMap();
  }
  if (!sessionContext.blockCounter) {
    sessionContext.blockCounter = { value: 0 };
  }

  const units = [];

  // 2. High-performance filter that rejects entire branches
  const filter = (node) => {
    // Branch Filtering (Elements)
    if (node.nodeType === Node.ELEMENT_NODE) {
      // Business logic exclusions (Tags, Class, Attributes, Editable, Roles)
      if (isExcludedElement(node, false, { allowPreformatted: true })) return NodeFilter.FILTER_REJECT;
      
      // Visibility check
      try {
        const style = window.getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') {
          return NodeFilter.FILTER_REJECT;
        }
      } catch {
        // Skip current element but visit children if style check fails
      }

      return NodeFilter.FILTER_SKIP;
    }

    // Leaf Filtering (Text Nodes)
    if (node.nodeType === Node.TEXT_NODE) {
      if (isExcludedAncestorWithOptions(node, false, { allowPreformatted: true })) {
        return NodeFilter.FILTER_REJECT;
      }

      const trimmed = node.textContent.trim();
      if (!trimmed || DOM_FILTERS.isTechnicalPattern(trimmed)) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    }

    return NodeFilter.FILTER_SKIP;
  };

  // Necessary for cross-browser compatibility with TreeWalker
  filter.acceptNode = filter;

  // Use SHOW_ELEMENT | SHOW_TEXT to allow branch rejection
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, filter);

  let node;
  let nodeCounter = 0;
  while ((node = walker.nextNode())) {
    // Skip element nodes in the loop, we only process accepted text nodes
    if (node.nodeType === Node.ELEMENT_NODE) continue;

    const blockParent = findClosestBlockParent(node);
    
    // Assign blockId using WeakMap session context (no DOM writes)
    let blockId = sessionContext.blockMap.get(blockParent);
    if (!blockId) {
      sessionContext.blockCounter.value++;
      blockId = `g${sessionContext.blockCounter.value}`;
      sessionContext.blockMap.set(blockParent, blockId);
    }

    nodeCounter++;
    const uid = `n${nodeCounter}`;
    const rawText = node.textContent || '';
    
    // Boundary strip-and-restore model
    const leadingWS = (rawText.match(/^(\s*)/) || [''])[0];
    const trailingWS = (rawText.match(/(\s*)$/) || [''])[0];
    const trimmedText = rawText.trim();

    // Reversible escaping: escape sequence "[--SEG:" to "[--ESCAPED_SEG:"
    const escapedText = trimmedText.replace(/\[--SEG:/g, '[--ESCAPED_SEG:');

    // Preformatted preWhitespace tag & CSS checks
    const preWhitespace = isPreformatted(node);

    // Direction Hint extraction
    const directionHint = getDirectionHint(node);

    // Inline parent tags collection
    const inlineParentTags = getInlineParentTags(node, blockParent);

    // Build the unit using the TranslationUnit class
    const unit = new TranslationUnit({
      id: uid,
      blockId,
      text: escapedText,
      leadingWS,
      trailingWS,
      preWhitespace,
      directionHint,
      inlineParentTags,
      mode: preWhitespace ? 'V2_PASSTHROUGH' : 'standard'
    });
    unit.node = node;

    units.push(unit);
  }

  logger.debug(`[collectBlockGroups] Collected ${units.length} units cleanly in session.`);
  
  // Diagnostic Ancestor Path Logging
  units.forEach((u, idx) => {
    let path = [];
    let curr = u.node?.parentElement || u.node?.parentNode;
    let depth = 0;
    while (curr && depth < 5) {
      const tag = curr.tagName || 'ShadowRoot';
      const cls = curr.className || '';
      const id = curr.id || '';
      const role = curr.getAttribute?.('role') || '';
      const editable = curr.isContentEditable ? 'true' : 'false';
      path.push(`${tag}[class="${cls}", id="${id}", role="${role}", editable="${editable}"]`);
      curr = curr.parentElement || curr.parentNode?.host;
      depth++;
    }
    logger.debug(`  Unit #${idx + 1}: "${u.text.substring(0, 40)}" | Path: ${path.join(' -> ')}`);
  });

  return units;
}

/**
 * Generates a unique ID for element tracking during translation sessions
 * @returns {string} Unique ID
 */
export function generateElementId() {
  return `element-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
