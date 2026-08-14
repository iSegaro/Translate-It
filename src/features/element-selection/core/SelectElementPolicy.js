/**
 * SelectElementPolicy
 * ===================
 *
 * Feature-scoped owner of Select Element *element-level* eligibility policy.
 *
 * This module is the single source of truth for the eligibility TAXONOMY and
 * SEMANTICS that drive:
 *   - root selectability    (which elements Selector/Manager accept as roots)
 *   - descendant traversal  (which subtrees the extractor may enter)
 *   - extraction capability (which abstract extraction modes can represent a category)
 *
 * It deliberately does NOT:
 *   - perform text-unit filtering      (DOM_FILTERS in @/utils/dom/DomFilters.js
 *                                       remains the owner of technical/formatting/unit rules)
 *   - perform DOM traversal            (TreeWalker, closest(), ancestor walks)
 *   - know providers / config / feature flags
 *   - own UI feedback                  (manager notifications, toasts, i18n)
 *
 * Extraction-mode resolution (provider/config -> 'v2' | 'v3') happens OUTSIDE
 * this module, in DomTranslatorAdapter.
 *
 * Migration note: this module PRESERVES the exact current product behavior,
 * including every known selector/extractor asymmetry (SELECT/OPTION,
 * PRE/CODE/KBD/SAMP, role=code, opacity:0), with one product decision:
 * interactive containers (literal BUTTON and role=button) are always
 * traversable content — both as explicitly selected roots and nested inside a
 * selected container — and classify as ordinary CONTENT.
 */

import { TRANSLATION_HTML } from '@/shared/constants/translation.js';

/**
 * Abstract extraction modes the policy may reference.
 * Providers and config flags never enter this module.
 */
export const SelectElementExtractionMode = Object.freeze({
  V2: 'v2',
  V3: 'v3',
});

/**
 * Structural element categories.
 * Category drives extraction capability and descendant traversal.
 */
export const SelectElementCategory = Object.freeze({
  NON_CONTENT: 'non-content',
  FORM_CONTROL: 'form-control',
  PREFORMATTED: 'preformatted',
  SEMANTIC_SPECIAL: 'semantic-special',
  CONTENT: 'content',
});

/**
 * Stable structural reason codes. Feature-policy scoped, NOT ErrorTypes.
 * Internal only; not exposed to the UI yet.
 */
export const SelectElementReason = Object.freeze({
  NOT_SELECTABLE: 'not-selectable',
  EXCLUDED_TAG: 'excluded-tag',
  EXCLUDED_ROLE: 'excluded-role',
  EDITABLE: 'editable',
  NOTRANSLATE: 'notranslate',
  HIDDEN: 'hidden',
  CODE_CLASS: 'code-class',
  UNSUPPORTED_MODE: 'unsupported-mode',
});

/**
 * Categorized tag taxonomy — the single source of truth for tag semantics.
 * Each category drives traversal + capability; root selectability is derived
 * with an explicit exception set (see ROOT_SELECTABLE_EXCEPTIONS).
 */
const CATEGORY_TAGS = Object.freeze({
  [SelectElementCategory.NON_CONTENT]: Object.freeze([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG', 'HEAD', 'META', 'LINK',
  ]),
  [SelectElementCategory.FORM_CONTROL]: Object.freeze([
    'INPUT', 'TEXTAREA', 'SELECT', 'OPTION',
  ]),
  [SelectElementCategory.PREFORMATTED]: Object.freeze([
    'PRE', 'CODE', 'KBD', 'SAMP',
  ]),
  [SelectElementCategory.SEMANTIC_SPECIAL]: Object.freeze([
    'TIME', 'RUBY', 'RT', 'RP',
  ]),
});

const TAG_CATEGORY_MAP = new Map();
for (const [category, tags] of Object.entries(CATEGORY_TAGS)) {
  for (const tag of tags) TAG_CATEGORY_MAP.set(tag, category);
}

/**
 * All categorized tags — equivalent to the previous flat EXCLUDED_TAGS union.
 * Derived from CATEGORY_TAGS, never maintained independently.
 */
const EXCLUDED_TAGS = new Set(TAG_CATEGORY_MAP.keys());

/**
 * Tags the SELECTOR currently accepts as roots despite being extractor-excluded.
 * Preserved mismatch: SELECT/OPTION, PRE/CODE are selectable-root=true.
 */
const ROOT_SELECTABLE_EXCEPTIONS = new Set(['SELECT', 'OPTION', 'PRE', 'CODE']);

/**
 * Root-excluded tags — equivalent to the selector's previous invalidTags list.
 * Derived: all categorized tags minus ROOT_SELECTABLE_EXCEPTIONS.
 */
const ROOT_EXCLUDED_TAGS = new Set([...EXCLUDED_TAGS].filter((tag) => !ROOT_SELECTABLE_EXCEPTIONS.has(tag)));

