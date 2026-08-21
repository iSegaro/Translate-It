import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  })),
}));

vi.mock('@/features/shared/hover-preview/HoverPreviewLookup.js', () => ({
  hoverPreviewLookup: {
    add: vi.fn(),
    clear: vi.fn(),
  },
}));

vi.mock('@/utils/dom/DomDirectionManager.js', () => ({
  applyNodeDirection: vi.fn(),
  isRTL: vi.fn(() => false),
  restoreElementDirection: vi.fn(),
  BIDI_MARKS: { RLM: '\u200f', LRM: '\u200e' },
}));

import { PageTranslationBridge } from './PageTranslationBridge.js';
import { CONFIG } from '@/config.js';

const settings = (overrides = {}) => ({
  targetLanguage: 'en',
  lazyLoading: false,
  showOriginalOnHover: false,
  autoTranslateOnDOMChanges: false,
  excludedSelectors: [],
  attributesToTranslate: ['value', 'placeholder', 'title', 'aria-label'],
  ...overrides,
});

describe('PageTranslationBridge editable policy', () => {
  let bridge;

  afterEach(() => {
    bridge?.cleanup();
    document.body.innerHTML = '';
  });

  const translate = async (root, options = {}) => {
    const onTranslate = vi.fn((text) => {
      let state = 'pending';
      return {
        __pageTranslationSettlement: true,
        text: `Translated ${text}`,
        get state() {
          return state;
        },
        settle(outcome) {
          state = outcome;
        },
      };
    });
    bridge = new PageTranslationBridge();
    await bridge.initialize(settings(options), onTranslate);
    bridge.translate(root);
    return onTranslate;
  };

  it('uses canonical defaults without legacy editable selectors', () => {
    expect(CONFIG.WHOLE_PAGE_EXCLUDED_SELECTORS).not.toContain('textarea');
    expect(CONFIG.WHOLE_PAGE_EXCLUDED_SELECTORS).not.toContain("[contenteditable='true']");
  });

  it('protects pristine and dirty input values while translating static attributes', async () => {
    const pristine = document.createElement('input');
    pristine.setAttribute('value', 'Pristine source');
    pristine.setAttribute('placeholder', 'Pristine placeholder');
    pristine.setAttribute('title', 'Pristine title');
    pristine.setAttribute('aria-label', 'Pristine label');

    const dirty = document.createElement('input');
    dirty.setAttribute('value', 'Original default');
    dirty.value = 'User value';
    dirty.setAttribute('placeholder', 'User placeholder');
    document.body.append(pristine, dirty);

    const onTranslate = await translate(document.body);
    await vi.waitFor(() => expect(onTranslate).toHaveBeenCalledTimes(4));
    await vi.waitFor(() => expect(pristine.placeholder).toContain('Translated'));

    expect(onTranslate.mock.calls.map(([text]) => text)).toEqual([
      'Pristine placeholder',
      'Pristine title',
      'Pristine label',
      'User placeholder',
    ]);
    expect(pristine.getAttribute('value')).toBe('Pristine source');
    expect(dirty.getAttribute('value')).toBe('Original default');
    expect(dirty.value).toBe('User value');
    expect(pristine.placeholder).toContain('Translated Pristine placeholder');
    expect(pristine.title).toContain('Translated Pristine title');
    expect(pristine.getAttribute('aria-label')).toContain('Translated Pristine label');
  });

  it('protects textarea content and value while translating static attributes and restoring them', async () => {
    const textarea = document.createElement('textarea');
    textarea.textContent = 'Original content';
    textarea.setAttribute('value', 'Ignored value attribute');
    textarea.setAttribute('placeholder', 'Write here');
    textarea.setAttribute('title', 'Editor title');
    textarea.setAttribute('aria-label', 'Editor label');
    textarea.value = 'User content';
    document.body.appendChild(textarea);

    const onTranslate = await translate(document.body);
    await vi.waitFor(() => expect(onTranslate).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect(textarea.placeholder).toContain('Translated'));

    expect(onTranslate.mock.calls.map(([text]) => text)).toEqual(['Write here', 'Editor title', 'Editor label']);
    expect(textarea.value).toBe('User content');
    expect(textarea.textContent).toBe('Original content');
    expect(textarea.getAttribute('value')).toBe('Ignored value attribute');

    bridge.restore(document.body);
    expect(textarea.value).toBe('User content');
    expect(textarea.getAttribute('value')).toBe('Ignored value attribute');
    expect(textarea.placeholder).toBe('Write here');
    expect(textarea.title).toBe('Editor title');
    expect(textarea.getAttribute('aria-label')).toBe('Editor label');
  });

  it.each([
    ['true', 'true'],
    ['', 'empty'],
    ['plaintext-only', 'plaintext-only'],
  ])('rejects %s effective contenteditable text before scheduling', async (contenteditable) => {
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', contenteditable);
    editor.textContent = `${contenteditable || 'empty'} source`;
    document.body.appendChild(editor);

    const onTranslate = await translate(document.body, { autoTranslateOnDOMChanges: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(onTranslate).not.toHaveBeenCalled();
    expect(editor.textContent).toBe(`${contenteditable || 'empty'} source`);

    editor.firstChild.nodeValue = `${contenteditable || 'empty'} user edit`;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onTranslate).not.toHaveBeenCalled();
  });

  it('allows a contenteditable=false island while rejecting nested editable content', async () => {
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    editor.append('editable source');

    const falseIsland = document.createElement('div');
    falseIsland.setAttribute('contenteditable', 'false');
    falseIsland.append('static source');

    const nestedEditor = document.createElement('span');
    nestedEditor.setAttribute('contenteditable', 'true');
    nestedEditor.append('nested editable source');
    falseIsland.appendChild(nestedEditor);
    editor.appendChild(falseIsland);
    document.body.appendChild(editor);

    const onTranslate = await translate(document.body);
    await vi.waitFor(() => expect(onTranslate).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(falseIsland.textContent).toContain('Translated'));

    expect(onTranslate.mock.calls[0][0]).toBe('static source');
    expect(onTranslate.mock.calls[0][3]).toBeInstanceOf(Node);
    expect(editor.textContent).toContain('editable source');
    expect(nestedEditor.textContent).toBe('nested editable source');
    expect(falseIsland.textContent).toContain('Translated static source');

    bridge.restore(document.body);
    expect(falseIsland.textContent).toBe('static sourcenested editable source');
  });

  it('rejects inherited contenteditable text', async () => {
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', '');
    const child = document.createElement('span');
    child.textContent = 'Inherited source';
    editor.appendChild(child);
    document.body.appendChild(editor);

    const onTranslate = await translate(document.body, { autoTranslateOnDOMChanges: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(onTranslate).not.toHaveBeenCalled();
    child.firstChild.nodeValue = 'Inherited user edit';
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onTranslate).not.toHaveBeenCalled();
  });

  it('preserves explicit editable selectors for whole-root exclusion', async () => {
    const textarea = document.createElement('textarea');
    textarea.setAttribute('placeholder', 'Textarea placeholder');
    textarea.setAttribute('title', 'Textarea title');
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    editor.setAttribute('title', 'Editor title');
    document.body.append(textarea, editor);

    const onTranslate = await translate(document.body, {
      excludedSelectors: ['textarea', "[contenteditable='true']"],
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(onTranslate).not.toHaveBeenCalled();
    expect(textarea.placeholder).toBe('Textarea placeholder');
    expect(textarea.title).toBe('Textarea title');
    expect(editor.title).toBe('Editor title');
  });

  it('preserves custom subtree selectors and their attributes', async () => {
    const ignored = document.createElement('section');
    ignored.className = 'never-translate';
    ignored.setAttribute('title', 'Ignored title');
    ignored.textContent = 'Ignored text';
    document.body.appendChild(ignored);

    const onTranslate = await translate(document.body, {
      excludedSelectors: ['.never-translate'],
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(onTranslate).not.toHaveBeenCalled();
    expect(ignored.getAttribute('title')).toBe('Ignored title');
    expect(ignored.textContent).toBe('Ignored text');
  });
});
