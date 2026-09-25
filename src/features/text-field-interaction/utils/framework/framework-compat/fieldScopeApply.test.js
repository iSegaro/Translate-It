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
  LOG_COMPONENTS: { TEXT_FIELD_INTERACTION: 'text-field', FRAMEWORK: 'framework', TRANSLATION: 'translation' },
}));

import { smartTextReplacement } from './index.js';
import { captureFieldTranslationSource, getFieldSourceScope } from './fieldSourceSnapshot.js';
import { serializeContentEditableText } from './contentEditableScope.js';

function makeCE(html) {
  const el = document.createElement('div');
  el.setAttribute('contenteditable', 'true');
  Object.defineProperty(el, 'isContentEditable', { value: true, configurable: true });
  // jsdom focus() unconditionally collapses the live selection while real
  // browsers preserve it; stub focus so scope enforcement (the SUT) is tested
  // under real focus semantics. (Native paths re-aim explicitly and are unaffected.)
  el.focus = () => {};
  // eslint-disable-next-line noUnsanitized/property -- Safe: static test-fixture markup only.
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

function setLiveSelection(startNode, startOffset, endNode, endOffset) {
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function ceSelectionScopeFor(el, startNode, startOffset, endNode, endOffset) {
  setLiveSelection(startNode, startOffset, endNode, endOffset);
  const snapshot = captureFieldTranslationSource(el);
  const fieldSource = getFieldSourceScope(null, snapshot.sourceSnapshot);
  // Drop the live selection: the apply path must restore purely from the bookmark.
  window.getSelection().removeAllRanges();
  return fieldSource;
}

const selectionScope = {
  scope: 'selection',
  range: { start: 6, end: 10 },
  expectedSourceText: 'سلام',
};
const fullScope = { scope: 'full', range: null, expectedSourceText: 'Hello سلام world' };

describe('smartTextReplacement canonical Field scope', () => {
  it('replaces only the captured range and preserves prefix/suffix', async () => {
    const field = document.createElement('textarea');
    field.value = 'Hello سلام world';
    document.body.appendChild(field);
    field.setSelectionRange(0, 0);

    const result = await smartTextReplacement(field, 'hello', null, null, true, {
      isCurrent: () => true,
      fieldSource: selectionScope,
    });

    expect(result).toBe(true);
    expect(field.value).toBe('Hello hello world');

    document.body.removeChild(field);
  });

  it('ignores a moved live selection and still replaces the captured range', async () => {
    const field = document.createElement('textarea');
    field.value = 'Hello سلام world';
    document.body.appendChild(field);
    // User moved the caret elsewhere while the request was in flight.
    field.setSelectionRange(0, 1);

    const result = await smartTextReplacement(field, 'hello', 0, 1, true, {
      isCurrent: () => true,
      fieldSource: selectionScope,
    });

    expect(result).toBe(true);
    expect(field.value).toBe('Hello hello world');

    document.body.removeChild(field);
  });

  it('applies full-field even when a selection was created after the request', async () => {
    const field = document.createElement('textarea');
    field.value = 'Hello سلام world';
    document.body.appendChild(field);
    // User selected a sub-range after a full-field request started.
    field.setSelectionRange(6, 10);

    const result = await smartTextReplacement(field, 'all new', 6, 10, true, {
      isCurrent: () => true,
      fieldSource: fullScope,
    });

    expect(result).toBe(true);
    expect(field.value).toBe('all new');

    document.body.removeChild(field);
  });

  it('refuses a stale scoped replace without mutating the field', async () => {
    const field = document.createElement('textarea');
    field.value = 'Hello CHANGED world';
    document.body.appendChild(field);

    const result = await smartTextReplacement(field, 'hello', null, null, true, {
      isCurrent: () => true,
      fieldSource: selectionScope,
    });

    expect(result).toBe(false);
    expect(field.value).toBe('Hello CHANGED world');

    document.body.removeChild(field);
  });

  it('applies a full-field replace when the value is unedited, caret movement included', async () => {
    const field = document.createElement('textarea');
    field.value = 'Hello سلام world';
    document.body.appendChild(field);
    // Caret/selection-only movement never changes element value: still valid.
    field.setSelectionRange(2, 2);

    const result = await smartTextReplacement(field, 'all new', null, null, true, {
      isCurrent: () => true,
      fieldSource: fullScope,
    });

    expect(result).toBe(true);
    expect(field.value).toBe('all new');

    document.body.removeChild(field);
  });

  it.each([
    ['appended suffix', 'Hello سلام world!'],
    ['deleted text', 'Hello سلام'],
    ['changed text', 'Hello CHANGED world'],
  ])('refuses a full-field replace when the value was edited (%s), no overwrite', async (_label, editedValue) => {
    const field = document.createElement('textarea');
    field.value = editedValue;
    document.body.appendChild(field);

    const result = await smartTextReplacement(field, 'all new', null, null, true, {
      isCurrent: () => true,
      fieldSource: fullScope,
    });

    expect(result).toBe(false);
    expect(field.value).toBe(editedValue);

    document.body.removeChild(field);
  });

  it('keeps the legacy live-selection fallback only when no descriptor is present', async () => {
    const field = document.createElement('textarea');
    field.value = 'Hello سلام world';
    document.body.appendChild(field);
    field.setSelectionRange(6, 10);

    const result = await smartTextReplacement(field, 'hello', 6, 10, true, {
      isCurrent: () => true,
    });

    expect(result).toBe(true);
    expect(field.value).toBe('Hello hello world');

    document.body.removeChild(field);
  });
});

describe('smartTextReplacement contentEditable scope', () => {
  it('replaces live-aimed CE selection without central restore (control)', async () => {
    const field = makeCE('<p>Hello <b>سلام</b> world</p>');
    const boldText = field.querySelector('b').firstChild;
    setLiveSelection(boldText, 0, boldText, 4);
    const snapshot = captureFieldTranslationSource(field);
    const fieldSource = getFieldSourceScope(null, snapshot.sourceSnapshot);

    const result = await smartTextReplacement(field, 'hello', null, null, true, {
      isCurrent: () => true,
      fieldSource,
    });

    expect(result).toBe(true);
    expect(field.textContent).toBe('Hello hello world');

    document.body.removeChild(field);
  });

  it('replaces only the captured CE range, surrounding content intact', async () => {
    const field = makeCE('<p>Hello <b>سلام</b> world</p>');
    const boldText = field.querySelector('b').firstChild;
    const fieldSource = ceSelectionScopeFor(field, boldText, 0, boldText, 4);

    const result = await smartTextReplacement(field, 'hello', null, null, true, {
      isCurrent: () => true,
      fieldSource,
    });

    expect(result).toBe(true);
    expect(field.textContent).toBe('Hello hello world');

    document.body.removeChild(field);
  });

  it('restores the captured CE range even when live selection moved away', async () => {
    const field = makeCE('<p>Hello <b>سلام</b> world</p>');
    const boldText = field.querySelector('b').firstChild;
    const fieldSource = ceSelectionScopeFor(field, boldText, 0, boldText, 4);
    // User collapsed the caret elsewhere while the request was in flight.
    const firstText = field.querySelector('p').firstChild;
    setLiveSelection(firstText, 0, firstText, 0);

    const result = await smartTextReplacement(field, 'hello', null, null, true, {
      isCurrent: () => true,
      fieldSource,
    });

    expect(result).toBe(true);
    expect(field.textContent).toBe('Hello hello world');

    document.body.removeChild(field);
  });

  it('applies a full CE replace and preserves multiline structure both directions', async () => {
    const field = makeCE('<p>line1</p><p>line2</p>');
    window.getSelection().removeAllRanges();
    const snapshot = captureFieldTranslationSource(field);
    const fieldSource = getFieldSourceScope(null, snapshot.sourceSnapshot);
    expect(snapshot.text).toBe('line1\nline2');

    const result = await smartTextReplacement(field, 'a\nb', null, null, true, {
      isCurrent: () => true,
      fieldSource,
    });

    expect(result).toBe(true);
    const { serializeContentEditableText } = await import('./contentEditableScope.js');
    expect(serializeContentEditableText(field)).toBe('a\nb');

    document.body.removeChild(field);
  });

  it('refuses a CE replace when the captured source was edited, no overwrite', async () => {
    const field = makeCE('<p>Hello <b>سلام</b> world</p>');
    const boldText = field.querySelector('b').firstChild;
    const fieldSource = ceSelectionScopeFor(field, boldText, 0, boldText, 4);

    boldText.textContent = 'CHANGED';
    const result = await smartTextReplacement(field, 'hello', null, null, true, {
      isCurrent: () => true,
      fieldSource,
    });

    expect(result).toBe(false);
    expect(field.textContent).toBe('Hello CHANGED world');

    document.body.removeChild(field);
  });

  it('refuses a full CE replace when the editor text was edited', async () => {
    const field = makeCE('<p>line1</p><p>line2</p>');
    window.getSelection().removeAllRanges();
    const fieldSource = getFieldSourceScope(null, captureFieldTranslationSource(field).sourceSnapshot);

    field.querySelectorAll('p')[1].textContent = 'line2!';
    const result = await smartTextReplacement(field, 'a\nb', null, null, true, {
      isCurrent: () => true,
      fieldSource,
    });

    expect(result).toBe(false);
    expect(field.textContent).toBe('line1line2!');

    document.body.removeChild(field);
  });

  it.each([
    ['appended trailing line', '<div>hello</div>', (field) => {
      const trailing = document.createElement('div');
      const br = document.createElement('br');
      trailing.appendChild(br);
      field.appendChild(trailing);
    }, 'hello'],
    ['prepended empty block', '<div>hello</div>', (field) => {
      const leading = document.createElement('div');
      const br = document.createElement('br');
      leading.appendChild(br);
      field.insertBefore(leading, field.firstChild);
    }, 'hello'],
    ['prepended second empty block (alias with matching text)', '<div><br></div><div>hello</div>', (field) => {
      const extra = document.createElement('div');
      const br = document.createElement('br');
      extra.appendChild(br);
      field.insertBefore(extra, field.firstChild);
    }, '\nhello'],
  ])('refuses a stale full CE replace when the user adds an edge line (%s)', async (_label, html, edit, before) => {
    const field = makeCE(html);
    window.getSelection().removeAllRanges();
    const snapshot = captureFieldTranslationSource(field);
    expect(snapshot.text).toBe(before);
    const fieldSource = getFieldSourceScope(null, snapshot.sourceSnapshot);

    edit(field);
    const result = await smartTextReplacement(field, 'translated', null, null, true, {
      isCurrent: () => true,
      fieldSource,
    });

    expect(result).toBe(false);
    expect(serializeContentEditableText(field)).not.toBe(before);

    document.body.removeChild(field);
  });

  it('refuses a stale full CE replace when a leading blank line is removed', async () => {
    const field = makeCE('<div><br></div><div><br></div><div>hello</div>');
    window.getSelection().removeAllRanges();
    const snapshot = captureFieldTranslationSource(field);
    expect(snapshot.text).toBe('\n\nhello');
    const fieldSource = getFieldSourceScope(null, snapshot.sourceSnapshot);

    field.removeChild(field.firstChild);
    expect(serializeContentEditableText(field)).toBe('\nhello');
    const result = await smartTextReplacement(field, 'translated', null, null, true, {
      isCurrent: () => true,
      fieldSource,
    });

    expect(result).toBe(false);
    expect(serializeContentEditableText(field)).toBe('\nhello');

    document.body.removeChild(field);
  });

  it('keeps an internal blank line through full CE identity', async () => {
    const field = makeCE('<div>line1</div><div><br></div><div>line3</div>');
    window.getSelection().removeAllRanges();
    const snapshot = captureFieldTranslationSource(field);
    expect(snapshot.text).toBe('line1\n\nline3');
    const fieldSource = getFieldSourceScope(null, snapshot.sourceSnapshot);

    const result = await smartTextReplacement(field, 'a\n\nc', null, null, true, {
      isCurrent: () => true,
      fieldSource,
    });

    expect(result).toBe(true);
    expect(serializeContentEditableText(field)).toBe('a\n\nc');

    document.body.removeChild(field);
  });

  it('never mutates an aliased node: same text at a drifted path fails closed', async () => {
    const field = makeCE('<p>x<i>B</i></p>');
    const iText = field.querySelector('i').firstChild;
    const fieldSource = ceSelectionScopeFor(field, iText, 0, iText, 1);

    // Structural surgery: identical path and text, swapped parent tag.
    const u = document.createElement('u');
    u.textContent = 'B';
    field.querySelector('i').replaceWith(u);

    const result = await smartTextReplacement(field, 'replaced', null, null, true, {
      isCurrent: () => true,
      fieldSource,
    });

    expect(result).toBe(false);
    expect(field.textContent).toBe('xB');

    document.body.removeChild(field);
  });

  it('replaces only a whitespace-only CE selection, surrounding text intact', async () => {
    const field = makeCE('<p>a  b</p>');
    const textNode = field.querySelector('p').firstChild;
    const fieldSource = ceSelectionScopeFor(field, textNode, 1, textNode, 3);

    const result = await smartTextReplacement(field, 'hello', null, null, true, {
      isCurrent: () => true,
      fieldSource,
    });

    expect(result).toBe(true);
    expect(field.textContent).toBe('ahellob');

    document.body.removeChild(field);
  });
});
