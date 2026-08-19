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
import { isSelectElementTraversable, SelectElementReason } from '@/features/element-selection/core/SelectElementPolicy.js';
import { iterateSelectElementAncestors } from '../utils/shadowDom.js';

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'DomTranslatorUtils');

/**
 * Finds the closest block-level parent for a node based on context boundaries
 * @param {Node} node - The DOM node to check
 * @returns {HTMLElement|null} - The block-level ancestor, or null at a shadow boundary
 */
function findClosestBlockParent(node) {
  let parent = node.parentElement;
  while (parent) {
    if (SELECT_ELEMENT_BLOCK_TAGS.has(parent.tagName)) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return node.getRootNode?.()?.host ? null : document.body;
}

function getBlockOwner(node) {
  return findClosestBlockParent(node) || node.getRootNode();
}

function getBlockId(owner, blockMap, blockCounter, prefix) {
  if (owner?.nodeType === Node.ELEMENT_NODE && owner.dataset) {
    if (!owner.dataset.blockId) owner.dataset.blockId = `b${Math.random().toString(36).substr(2, 4)}`;
    return owner.dataset.blockId;
  }

  let blockId = blockMap.get(owner);
  if (!blockId) {
    blockCounter.value++;
    blockId = `${prefix}${blockCounter.value}`;
    blockMap.set(owner, blockId);
  }
  return blockId;
}

function walkSelectTree(root, filter, onNode, options = {}) {
  const seenNodes = options.seenNodes || new WeakSet();
  const seenRoots = options.seenRoots || new WeakSet();
  const nestedRoots = [];

  if (options.includeOpenShadowRoots && root.nodeType === Node.ELEMENT_NODE && root.shadowRoot) {
    seenRoots.add(root.shadowRoot);
    nestedRoots.push(root.shadowRoot);
  }

  const traversalFilter = (node) => {
    const result = filter(node);
    if (
      result !== NodeFilter.FILTER_REJECT
      && options.includeOpenShadowRoots
      && node.nodeType === Node.ELEMENT_NODE
      && node.shadowRoot
      && !seenRoots.has(node.shadowRoot)
    ) {
      seenRoots.add(node.shadowRoot);
      nestedRoots.push(node.shadowRoot);
    }
    return result;
  };
  traversalFilter.acceptNode = traversalFilter;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, traversalFilter);
  let node;
  while ((node = walker.nextNode())) {
    if (seenNodes.has(node)) continue;
    seenNodes.add(node);
    onNode(node);

  }

  for (const shadowRoot of nestedRoots) {
    walkSelectTree(shadowRoot, filter, onNode, { ...options, seenNodes, seenRoots });
  }
}

/**
 * Helper to determine if a node or any of its ancestors are preformatted (pre/code/textarea/etc.)
 * or have pre-computed white-space styling.
 * @param {Node} node - The DOM node to check
 * @returns {boolean}
 */