/**
 * Role exclusions differ per axis (preserved):
 * - root axis: selector rejects textbox/searchbox/combobox only.
 * - traversal axis: extractor additionally rejects role="code".
 */
const ROOT_EXCLUDED_ROLES = new Set(['textbox', 'searchbox', 'combobox']);
const TRAVERSAL_EXCLUDED_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'code']);

const CODE_CLASSES = ['react-code-text', 'react-file-line', 'blob-code'];

const isCodeClassElement = (element) =>
  CODE_CLASSES.some((cls) => element.classList?.contains(cls));

const getElementRole = (element) => element.getAttribute?.('role')?.toLowerCase() || '';

const hasClassOrAttr = (element, cls, attr, value) =>
  Boolean(
    (cls && element.classList?.contains(cls))
    || (attr && element.getAttribute?.(attr) === value)
    || (attr && !value && element.hasAttribute?.(attr))
  );

/**
 * Root-axis exclusion markers: notranslate class or translate="no".
 * Matches the selector's closest() marker selector (self-level only here).
 */
const hasRootNoTranslateMarker = (element) =>
  hasClassOrAttr(element, TRANSLATION_HTML.NO_TRANSLATE_CLASS, 'translate', TRANSLATION_HTML.NO_TRANSLATE_VALUE);

/**
 * Traversal-axis exclusion markers: adds IGNORE_CLASS and data-translate-ignore.
 * Matches the extractor's isExcludedElement marker check.
 */
const hasTraversalNoTranslateMarker = (element) =>
  hasRootNoTranslateMarker(element)
  || hasClassOrAttr(element, TRANSLATION_HTML.IGNORE_CLASS, null, null)
  || element.hasAttribute?.('data-translate-ignore');

/**
 * Root-axis editable check: matches isValidTextElement (truthy isContentEditable).
 */
const isRootEditable = (element) => Boolean(element.isContentEditable);

/**
 * Traversal-axis editable check: matches isExcludedElement (property OR attribute,
 * excluding explicit contenteditable="false").
 */
const isTraversalEditable = (element) => {
  if (element.isContentEditable) return true;
  const attr = element.getAttribute?.('contenteditable');
  return attr !== null && attr !== undefined && attr !== 'false';
};

/**
 * Root-axis visibility check: matches isValidTextElement, including opacity:0.
 * On getComputedStyle failure the element is treated as hidden (matches selector).
 */
const isHiddenForRoot = (element) => {
  try {
    const style = window.getComputedStyle(element);
    return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
  } catch {
    return true;
  }
};

const CAPABILITY_BY_CATEGORY = Object.freeze({
  [SelectElementCategory.CONTENT]: [SelectElementExtractionMode.V2, SelectElementExtractionMode.V3],
  [SelectElementCategory.PREFORMATTED]: [SelectElementExtractionMode.V3],
  [SelectElementCategory.NON_CONTENT]: [],
  [SelectElementCategory.FORM_CONTROL]: [],
  [SelectElementCategory.SEMANTIC_SPECIAL]: [],
});

// Hard-excluded categories reject traversal unconditionally, regardless of
// whether the element is the explicitly selected root.
const isHardExcludedCategory = (category) =>
  category === SelectElementCategory.NON_CONTENT
  || category === SelectElementCategory.FORM_CONTROL
  || category === SelectElementCategory.SEMANTIC_SPECIAL;

/**
 * Classify an element's category and extraction capability.
 * Cheap: tag lookup + role read, no DOM traversal, no style reads.
 */
function classifyCategory(element) {
  const tagName = element.tagName.toUpperCase();
  const category = TAG_CATEGORY_MAP.get(tagName) || SelectElementCategory.CONTENT;
  return {
    tagName,
    category,
    supportedModes: [...CAPABILITY_BY_CATEGORY[category]],
  };
}

/**
 * Axis A — root selectability.
 * Cheap: tag/role/editable/marker + one getComputedStyle read.
 * Used by Selector/Manager (via isValidTextElement) and the click boundary.
 */
function classifyRootAxis(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) {
    return { selectableRoot: false, reason: SelectElementReason.NOT_SELECTABLE };
  }

  const { tagName, category, supportedModes } = classifyCategory(element);

  if (ROOT_EXCLUDED_TAGS.has(tagName)) {
    return { selectableRoot: false, reason: SelectElementReason.EXCLUDED_TAG, tagName, category, supportedModes };
  }
  if (hasRootNoTranslateMarker(element)) {
    return { selectableRoot: false, reason: SelectElementReason.NOTRANSLATE, tagName, category, supportedModes };
  }
  if (isRootEditable(element)) {
    return { selectableRoot: false, reason: SelectElementReason.EDITABLE, tagName, category, supportedModes };
  }
  const role = getElementRole(element);
  if (role && ROOT_EXCLUDED_ROLES.has(role)) {
    return { selectableRoot: false, reason: SelectElementReason.EXCLUDED_ROLE, tagName, category, supportedModes };
  }
  if (isHiddenForRoot(element)) {
    return { selectableRoot: false, reason: SelectElementReason.HIDDEN, tagName, category, supportedModes };
  }

  return { selectableRoot: true, reason: null, tagName, category, supportedModes };
}

