// src/features/text-field-interaction/utils/framework/framework-compat/contentEditableScope.js
//
// Shared contentEditable scope layer for Issue #201 (sibling of fieldSourceSnapshot.js).
// Centralizes CE capture serialization, DOM range bookmarks, restore, validation
// and resolution so no platform strategy duplicates CE range/stale logic.
// Plain serializable data only: no Range/Selection/node refs ever leave these helpers.

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

// Use scoped cached logger (consistent with selectionUtils.js)
const logger = getScopedLogger(LOG_COMPONENTS.FRAMEWORK, 'contentEditableScope');

// Elements skipped by the canonical serializer (never user-visible text).
const CE_SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);

// Block-level elements that delimit lines in the canonical text.
const CE_BLOCK_TAGS = new Set([
  'P', 'DIV', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN',
  'NAV', 'ASIDE', 'FIGURE', 'FIGCAPTION', 'HR',
]);

/**
 * Serialize a contentEditable subtree to canonical visible text with meaningful
 * newlines. Pure structural walk: no layout, no innerText, deterministic in
 * jsdom and real browsers. NO global trimming anywhere: edge newlines survive
 * exactly when they represent real editable lines.
 *
 * Line model: every block computes its own line list, and parents concatenate
 * those units verbatim — so each empty editable block counts structurally
 * (`<div><br></div><div><br></div><div>x</div>` → "\n\nx"), while truly empty
 * blocks (`<div></div>`) and nested wrappers (`<div><div>deep</div></div>` →
 * "deep") contribute nothing synthetic. Within one scope, inline text
 * accumulates on the current line and every <br> ends the current line and
 * opens a new one (recording a leading empty line only when the scope holds
 * nothing yet); a block boundary merges into a preceding break instead of
 * doubling it (`a<br><div>b</div>` → "a\nb"), and a scope boundary keeps a
 * trailing empty line only when the scope already holds real content
 * (`<div>a<br></div>` → "a\n"). Text runs are verbatim (meaningful internal
 * whitespace kept); all-whitespace runs containing a newline outside <pre>
 * are source formatting and skipped. A result of only empty lines is an empty
 * editor and serializes to "".
 *
 * @param {Node} root - Subtree root (editor element or detached wrapper)
 * @returns {string} Canonical text with \n line breaks
 */
export function serializeContentEditableText(root) {
  if (!root) return '';

  // Serialize one container's children to its own line list.
  const serializeChildren = (parent, inPre) => {
    const lines = [];
    let current = null; // null = no open line; otherwise the open line content

    // End the open line, recording it (even when empty: an ended line exists).
    const closeLine = () => {
      if (current !== null) {
        lines.push(current);
        current = null;
      }
    };
    // End the open line at a block boundary, discarding it when still empty:
    // a block boundary subsumes the break a preceding <br> already recorded.
    const flushLine = () => {
      if (current) {
        lines.push(current);
      }
      current = null;
    };
    // End the open line at this scope's end, recording a trailing empty line
    // only when the scope already holds real content.
    const closeScope = () => {
      if (current !== null && (current !== '' || lines.some((line) => line !== ''))) {
        lines.push(current);
      }
      current = null;
    };
    const emitText = (value) => {
      if (!value) return;
      if (!inPre && value.includes('\n') && /^\s*$/.test(value)) return; // source formatting
      if (current === null) current = '';
      current += value;
    };
    const emitBreak = () => {
      const hadOpen = current !== null;
      closeLine();
      // A break with nothing before it in this scope opens the leading empty
      // line (e.g. `<div><br>x</div>` → "\nx"); mid-stream breaks only separate.
      if (!hadOpen && lines.length === 0) lines.push('');
      current = '';
    };

    const walk = (node) => {
      if (!node) return;
      if (node.nodeType === 3) {
        // TEXT_NODE: verbatim, meaningful internal whitespace kept.
        emitText(node.nodeValue ?? '');
        return;
      }
      if (node.nodeType !== 1) return; // ELEMENT_NODE only (skip comments, etc.)
      const tag = node.tagName;
      if (CE_SKIP_TAGS.has(tag)) return;
      if (tag === 'BR') {
        emitBreak();
        return;
      }
      if (CE_BLOCK_TAGS.has(tag)) {
        flushLine();
        for (const line of serializeChildren(node, inPre || tag === 'PRE')) {
          lines.push(line);
        }
        return;
      }
      node.childNodes.forEach((child) => walk(child)); // Inline: transparent.
    };

    parent.childNodes.forEach((child) => walk(child));
    closeScope();
    return lines;
  };

  const lines = serializeChildren(root, false);
  if (lines.every((line) => line === '')) return '';
  return lines.join('\n');
}

