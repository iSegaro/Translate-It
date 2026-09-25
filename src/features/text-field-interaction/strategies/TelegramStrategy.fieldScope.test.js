import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    init: vi.fn(),
  })),
}));

vi.mock('@/shared/logging/logConstants.js', () => ({
  LOG_COMPONENTS: { TEXT_FIELD_INTERACTION: 'text-field', FRAMEWORK: 'framework' },
}));

vi.mock('@/shared/config/config.js', () => ({
  CONFIG: { RTL_REGEX: /[\u0590-\u08FF]/ },
}));

import TelegramStrategy from './TelegramStrategy.js';
import { captureFieldTranslationSource, getFieldSourceScope } from '../utils/framework/framework-compat/fieldSourceSnapshot.js';
import { serializeContentEditableText } from '../utils/framework/framework-compat/contentEditableScope.js';

function makeComposer(html) {
  const container = document.createElement('div');
  container.setAttribute('aria-label', 'Message input');
  // eslint-disable-next-line noUnsanitized/property -- Safe: static test-fixture markup only.
  container.innerHTML = `<div class="composer_rich_textarea" contenteditable="true">${html}</div>`;
  const editor = container.firstChild;
  Object.defineProperty(editor, 'isContentEditable', { value: true, configurable: true });
  // jsdom focus() collapses live selection while real browsers preserve it.
  editor.focus = () => {};
  document.body.appendChild(container);
  return { container, editor };
}

function setLiveSelection(startNode, startOffset, endNode, endOffset) {
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function ceSelectionScopeFor(editor, startNode, startOffset, endNode, endOffset) {
  setLiveSelection(startNode, startOffset, endNode, endOffset);
  const snapshot = captureFieldTranslationSource(editor);
  const fieldSource = getFieldSourceScope(null, snapshot.sourceSnapshot);
  window.getSelection().removeAllRanges();
  return { snapshot, fieldSource };
}

describe('TelegramStrategy contentEditable scope', () => {
  it('submits only the selection and replaces only the captured range', async () => {
    const strategy = new TelegramStrategy(null, { handle: vi.fn() });
    const { container, editor } = makeComposer('<p>hello world</p>');
    const textNode = editor.querySelector('p').firstChild;
    const { snapshot, fieldSource } = ceSelectionScopeFor(editor, textNode, 6, textNode, 11);

    expect(snapshot.text).toBe('world');

    const result = await strategy.updateElement(editor, 'mundo', {
      isCurrent: () => true,
      fieldSource,
    });

    expect(result).toBe(true);
    expect(editor.textContent).toBe('hello mundo');

    document.body.removeChild(container);
  });

  it('replaces the whole composer when nothing is selected', async () => {
    const strategy = new TelegramStrategy(null, { handle: vi.fn() });
    const { container, editor } = makeComposer('<p>hello world</p>');
    window.getSelection().removeAllRanges();
    const fieldSource = getFieldSourceScope(
      null,
      captureFieldTranslationSource(editor).sourceSnapshot
    );

    const result = await strategy.updateElement(editor, 'all new', {
      isCurrent: () => true,
      fieldSource,
    });

    expect(result).toBe(true);
    expect(editor.textContent).toBe('all new');

    document.body.removeChild(container);
  });

  it('preserves multiline structure in both directions', async () => {
    const strategy = new TelegramStrategy(null, { handle: vi.fn() });
    const { container, editor } = makeComposer('<p>line1</p><p>line2</p>');
    window.getSelection().removeAllRanges();
    const snapshot = captureFieldTranslationSource(editor);
    expect(snapshot.text).toBe('line1\nline2');
    const fieldSource = getFieldSourceScope(null, snapshot.sourceSnapshot);

    const result = await strategy.updateElement(editor, 'a\nb', {
      isCurrent: () => true,
      fieldSource,
    });

    expect(result).toBe(true);
    expect(serializeContentEditableText(editor)).toBe('a\nb');

    document.body.removeChild(container);
  });
});

describe('TelegramStrategy caret behavior by scope', () => {
  function makeInput(value) {
    document.body.innerHTML = '';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    document.body.appendChild(input);
    return input;
  }

  it('does not yank the caret to the end on partial replaces', async () => {
    const strategy = new TelegramStrategy(null, { handle: vi.fn() });
    const input = makeInput('Hello سلام world');

    const result = await strategy.updateElement(input, 'hello', {
      isCurrent: () => true,
      fieldSource: {
        scope: 'selection',
        targetKind: 'native',
        range: { start: 6, end: 10 },
        expectedSourceText: 'سلام',
      },
    });

    expect(result).toBe(true);
    expect(input.value).toBe('Hello hello world');
    // Caret parks after the inserted range (6 + 5), not at the field end (16).
    expect(input.selectionStart).toBe(11);
    expect(input.selectionEnd).toBe(11);

    document.body.removeChild(input);
  });

  it('keeps parking the caret at the end on full replaces', async () => {
    const strategy = new TelegramStrategy(null, { handle: vi.fn() });
    const input = makeInput('Hello سلام world');

    const result = await strategy.updateElement(input, 'all new', {
      isCurrent: () => true,
      fieldSource: { scope: 'full', targetKind: 'native', range: null, expectedSourceText: 'Hello سلام world' },
    });

    expect(result).toBe(true);
    expect(input.value).toBe('all new');
    expect(input.selectionStart).toBe(7);
    expect(input.selectionEnd).toBe(7);

    document.body.removeChild(input);
  });
});
