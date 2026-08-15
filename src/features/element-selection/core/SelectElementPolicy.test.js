import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  SelectElementExtractionMode,
  SelectElementCategory,
  SelectElementReason,
  classifySelectElement,
  getSelectElementRootEligibility,
  isSelectElementTraversable,
} from './SelectElementPolicy.js';

/**
 * Creates an element of the given tag inside the document body.
 * @param {string} tagName - Tag name
 * @returns {HTMLElement}
 */
function makeElement(tagName) {
  const el = document.createElement(tagName);
  document.body.appendChild(el);
  return el;
}

function mockComputedStyle(style) {
  vi.spyOn(window, 'getComputedStyle').mockReturnValue(style);
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('SelectElementPolicy', () => {
  describe('classifySelectElement', () => {
    it('rejects non-element nodes', () => {
      const result = classifySelectElement(null);
      expect(result.selectableRoot).toBe(false);
      expect(result.traversable).toBe(false);
      expect(result.rootReason).toBe(SelectElementReason.NOT_SELECTABLE);
    });

    it('classifies DIV as CONTENT with both extraction modes', () => {
      const result = classifySelectElement(makeElement('div'));
      expect(result.category).toBe(SelectElementCategory.CONTENT);
      expect(result.selectableRoot).toBe(true);
      expect(result.traversable).toBe(true);
      expect(result.supportedModes).toEqual([SelectElementExtractionMode.V2, SelectElementExtractionMode.V3]);
    });

    it('allows BUTTON traversal as root and as nested descendant; classifies as CONTENT', () => {
      const el = makeElement('button');
      el.textContent = 'Submit';
      const root = getSelectElementRootEligibility(el);
      expect(root.selectableRoot).toBe(true);
      expect(root.category).toBe(SelectElementCategory.CONTENT);
      expect(root.supportedModes).toEqual([SelectElementExtractionMode.V2, SelectElementExtractionMode.V3]);

      for (const mode of [SelectElementExtractionMode.V2, SelectElementExtractionMode.V3]) {
        const asRoot = isSelectElementTraversable(el, { isRoot: true, extractionMode: mode });
        expect(asRoot.traversable).toBe(true);
        expect(asRoot.category).toBe(SelectElementCategory.CONTENT);

        const nested = isSelectElementTraversable(el, { isRoot: false, extractionMode: mode });
        expect(nested.traversable).toBe(true);
        expect(nested.category).toBe(SelectElementCategory.CONTENT);
      }

      const defaultCall = isSelectElementTraversable(el);
      expect(defaultCall.traversable).toBe(true);
    });

    it('rejects SELECT/OPTION as roots; SELECT is a traversable label container', () => {
      const select = makeElement('select');
      const selectRoot = getSelectElementRootEligibility(select);
      expect(selectRoot.selectableRoot).toBe(false);
      expect(selectRoot.category).toBe(SelectElementCategory.CHOICE_LABEL);

      // Container: traversal passes through so option children are visited.
      for (const mode of [SelectElementExtractionMode.V2, SelectElementExtractionMode.V3]) {
        const nested = isSelectElementTraversable(select, { extractionMode: mode });
        expect(nested.traversable).toBe(true);
        expect(nested.category).toBe(SelectElementCategory.CHOICE_LABEL);
        expect(nested.supportedModes).toEqual([SelectElementExtractionMode.V2, SelectElementExtractionMode.V3]);
      }
    });

    it('rejects OPTION as root; traversable only with an explicit value attribute', () => {
      const implicit = makeElement('option');
      implicit.textContent = 'English';
      expect(getSelectElementRootEligibility(implicit).selectableRoot).toBe(false);
      expect(getSelectElementRootEligibility(implicit).category).toBe(SelectElementCategory.CHOICE_LABEL);

      for (const mode of [SelectElementExtractionMode.V2, SelectElementExtractionMode.V3]) {
        const traversal = isSelectElementTraversable(implicit, { extractionMode: mode });
        expect(traversal.traversable).toBe(false);
        expect(traversal.reason).toBe(SelectElementReason.IMPLICIT_OPTION_VALUE);

        const explicit = makeElement('option');
        explicit.setAttribute('value', 'en');
        explicit.textContent = 'English';
        const safe = isSelectElementTraversable(explicit, { extractionMode: mode });
        expect(safe.traversable).toBe(true);
        expect(safe.category).toBe(SelectElementCategory.CHOICE_LABEL);
        expect(safe.supportedModes).toEqual([SelectElementExtractionMode.V2, SelectElementExtractionMode.V3]);
      }
    });

    it('keeps PRE/CODE selectable as root; traversable only under V3 mode', () => {
      for (const tag of ['pre', 'code']) {
        const el = makeElement(tag);
        expect(getSelectElementRootEligibility(el).selectableRoot).toBe(true);
        expect(isSelectElementTraversable(el).traversable).toBe(false);
        expect(isSelectElementTraversable(el, { extractionMode: SelectElementExtractionMode.V2 }).traversable).toBe(false);
        const v3 = isSelectElementTraversable(el, { extractionMode: SelectElementExtractionMode.V3 });
        expect(v3.traversable).toBe(true);
        expect(v3.category).toBe(SelectElementCategory.PREFORMATTED);
        expect(v3.supportedModes).toEqual([SelectElementExtractionMode.V3]);
      }
    });

    it('rejects KBD/SAMP as root; traversable only under V3 mode', () => {
      for (const tag of ['kbd', 'samp']) {
        const el = makeElement(tag);
        expect(getSelectElementRootEligibility(el).selectableRoot).toBe(false);
        expect(isSelectElementTraversable(el).traversable).toBe(false);
        expect(isSelectElementTraversable(el, { extractionMode: SelectElementExtractionMode.V2 }).traversable).toBe(false);
        const v3 = isSelectElementTraversable(el, { extractionMode: SelectElementExtractionMode.V3 });
        expect(v3.traversable).toBe(true);
        expect(v3.supportedModes).toEqual([SelectElementExtractionMode.V3]);
      }
    });

    it('rejects PREFORMATTED with UNSUPPORTED_MODE under missing/invalid mode (conservative)', () => {
      for (const tag of ['pre', 'code', 'kbd', 'samp']) {
        const el = makeElement(tag);
        const missing = isSelectElementTraversable(el);
        expect(missing.traversable).toBe(false);
        expect(missing.reason).toBe(SelectElementReason.UNSUPPORTED_MODE);

        const invalid = isSelectElementTraversable(el, { extractionMode: 'v9' });
        expect(invalid.traversable).toBe(false);
        expect(invalid.reason).toBe(SelectElementReason.UNSUPPORTED_MODE);
      }
    });

    it('is mode-independent for ordinary content', () => {
      for (const mode of [SelectElementExtractionMode.V2, SelectElementExtractionMode.V3, undefined, 'v9']) {
        const el = makeElement('div');
        expect(isSelectElementTraversable(el, { extractionMode: mode }).traversable).toBe(true);
      }
    });

    it('rejects INPUT/TEXTAREA on both axes', () => {
      for (const tag of ['input', 'textarea']) {
        const el = makeElement(tag);
        expect(getSelectElementRootEligibility(el).selectableRoot).toBe(false);
        expect(isSelectElementTraversable(el).traversable).toBe(false);
      }
    });

    it('rejects SCRIPT/STYLE/SVG on both axes', () => {
      for (const tag of ['script', 'style', 'svg']) {
        const el = makeElement(tag);
        expect(getSelectElementRootEligibility(el).selectableRoot).toBe(false);
        expect(isSelectElementTraversable(el).traversable).toBe(false);
      }
    });

    it('rejects TIME/RUBY/RT/RP on both axes', () => {
      for (const tag of ['time', 'ruby', 'rt', 'rp']) {
        const el = makeElement(tag);
        expect(getSelectElementRootEligibility(el).selectableRoot).toBe(false);
        expect(isSelectElementTraversable(el).traversable).toBe(false);
      }
    });
  });

  describe('role handling', () => {
    it('treats role=button as ordinary CONTENT; traversable as root and nested', () => {
      const el = makeElement('div');
      el.setAttribute('role', 'button');
      const root = getSelectElementRootEligibility(el);
      expect(root.selectableRoot).toBe(true);
      expect(root.category).toBe(SelectElementCategory.CONTENT);
      expect(root.supportedModes).toEqual([SelectElementExtractionMode.V2, SelectElementExtractionMode.V3]);

      for (const mode of [SelectElementExtractionMode.V2, SelectElementExtractionMode.V3]) {
        const asRoot = isSelectElementTraversable(el, { isRoot: true, extractionMode: mode });
        expect(asRoot.traversable).toBe(true);
        expect(asRoot.category).toBe(SelectElementCategory.CONTENT);

        const nested = isSelectElementTraversable(el, { isRoot: false, extractionMode: mode });
        expect(nested.traversable).toBe(true);
        expect(nested.category).toBe(SelectElementCategory.CONTENT);
      }
    });

    it('keeps INPUT role=button as FORM_CONTROL and traversal-excluded', () => {
      const el = makeElement('input');
      el.setAttribute('role', 'button');
      const root = getSelectElementRootEligibility(el);
      expect(root.selectableRoot).toBe(false);
      expect(root.category).toBe(SelectElementCategory.FORM_CONTROL);
      const traversal = isSelectElementTraversable(el, { isRoot: true, extractionMode: SelectElementExtractionMode.V2 });
      expect(traversal.traversable).toBe(false);
      expect(traversal.category).toBe(SelectElementCategory.FORM_CONTROL);
    });

    it('rejects interactive roots carrying notranslate or editable safety markers', () => {
      const notranslate = makeElement('button');
      notranslate.setAttribute('translate', 'no');
      expect(isSelectElementTraversable(notranslate, { isRoot: true, extractionMode: SelectElementExtractionMode.V2 }).traversable).toBe(false);

      const editable = makeElement('button');
      Object.defineProperty(editable, 'isContentEditable', { value: true });
      expect(isSelectElementTraversable(editable, { isRoot: true, extractionMode: SelectElementExtractionMode.V3 }).traversable).toBe(false);
    });

    it('rejects role=textbox on both axes', () => {
      const el = makeElement('div');
      el.setAttribute('role', 'textbox');
      expect(getSelectElementRootEligibility(el).selectableRoot).toBe(false);
      expect(isSelectElementTraversable(el).traversable).toBe(false);
    });

    it('preserves role=code asymmetry: root-eligible but traversal-excluded', () => {
      const el = makeElement('div');
      el.setAttribute('role', 'code');
      expect(getSelectElementRootEligibility(el).selectableRoot).toBe(true);
      expect(isSelectElementTraversable(el).traversable).toBe(false);
      expect(isSelectElementTraversable(el).reason).toBe(SelectElementReason.EXCLUDED_ROLE);
      // Mode capability must not attach to the role exclusion: role="code" stays
      // role-excluded (EXCLUDED_ROLE) under V2, never UNSUPPORTED_MODE.
      const v2 = isSelectElementTraversable(el, { extractionMode: SelectElementExtractionMode.V2 });
      expect(v2.traversable).toBe(false);
      expect(v2.reason).toBe(SelectElementReason.EXCLUDED_ROLE);
      expect(v2.reason).not.toBe(SelectElementReason.UNSUPPORTED_MODE);
    });
  });

  describe('editable and marker handling', () => {
    it('rejects contenteditable elements on both axes', () => {
      const el = makeElement('div');
      el.setAttribute('contenteditable', 'true');
      // Simulate a real browser (jsdom leaves isContentEditable undefined)
      Object.defineProperty(el, 'isContentEditable', { value: true, configurable: true });
      expect(getSelectElementRootEligibility(el).selectableRoot).toBe(false);
      expect(getSelectElementRootEligibility(el).reason).toBe(SelectElementReason.EDITABLE);
      expect(isSelectElementTraversable(el).traversable).toBe(false);
    });

    it('rejects contenteditable="" (empty) on traversal axis', () => {
      const el = makeElement('div');
      el.setAttribute('contenteditable', '');
      expect(isSelectElementTraversable(el).traversable).toBe(false);
      expect(isSelectElementTraversable(el).reason).toBe(SelectElementReason.EDITABLE);
    });

    it('allows explicit contenteditable="false"', () => {
      const el = makeElement('div');
      el.setAttribute('contenteditable', 'false');
      expect(isSelectElementTraversable(el).traversable).toBe(true);
    });

    it('rejects notranslate class on both axes', () => {
      const el = makeElement('div');
      el.classList.add('notranslate');
      expect(getSelectElementRootEligibility(el).selectableRoot).toBe(false);
      expect(isSelectElementTraversable(el).traversable).toBe(false);
    });

    it('rejects translate=no on both axes', () => {
      const el = makeElement('div');
      el.setAttribute('translate', 'no');
      expect(getSelectElementRootEligibility(el).selectableRoot).toBe(false);
      expect(isSelectElementTraversable(el).traversable).toBe(false);
    });

    it('rejects ti-ignore-translation and data-translate-ignore on traversal axis only', () => {
      const ignore = makeElement('div');
      ignore.classList.add('ti-ignore-translation');
      expect(getSelectElementRootEligibility(ignore).selectableRoot).toBe(true);
      expect(isSelectElementTraversable(ignore).traversable).toBe(false);

      const dataIgnore = makeElement('div');
      dataIgnore.setAttribute('data-translate-ignore', '');
      expect(getSelectElementRootEligibility(dataIgnore).selectableRoot).toBe(true);
      expect(isSelectElementTraversable(dataIgnore).traversable).toBe(false);
    });
  });

  describe('visibility handling', () => {
    it('rejects display:none on root axis only (traversal axis has no style reads)', () => {
      const el = makeElement('div');
      mockComputedStyle({ display: 'none', visibility: 'visible', opacity: '1' });
      expect(getSelectElementRootEligibility(el).selectableRoot).toBe(false);
      expect(getSelectElementRootEligibility(el).reason).toBe(SelectElementReason.HIDDEN);
      vi.restoreAllMocks();
      expect(isSelectElementTraversable(el).traversable).toBe(true);
    });

    it('preserves opacity:0 asymmetry: root-excluded but traversal-eligible', () => {
      const el = makeElement('div');
      mockComputedStyle({ display: 'block', visibility: 'visible', opacity: '0' });
      expect(getSelectElementRootEligibility(el).selectableRoot).toBe(false);
      vi.restoreAllMocks();
      expect(isSelectElementTraversable(el).traversable).toBe(true);
    });
  });

  describe('code-class handling', () => {
    it('rejects GitHub code classes on traversal axis unless isRoot', () => {
      for (const cls of ['react-code-text', 'react-file-line', 'blob-code']) {
        const el = makeElement('div');
        el.classList.add(cls);
        expect(isSelectElementTraversable(el).traversable).toBe(false);
        expect(isSelectElementTraversable(el).reason).toBe(SelectElementReason.CODE_CLASS);
        expect(isSelectElementTraversable(el, { isRoot: true }).traversable).toBe(true);
      }
    });
  });
});