/**
 * Build a DocumentFragment for translated text, preserving \n as <br> breaks.
 * A single text node would flatten newlines visually, so lines become text
 * nodes separated by <br> (mirrors the execCommand insertText/insertHTML loop).
 *
 * @param {string} text - Translated text possibly containing \n
 * @returns {DocumentFragment} Fragment ready for range.insertNode/appendChild
 */
export function buildMultilineFragment(text) {
  const fragment = document.createDocumentFragment();
  const lines = (text ?? '').split('\n');
  lines.forEach((line, index) => {
    if (index > 0) {
      fragment.appendChild(document.createElement('br'));
    }
    if (line) {
      fragment.appendChild(document.createTextNode(line));
    }
  });
  return fragment;
}

/**
 * Child-index path of a node relative to a root element.
 * @param {Node} root - Editor root (path base, serializable anchor)
 * @param {Node} node - Target node
 * @returns {number[]|null} Index path, or null when node is outside/detached
 */
export function nodePathFromRoot(root, node) {
  if (!root || !node) return null;
  const path = [];
  let current = node;
  while (current && current !== root) {
    const parent = current.parentNode;
    if (!parent) return null;
    path.unshift(Array.prototype.indexOf.call(parent.childNodes, current));
    current = parent;
  }
  return current === root ? path : null;
}

/**
 * Resolve a child-index path back to a live node (no text search, no relocation).
 * @param {Node} root - Editor root
 * @param {number[]} path - Index path
 * @returns {Node|null} Live node, or null when the structure no longer matches
 */
export function resolveNodePath(root, path) {
  if (!root || !Array.isArray(path)) return null;
  let current = root;
  for (const index of path) {
    if (!current || !current.childNodes
      || typeof index !== 'number' || !Number.isInteger(index)
      || index < 0 || index >= current.childNodes.length) {
      return null;
    }
    current = current.childNodes[index];
  }
  return current;
}

/**
 * Structural tag of a node for lineage facts (plain data, no refs).
 * @param {Node} node - DOM node
 * @returns {string} Element tag, '#text' for text, or the node name fallback
 */
function lineageTagOf(node) {
  if (!node) return '?';
  if (node.nodeType === 3) return '#text';
  return node.tagName ?? node.nodeName ?? '?';
}

/**
 * Child count of a node for lineage facts (plain data).
 * @param {Node} node - DOM node
 * @returns {number} Number of child nodes (0 for text)
 */