/**
 * Axis B — descendant traversal.
 * Cheap: tag/role/editable/marker only. NO style reads — the extractor's
 * TreeWalker owns hidden-node filtering separately.
 * isRoot only lifts the GitHub code-class exclusion (preserved behavior).
 * Preformatted traversal is an extraction capability derived from the
 * resolved extraction mode (V3 allows; any other/missing mode conservatively
 * rejects) — never from an independent preformatted flag.
 */
function classifyTraversalAxis(element, options = {}) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) {
    return { traversable: false, reason: SelectElementReason.NOT_SELECTABLE };
  }

  const isRoot = options.isRoot === true;
  const extractionMode = options.extractionMode || null;
  const { tagName, category, supportedModes } = classifyCategory(element);

  if (isHardExcludedCategory(category)) {
    return { traversable: false, reason: SelectElementReason.EXCLUDED_TAG, tagName, category, supportedModes };
  }

  if (category === SelectElementCategory.PREFORMATTED) {
    // Capability constraint: preformatted traversal only under V3.
    if (extractionMode !== SelectElementExtractionMode.V3) {
      return { traversable: false, reason: SelectElementReason.UNSUPPORTED_MODE, tagName, category, supportedModes };
    }
    return { traversable: true, reason: null, tagName, category, supportedModes };
  }

  if (hasTraversalNoTranslateMarker(element)) {
    return { traversable: false, reason: SelectElementReason.NOTRANSLATE, tagName, category, supportedModes };
  }
  if (isCodeClassElement(element) && !isRoot) {
    return { traversable: false, reason: SelectElementReason.CODE_CLASS, tagName, category, supportedModes };
  }
  if (isTraversalEditable(element)) {
    return { traversable: false, reason: SelectElementReason.EDITABLE, tagName, category, supportedModes };
  }
  const role = getElementRole(element);
  if (role && TRAVERSAL_EXCLUDED_ROLES.has(role)) {
    return { traversable: false, reason: SelectElementReason.EXCLUDED_ROLE, tagName, category, supportedModes };
  }

  return { traversable: true, reason: null, tagName, category, supportedModes };
}

/**
 * Full classification of an element across all three axes.
 * NOTE: computes the root axis, which performs a getComputedStyle read.
 * Not intended for per-node hot loops — use isSelectElementTraversable there.
 *
 * @param {Element} element
 * @param {Object} [options]
 * @param {boolean} [options.isRoot=false] - whether this is the selected root
 * @param {string} [options.extractionMode] - resolved extraction mode ('v2'|'v3')
 * @returns {{category: string, selectableRoot: boolean, traversable: boolean,
 *            supportedModes: string[], rootReason: (string|null), traversalReason: (string|null)}}
 */
export function classifySelectElement(element, options = {}) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) {
    return {
      category: null,
      selectableRoot: false,
      traversable: false,
      supportedModes: [],
      rootReason: SelectElementReason.NOT_SELECTABLE,
      traversalReason: SelectElementReason.NOT_SELECTABLE,
    };
  }

  const root = classifyRootAxis(element);
  const traversal = classifyTraversalAxis(element, options);

  return {
    category: root.category,
    selectableRoot: root.selectableRoot,
    traversable: traversal.traversable,
    supportedModes: root.supportedModes,
    rootReason: root.reason,
    traversalReason: traversal.reason,
  };
}

/**
 * Root-axis eligibility (selector/manager contract).
 * Cheap; performs one getComputedStyle read for the visibility check.
 *
 * @param {Element} element
 * @returns {{selectableRoot: boolean, reason: (string|null), category: (string|null), supportedModes: string[]}}
 */
export function getSelectElementRootEligibility(element) {
  const root = classifyRootAxis(element);
  return {
    selectableRoot: root.selectableRoot,
    reason: root.reason,
    category: root.category,
    supportedModes: root.supportedModes,
  };
}

/**
 * Traversal-axis eligibility (extractor contract).
 * Cheap: NO style reads, safe for per-element TreeWalker use.
 *
 * @param {Element} element
 * @param {Object} [options]
 * @param {boolean} [options.isRoot=false]
 * @param {string} [options.extractionMode] - resolved extraction mode ('v2'|'v3').
 *   Required for preformatted traversal (V3); missing/invalid modes are
 *   conservatively rejected for mode-dependent categories and ignored for
 *   ordinary content.
 * @returns {{traversable: boolean, reason: (string|null), category: (string|null), supportedModes: string[]}}
 */
export function isSelectElementTraversable(element, options = {}) {
  const traversal = classifyTraversalAxis(element, options);
  return {
    traversable: traversal.traversable,
    reason: traversal.reason,
    category: traversal.category,
    supportedModes: traversal.supportedModes,
  };
}
