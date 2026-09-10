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

import TwitterStrategy from './TwitterStrategy.js';
import { captureFieldTranslationSource, getFieldSourceScope } from '../utils/framework/framework-compat/fieldSourceSnapshot.js';
import { serializeContentEditableText } from '../utils/framework/framework-compat/contentEditableScope.js';

function makeComposer(html) {
  const container = document.createElement('div');
  container.setAttribute('data-testid', 'tweetTextarea_0');
  // eslint-disable-next-line noUnsanitized/property -- Safe: static test-fixture markup only.
  container.innerHTML = `<div contenteditable="true" role="textbox" aria-label="Post text">${html}</div>`;
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
  return fieldSource;
}

const selectionScope = {
  scope: 'selection',
  range: { start: 6, end: 10 },
  expectedSourceText: 'سلام',
};

describe('TwitterStrategy search INPUT canonical Field scope', () => {
  it('replaces only the captured range instead of the full search value', async () => {
    const strategy = new TwitterStrategy(null, { handle: vi.fn() });

    const field = document.createElement('input');
    field.type = 'text';
    field.placeholder = 'Search';
    field.value = 'Hello سلام world';
    document.body.appendChild(field);
    field.setSelectionRange(0, 0);

    const result = await strategy.updateElement(field, 'hello', {
      isCurrent: () => true,
      fieldSource: selectionScope,
    });

    expect(result).toBe(true);
    expect(field.value).toBe('Hello hello world');

    document.body.removeChild(field);
  });

  it('emits exactly one bubbling input and one bubbling change event (Field contract)', async () => {
    const strategy = new TwitterStrategy(null, { handle: vi.fn() });

    const field = document.createElement('input');
    field.type = 'text';
    field.placeholder = 'Search';
    field.value = 'Hello سلام world';
    document.body.appendChild(field);
    field.setSelectionRange(0, 0);

    const seen = [];
    field.addEventListener('input', (event) => seen.push(event));
    field.addEventListener('change', (event) => seen.push(event));

    const result = await strategy.updateElement(field, 'hello', {
      isCurrent: () => true,
      fieldSource: selectionScope,
    });

    expect(result).toBe(true);
    // Same contract as the legacy direct assignment (one input + one change,
    // both bubbling): the beforeinput layer yields without events when it does
    // not mutate, so the single succeeding fallback owns mutation+events.
    expect(seen.filter((event) => event.type === 'input')).toHaveLength(1);
    expect(seen.filter((event) => event.type === 'change')).toHaveLength(1);
    expect(seen.every((event) => event.bubbles)).toBe(true);

    document.body.removeChild(field);
  });
});

describe('TwitterStrategy composer contentEditable scope', () => {
  it('replaces only the captured range on selection scope without select-all', async () => {
    const execCommand = vi.fn(() => false);
    document.execCommand = execCommand;
    try {
      const strategy = new TwitterStrategy(null, { handle: vi.fn() });
      const { container, editor } = makeComposer('<div>Hello <b>سلام</b> world</div>');
      const boldText = editor.querySelector('b').firstChild;
      const fieldSource = ceSelectionScopeFor(editor, boldText, 0, boldText, 4);

      const result = await strategy.updateElement(editor, 'hello', {
        isCurrent: () => true,
        fieldSource,
      });

      expect(result).toBe(true);
      expect(editor.textContent).toBe('Hello hello world');
      // Partial scope must never select-all the Draft.js composer.
      expect(execCommand).not.toHaveBeenCalledWith('selectAll', expect.anything(), expect.anything());

      document.body.removeChild(container);
    } finally {
      delete document.execCommand;
    }
  });

  it('replaces the whole composer on full scope', async () => {
    const execCommand = vi.fn(() => false);
    document.execCommand = execCommand;
    try {
      const strategy = new TwitterStrategy(null, { handle: vi.fn() });
      const { container, editor } = makeComposer('<div>Hello world</div>');
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
    } finally {
      delete document.execCommand;
    }
  });

  it('preserves multiline structure in both directions', async () => {
    const execCommand = vi.fn(() => false);
    document.execCommand = execCommand;
    try {
      const strategy = new TwitterStrategy(null, { handle: vi.fn() });
      const { container, editor } = makeComposer('<div>line1</div><div>line2</div>');
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
    } finally {
      delete document.execCommand;
    }
  });

  it('emits exactly one bubbling input and change on scoped composer replace', async () => {
    const execCommand = vi.fn(() => false);
    document.execCommand = execCommand;
    try {
      const strategy = new TwitterStrategy(null, { handle: vi.fn() });
      const { container, editor } = makeComposer('<div>Hello <b>سلام</b> world</div>');
      const boldText = editor.querySelector('b').firstChild;
      const fieldSource = ceSelectionScopeFor(editor, boldText, 0, boldText, 4);

      const seen = [];
      editor.addEventListener('input', (event) => seen.push(event));
      editor.addEventListener('change', (event) => seen.push(event));

      const result = await strategy.updateElement(editor, 'hello', {
        isCurrent: () => true,
        fieldSource,
      });

      expect(result).toBe(true);
      // The pipeline already emits input/change on success, and the observer
      // suppresses the legacy manual nudge: exactly one of each, no duplicates.
      expect(seen.filter((event) => event.type === 'input')).toHaveLength(1);
      expect(seen.filter((event) => event.type === 'change')).toHaveLength(1);

      document.body.removeChild(container);
    } finally {
      delete document.execCommand;
    }
  });
});