function lineageLenOf(node) {
  try {
    return node && node.childNodes ? node.childNodes.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Capture the serializable structural lineage along the root→node path: one
 * plain `{tag, len}` fact per level, root first and the node itself last.
 * Insert/delete/tag-swap anywhere on the path changes a fact, so an old path
 * that aliases a different node fails closed. Text-only edits inside siblings
 * change no fact, so outside edits stay valid whenever the bookmark text
 * still matches. Never reaches above the scope root; no Node/Range refs.
 *
 * @param {Node} root - Editor root (scope boundary)
 * @param {Node} node - Target node
 * @returns {{path:number[],lineage:Array<{tag:string,len:number}>}|null} Path plus lineage, or null when unmappable
 */
export function lineageFromRoot(root, node) {
  try {
    if (!root || !node) return null;
    const path = nodePathFromRoot(root, node);
    if (!path) return null;
    const lineage = [{ tag: lineageTagOf(root), len: lineageLenOf(root) }];
    let current = root;
    for (const index of path) {
      if (!current.childNodes || index >= current.childNodes.length) return null;
      current = current.childNodes[index];
      lineage.push({ tag: lineageTagOf(current), len: lineageLenOf(current) });
    }
    if (current !== node) return null;
    return { path, lineage };
  } catch (error) {
    logger.warn('lineageFromRoot error', error);
    return null;
  }
}

/**
 * Resolve one bookmark endpoint by verifying its lineage level by level and
 * returning the live container. Any tag/child-count mismatch, out-of-bounds
 * index, or terminal-node mismatch fails closed (no text-search relocation).
 *
 * @param {Node} root - Editor root (scope boundary)
 * @param {number[]} path - Child-index path to resolve
 * @param {Array<{tag:string,len:number}>|null} lineage - Structural facts, or null for legacy shape
 * @returns {Node|null} Live container, or null when the structure drifted
 */
function resolveEndpointWithLineage(root, path, lineage) {
  if (lineage == null) {
    // Legacy bookmark shape without lineage: path-only resolve; text identity
    // at the descriptor level still gates validity.
    return resolveNodePath(root, path);
  }
  try {
    if (!root || !Array.isArray(path) || !Array.isArray(lineage) || lineage.length !== path.length + 1) {
      return null;
    }
    let current = root;
    const levelMatches = (node, fact) => !!node && !!fact && typeof fact === 'object'
      && typeof fact.tag === 'string' && fact.tag === lineageTagOf(node)
      && Number.isInteger(fact.len) && fact.len >= 0 && fact.len === lineageLenOf(node);
    if (!levelMatches(current, lineage[0])) return null;
    for (let depth = 0; depth < path.length; depth++) {
      const index = path[depth];
      if (!Number.isInteger(index) || index < 0
        || !current.childNodes || index >= current.childNodes.length) {
        return null;
      }
      current = current.childNodes[index];
      if (!levelMatches(current, lineage[depth + 1])) return null;
    }
    return current;
  } catch (error) {
    logger.warn('resolveEndpointWithLineage error', error);
    return null;
  }
}

/**
 * Validate a bookmark's structural shape (plain-data check, no DOM access).
 * Lineage facts are optional (older captures lack them) and shape-checked
 * when present; text identity always decides validity.
 * @param {Object|null} bookmark - Bookmark candidate
 * @returns {boolean} Whether the shape is a usable bookmark
 */
export function isValidContentEditableBookmark(bookmark) {
  if (!bookmark || typeof bookmark !== 'object') return false;
  const { startPath, startOffset, endPath, endOffset } = bookmark;
  const validPath = (path) => Array.isArray(path)
    && path.every((index) => typeof index === 'number' && Number.isInteger(index) && index >= 0);
  const validOffset = (offset) => typeof offset === 'number' && Number.isInteger(offset) && offset >= 0;
  const validLineage = (lineage, path) => lineage == null
    || (Array.isArray(lineage) && lineage.length === (path?.length ?? -1) + 1
      && lineage.every((fact) => !!fact && typeof fact === 'object'
        && typeof fact.tag === 'string'
        && typeof fact.len === 'number' && Number.isInteger(fact.len) && fact.len >= 0));
  return validPath(startPath) && validPath(endPath)
    && validOffset(startOffset) && validOffset(endOffset)
    && validLineage(bookmark.startLineage, startPath)
    && validLineage(bookmark.endLineage, endPath);
}

/**
 * Read the current window selection when it is a non-collapsed range fully
 * contained in the target editor. Never persists Selection/Range/node refs:
 * callers must extract paths/text synchronously.
 *
 * @param {HTMLElement} root - Editor root element
 * @returns {{range: Range, text: string}|null} Cloned range + canonical selected text, or null
 */
export function getContentEditableSelection(root) {
  try {
    if (!root || typeof window === 'undefined') return null;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
    const liveRange = selection.getRangeAt(0);
    // Containment: both endpoints must live inside the target editor.
    if (!root.contains(liveRange.startContainer) || !root.contains(liveRange.endContainer)) {
      logger.debug('getContentEditableSelection: selection outside target, using full scope');
      return null;
    }
    const range = liveRange.cloneRange();
    const fragment = range.cloneContents();
    const wrapper = document.createElement('div');
    wrapper.appendChild(fragment);
    // The actual selection is captured verbatim — even whitespace/newline-only.
    // A blank selection stays a selection scope (never escalated to full); an
    // empty source with caller validation declining to translate is fine.
    return { range, text: serializeContentEditableText(wrapper) };
  } catch (error) {
    logger.warn('getContentEditableSelection error, using full scope', error);
    return null;
  }
}

/**
 * Capture a serializable bookmark for a cloned range: root-relative paths plus
 * per-level structural lineage for start and end (plain data only).
 * @param {HTMLElement} root - Editor root element
 * @param {Range} range - Cloned range to bookmark
 * @returns {Object|null} Plain-data bookmark, or null when unmappable
 */
export function bookmarkContentEditableRange(root, range) {
  try {
    const start = lineageFromRoot(root, range.startContainer);
    const end = lineageFromRoot(root, range.endContainer);
    if (!start || !end) return null;
    const bookmark = {
      startPath: start.path,
      startOffset: range.startOffset,
      endPath: end.path,
      endOffset: range.endOffset,
      startLineage: start.lineage,
      endLineage: end.lineage,
    };
    return isValidContentEditableBookmark(bookmark) ? bookmark : null;
  } catch (error) {
    logger.warn('bookmarkContentEditableRange error', error);
    return null;
  }
}

/**
 * Rebuild a detached Range from a bookmark against the live DOM (structural
 * only: paths + offset bounds, never text search or relocation).
 *
 * @param {HTMLElement} root - Editor root element
 * @param {Object} bookmark - Plain-data bookmark
 * @returns {Range|null} Detached range (NOT added to the live selection), or null
 */
export function restoreContentEditableBookmark(root, bookmark) {
  try {
    if (!root || !isValidContentEditableBookmark(bookmark)) return null;
    // Lineage-verified resolve when lineage is present: every level from the
    // root must still match, so an old path aliasing a different node (ancestor
    // insert/delete shifting paths, tag swaps) fails closed. Legacy shapes
    // without lineage fall back to path-only resolve; text identity still gates.
    const startContainer = resolveEndpointWithLineage(root, bookmark.startPath, bookmark.startLineage);
    const endContainer = resolveEndpointWithLineage(root, bookmark.endPath, bookmark.endLineage);
    if (!startContainer || !endContainer) {
      logger.debug('restoreContentEditableBookmark: structure changed, refusing');
      return null;
    }
    const boundOf = (container) => (container.nodeType === 3
      ? (container.nodeValue ?? '').length
      : container.childNodes.length);
    if (bookmark.startOffset > boundOf(startContainer) || bookmark.endOffset > boundOf(endContainer)) {
      logger.debug('restoreContentEditableBookmark: offsets out of bounds, refusing');
      return null;
    }
    const range = document.createRange();
    range.setStart(startContainer, bookmark.startOffset);
    range.setEnd(endContainer, bookmark.endOffset);
    return range;
  } catch (error) {
    logger.warn('restoreContentEditableBookmark error, refusing', error);
    return null;
  }
}

/**
 * Serialize the source text currently covered by a bookmark (canonical form).
 * @param {HTMLElement} root - Editor root element
 * @param {Object} bookmark - Plain-data bookmark
 * @returns {string|null} Canonical text at the bookmark, or null when unresolvable
 */
export function readContentEditableBookmarkText(root, bookmark) {
  const range = restoreContentEditableBookmark(root, bookmark);
  if (!range) return null;
  try {
    const fragment = range.cloneContents();
    const wrapper = document.createElement('div');
    wrapper.appendChild(fragment);
    return serializeContentEditableText(wrapper);
  } catch (error) {
    logger.warn('readContentEditableBookmarkText error', error);
    return null;
  }
}

/**
 * Validate a CE selection scope: bookmark must structurally resolve AND the
 * canonical text there must still equal the captured source. Caret/selection
 * moves leave the DOM untouched so they stay valid; captured-source edits
 * invalidate; outside edits stay valid when the bookmark still resolves to the
 * same source (text-anchored, not whole-DOM-hash-anchored).
 *
 * @param {HTMLElement} root - Editor root element
 * @param {Object} fieldSource - Canonical scope (targetKind contenteditable, scope selection)
 * @returns {boolean} Whether the apply may proceed
 */
export function validateContentEditableSelection(root, fieldSource) {
  if (!root || !fieldSource || !fieldSource.bookmark) return false;
  const liveText = readContentEditableBookmarkText(root, fieldSource.bookmark);
  if (liveText === null) {
    logger.debug('validateContentEditableSelection: bookmark unresolvable, refusing');
    return false;
  }
  if (liveText !== fieldSource.expectedSourceText) {
    logger.debug('validateContentEditableSelection: source text changed, refusing');
    return false;
  }
  return true;
}

/**
 * Validate a CE full scope: current canonical editor text must equal capture.
 * Caret-only movement is harmless (same serialization); any text edit refuses.
 *
 * @param {HTMLElement} root - Editor root element
 * @param {Object} fieldSource - Canonical scope (targetKind contenteditable, scope full)
 * @returns {boolean} Whether the apply may proceed
 */
export function validateContentEditableFull(root, fieldSource) {
  if (!root || !fieldSource || typeof fieldSource.expectedSourceText !== 'string') return false;
  try {
    if (serializeContentEditableText(root) !== fieldSource.expectedSourceText) {
      logger.debug('validateContentEditableFull: editor text changed, refusing');
      return false;
    }
    return true;
  } catch (error) {
    logger.warn('validateContentEditableFull error, refusing', error);
    return false;
  }
}

/**
 * Just-in-time CE aim for mutation boundaries: revalidate the exact captured
 * source and restore the exact aim immediately before a layer mutates. One
 * shared helper called from every CE mutation boundary (execCommand, paste,
 * beforeinput, contentEditable insert, simple replacement, natural-typing
 * entry) so a selection moved during an awaited insertion step can neither
 * redirect output nor silently pass stale validation. No-op (true) for absent
 * descriptors and non-CE targets, preserving legacy behavior byte-for-byte.
 *
 * Note: scoped contentEditable requests never reach character-by-character
 * natural typing (it yields before mutating), so this helper is the typing
 * path's only contact with scopes; legacy descriptor-absent typing is untouched.
 *
 * @param {HTMLElement} element - Target element
 * @param {Object|null} applicationContext - Latest-request guard ({isCurrent, fieldSource})
 * @returns {boolean} False when stale (caller must not mutate)
 */
export function ensureCEAim(element, applicationContext = null) {
  const fieldSource = applicationContext?.fieldSource ?? null;
  if (!fieldSource) return true;
  const isCE = !!element && (!!element.isContentEditable || element.contentEditable === 'true');
  if (!isCE) return true;
  return !resolveScopedContentEditable(element, applicationContext).refused;
}

/**
 * Whether the context carries a valid CE selection scope aimed by central restore.
 * Used to skip legacy select-all branches that would wipe the restored range.
 *
 * @param {HTMLElement} element - Target element
 * @param {Object|null} applicationContext - Latest-request guard ({isCurrent, fieldSource})
 * @returns {boolean} True only for contenteditable + CE selection scope
 */
export function hasScopedCESelection(element, applicationContext = null) {
  const fieldSource = applicationContext?.fieldSource ?? null;
  return !!element?.isContentEditable
    && !!fieldSource
    && fieldSource.targetKind === 'contenteditable'
    && fieldSource.scope === 'selection';
}

/**
 * Resolve a CE scope against the live editor: validate, then aim the live
 * window selection (restore bookmark for selection scope, select-all for full
 * scope) so downstream insertion layers replace exactly the aimed range.
 * Never touches non-CE elements; absent descriptors pass through untouched.
 *
 * @param {HTMLElement} element - Target element
 * @param {Object|null} applicationContext - Latest-request guard ({isCurrent, fieldSource})
 * @returns {{refused:boolean,restored:boolean}} refused=true must not mutate
 */
export function resolveScopedContentEditable(element, applicationContext = null) {
  const fieldSource = applicationContext?.fieldSource ?? null;
  const isCE = !!element && (!!element.isContentEditable || element.contentEditable === 'true');

  // No descriptor (legacy direct callers) or non-CE targets: untouched.
  if (!fieldSource || !isCE) {
    return { refused: false, restored: false };
  }

  // Kind fence: a native-kind descriptor on a CE element (or vice versa) is a
  // mismatch — fail closed rather than applying cross-kind.
  if ((fieldSource.targetKind ?? 'native') !== 'contenteditable') {
    logger.debug('resolveScopedContentEditable: kind mismatch, refusing');
    return { refused: true, restored: false };
  }

  try {
    if (typeof window === 'undefined') return { refused: true, restored: false };
    const selection = window.getSelection();
    if (!selection) return { refused: true, restored: false };

    if (fieldSource.scope === 'selection') {
      if (!validateContentEditableSelection(element, fieldSource)) {
        return { refused: true, restored: false };
      }
      const range = restoreContentEditableBookmark(element, fieldSource.bookmark);
      if (!range) {
        return { refused: true, restored: false };
      }
      selection.removeAllRanges();
      selection.addRange(range);
      // Aim proof: the live selection must now cover exactly the captured
      // source. A silently failed aim must never hand a wrong (e.g. empty or
      // select-all) range to the insertion layers — fail closed instead.
      try {
        const aimed = selection.getRangeAt(0).cloneContents();
        const aimedWrapper = document.createElement('div');
        aimedWrapper.appendChild(aimed);
        if (serializeContentEditableText(aimedWrapper) !== fieldSource.expectedSourceText) {
          logger.debug('resolveScopedContentEditable: aim verification failed, refusing');
          selection.removeAllRanges();
          return { refused: true, restored: false };
        }
      } catch (error) {
        logger.warn('resolveScopedContentEditable: aim unreadable, refusing', error);
        return { refused: true, restored: false };
      }
      return { refused: false, restored: true };
    }

    if (fieldSource.scope === 'full') {
      if (!validateContentEditableFull(element, fieldSource)) {
        return { refused: true, restored: false };
      }
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
      return { refused: false, restored: true };
    }

    // 'invalid' and unknown scopes: fail closed, never mutate.
    logger.debug('resolveScopedContentEditable: invalid scope, refusing');
    return { refused: true, restored: false };
  } catch (error) {
    logger.warn('resolveScopedContentEditable error, refusing', error);
    return { refused: true, restored: false };
  }
}