function isPreformatted(node) {
  for (const parent of iterateSelectElementAncestors(node)) {
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
  for (const parent of iterateSelectElementAncestors(node)) {
    const dir = parent.getAttribute('dir');
    if (dir === 'rtl' || dir === 'ltr') {
      return dir;
    }
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
 * The eligibility taxonomy is owned by SelectElementPolicy (traversal axis);
 * this wrapper maps the structural reason back to the extractor's log messages.
 *
 * @param {Element} el - The element to check
 * @param {boolean} isRoot - Whether this is the root element being translated
 * @returns {boolean}
 */
function isExcludedElement(el, isRoot = false, options = {}) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;

  const { traversable, reason } = isSelectElementTraversable(el, {
    isRoot,
    extractionMode: options.extractionMode,
  });

  if (traversable) return false;

  switch (reason) {
    case SelectElementReason.EXCLUDED_TAG:
    case SelectElementReason.UNSUPPORTED_MODE:
      logger.debug(`[isExcludedElement] Rejected by tag: ${el.tagName.toUpperCase()}`, el);
      break;
    case SelectElementReason.NOTRANSLATE:
      logger.debug(`[isExcludedElement] Rejected by exclusion marker (class or attr)`, el);
      break;
    case SelectElementReason.CODE_CLASS:
      logger.debug(`[isExcludedElement] Rejected by code-related class`, el);
      break;
    case SelectElementReason.EDITABLE:
      logger.debug(`[isExcludedElement] Rejected by contenteditable`, el);
      break;
    case SelectElementReason.EXCLUDED_ROLE:
      logger.debug(`[isExcludedElement] Rejected by role: ${el.getAttribute?.('role')?.toLowerCase()}`, el);
      break;
    default:
      logger.debug(`[isExcludedElement] Rejected: ${reason}`, el);
  }

  return true;
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
  
  // The collection root is validated once by the entry check with isRoot=true.
  // rootElement prevents descendant leaf checks from re-classifying it as a
  // nested descendant (which would reject the selected root's own text, e.g.
  // an explicitly selected interactive root).
  const { rootElement = null, ...checkOptions } = options;

  // Start from the node itself if it's an element, or its parent if it's text
  let curr = node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode;
  let currentIsRoot = isRoot;

  while (curr) {
    const nodeIsRoot = currentIsRoot || (rootElement && curr === rootElement);
    if (isExcludedElement(curr, nodeIsRoot, checkOptions)) return true;

    // Cross Shadow DOM boundary
    if (curr.host) {
      curr = curr.host;
    } else {
      curr = curr.parentNode;
    }
    currentIsRoot = false;
  }
  return false;
}

/**
 * Collect all visible text nodes with unique structural IDs for accurate batch mapping
 * @param {HTMLElement} element - Root element to crawl
 * @param {Object} [options] - Collection options
 * @param {string} [options.extractionMode] - Resolved extraction mode ('v2'|'v3')
 * @param {boolean} [options.includeOpenShadowRoots=false] - Phase 1 traversal capability; disabled by production adapter
 * @returns {Object[]} Array of objects { node, text, uid, blockId, role }
 */
export function collectTextNodes(element, options = {}) {
  // 1. Entry check: If the starting element is already excluded, return empty
  if (isExcludedAncestorWithOptions(element, true, { extractionMode: options.extractionMode })) {
    return [];
  }

  const textNodesData = [];
  const blockMap = new WeakMap();
  const blockCounter = { value: 0 };
  
  // 2. High-performance filter that rejects entire branches
  const filter = (node) => {
    // Branch Filtering (Elements)
    if (node.nodeType === Node.ELEMENT_NODE) {
      // Business logic exclusions (Tags, Class, Attributes, Editable, Roles)
      if (isExcludedElement(node, false, { extractionMode: options.extractionMode })) return NodeFilter.FILTER_REJECT;
      
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
      if (isExcludedAncestorWithOptions(node, false, { extractionMode: options.extractionMode, rootElement: element })) {
        return NodeFilter.FILTER_REJECT;
      }

      const trimmed = node.textContent.trim();
      if (!trimmed || DOM_FILTERS.isTechnicalPattern(trimmed) || DOM_FILTERS.isFormattingOnly(trimmed)) {
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

  let nodeCounter = 0;
  walkSelectTree(element, filter, (node) => {
    // Skip element nodes in the loop, we only process accepted text nodes
    if (node.nodeType === Node.ELEMENT_NODE) return;

    const blockOwner = getBlockOwner(node);
    const blockId = getBlockId(blockOwner, blockMap, blockCounter, 'sb');

    nodeCounter++;
    textNodesData.push({
      node,
      text: node.textContent || '',
      uid: `n${nodeCounter}`,
      blockId,
      role: blockOwner?.tagName?.toLowerCase() || 'shadow-root'
    });
  }, options);

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
 * @param {Object} [options] - Collection options
 * @param {string} [options.extractionMode] - Resolved extraction mode ('v2'|'v3').
 *   Required for preformatted traversal (V3); absent mode conservatively rejects
 *   preformatted categories.
 * @param {boolean} [options.includeOpenShadowRoots=false] - Phase 1 traversal capability; disabled by production adapter
 * @returns {TranslationUnit[]} Array of enriched TranslationUnits
 */
export function collectBlockGroups(element, sessionContext = {}, options = {}) {
  // 1. Entry check: If the starting element is already excluded, return empty
  if (isExcludedAncestorWithOptions(element, true, { extractionMode: options.extractionMode })) {
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
      if (isExcludedElement(node, false, { extractionMode: options.extractionMode })) return NodeFilter.FILTER_REJECT;
      
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
      if (isExcludedAncestorWithOptions(node, false, { extractionMode: options.extractionMode, rootElement: element })) {
        return NodeFilter.FILTER_REJECT;
      }

      const trimmed = node.textContent.trim();
      if (!trimmed || DOM_FILTERS.isTechnicalPattern(trimmed) || DOM_FILTERS.isFormattingOnly(trimmed)) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    }

    return NodeFilter.FILTER_SKIP;
  };

  // Necessary for cross-browser compatibility with TreeWalker
  filter.acceptNode = filter;

  let nodeCounter = 0;
  walkSelectTree(element, filter, (node) => {
    // Skip element nodes in the loop, we only process accepted text nodes
    if (node.nodeType === Node.ELEMENT_NODE) return;

    const blockOwner = getBlockOwner(node);
    
    // Assign blockId using WeakMap session context (no DOM writes)
    let blockId = sessionContext.blockMap.get(blockOwner);
    if (!blockId) {
      sessionContext.blockCounter.value++;
      blockId = `g${sessionContext.blockCounter.value}`;
      sessionContext.blockMap.set(blockOwner, blockId);
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
    const inlineParentTags = getInlineParentTags(node, blockOwner);

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
  }, options);

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
