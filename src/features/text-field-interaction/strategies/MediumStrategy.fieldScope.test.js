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

import MediumStrategy from './MediumStrategy.js';
import { captureFieldTranslationSource, getFieldSourceScope } from '../utils/framework/framework-compat/fieldSourceSnapshot.js';
import { serializeContentEditableText } from '../utils/framework/framework-compat/contentEditableScope.js';

function makeEditor(html) {
  const editor = document.createElement('div');
  editor.setAttribute('role', 'textbox');
  editor.setAttribute('contenteditable', 'true');
  Object.defineProperty(editor, 'isContentEditable', { value: true, configurable: true });
  // jsdom focus() collapses live selection while real browsers preserve it.
  editor.focus = () => {};
  // eslint-disable-next-line noUnsanitized/property -- Safe: static test-fixture markup only.
  editor.innerHTML = html;
  document.body.appendChild(editor);
  return editor;
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

describe('MediumStrategy explicit CE descriptor routing', () => {
  it('replaces only the captured range on CE selection, moved caret included', async () => {
    const strategy = new MediumStrategy(null, { handle: vi.fn() });
    const findSpy = vi.spyOn(strategy, 'findMediumTextField');
    const editor = makeEditor('<p>para <b>one</b> here</p><p>para two</p>');
    const boldText = editor.querySelector('b').firstChild;
    const fieldSource = ceSelectionScopeFor(editor, boldText, 0, boldText, 3);
    // Caret drifts into the other paragraph while the request is in flight.
    const otherText = editor.querySelectorAll('p')[1].firstChild;
    setLiveSelection(otherText, 0, otherText, 0);

    const result = await strategy.updateElement(editor, 'uno', {
      isCurrent: () => true,
      fieldSource,
    });

    expect(result).toBe(true);
    expect(editor.textContent).toBe('para uno herepara two');
    // The descriptor is never applied against a resolved child paragraph/editor
    // root first: original request target goes straight to shared pipeline.
    expect(findSpy).not.toHaveBeenCalled();

    document.body.removeChild(editor);
  });

  it('replaces the whole editor on CE full scope with caret in one paragraph', async () => {
    const strategy = new MediumStrategy(null, { handle: vi.fn() });
    const findSpy = vi.spyOn(strategy, 'findMediumTextField');
    const editor = makeEditor('<p>para one</p><p>para two</p>');
    const firstText = editor.querySelectorAll('p')[0].firstChild;
    setLiveSelection(firstText, 1, firstText, 1);
    window.getSelection().removeAllRanges();
    const snapshot = captureFieldTranslationSource(editor);
    expect(snapshot.text).toBe('para one\npara two');
    const fieldSource = getFieldSourceScope(null, snapshot.sourceSnapshot);

    const result = await strategy.updateElement(editor, 'todo nuevo', {
      isCurrent: () => true,
      fieldSource,
    });

    expect(result).toBe(true);
    expect(serializeContentEditableText(editor)).toBe('todo nuevo');
    expect(findSpy).not.toHaveBeenCalled();

    document.body.removeChild(editor);
  });

  it('fails closed when the original target is incompatible with a CE descriptor', async () => {
    const strategy = new MediumStrategy(null, { handle: vi.fn() });
    const editor = makeEditor('<p>hello</p>');

    const result = await strategy.updateElement(document.createElement('div'), 'x', {
      isCurrent: () => true,
      fieldSource: {
        scope: 'selection',
        targetKind: 'contenteditable',
        range: null,
        bookmark: { startPath: [0, 0], startOffset: 0, endPath: [0, 0], endOffset: 5, startParent: null, endParent: null },
        expectedSourceText: 'hello',
      },
    });

    // A bare div resolves no Medium field: historical lookup fails closed too.
    expect(result).toBe(false);

    document.body.removeChild(editor);
  });

  it('keeps historical full behavior for legacy descriptor-absent calls', async () => {
    const strategy = new MediumStrategy(null, { handle: vi.fn() });
    const editor = makeEditor('<p>hello world</p>');
    const textNode = editor.querySelector('p').firstChild;
    setLiveSelection(textNode, 6, textNode, 11);

    // Pre-existing quirk, preserved: strategies pass (null, null) for CE, so
    // descriptor-absent calls keep the historical select-all full replace.
    const result = await strategy.updateElement(editor, 'mundo', {
      isCurrent: () => true,
    });

    expect(result).toBe(true);
    expect(editor.textContent).toBe('mundo');

    document.body.removeChild(editor);
  });

  it('keeps historical current-line behavior for legacy calls without selection', async () => {
    const strategy = new MediumStrategy(null, { handle: vi.fn() });
    const editor = makeEditor('<p>para one</p>');
    window.getSelection().removeAllRanges();

    const result = await strategy.updateElement(editor, 'todo nuevo', {
      isCurrent: () => true,
    });

    expect(result).toBe(true);
    expect(editor.textContent).toBe('todo nuevo');

    document.body.removeChild(editor);
  });
});
