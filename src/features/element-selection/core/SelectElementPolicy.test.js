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

    it('keeps BUTTON selectable as root but rejects traversal', () => {
      const el = makeElement('button');
      el.textContent = 'Submit';
      const root = getSelectElementRootEligibility(el);
      const traversal = isSelectElementTraversable(el);
      expect(root.selectableRoot).toBe(true);
      expect(traversal.traversable).toBe(false);
      expect(traversal.reason).toBe(SelectElementReason.EXCLUDED_TAG);
    });

    it('keeps SELECT/OPTION selectable as root but rejects traversal', () => {
      for (const tag of ['select', 'option']) {
        const el = makeElement(tag);
        const root = getSelectElementRootEligibility(el);
        const traversal = isSelectElementTraversable(el);
        expect(root.selectableRoot).toBe(true);
        expect(traversal.traversable).toBe(false);
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
    it('accepts role=button on both axes (not excluded)', () => {
      const el = makeElement('div');
      el.setAttribute('role', 'button');
      expect(getSelectElementRootEligibility(el).selectableRoot).toBe(true);
      expect(isSelectElementTraversable(el).traversable).toBe(true);
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
