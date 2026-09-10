import { describe, expect, it, vi, afterEach } from 'vitest';

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
  LOG_COMPONENTS: { FRAMEWORK: 'framework' },
}));

import {
  serializeContentEditableText,
  restoreContentEditableBookmark,
  readContentEditableBookmarkText,
  validateContentEditableSelection,
  validateContentEditableFull,
  hasScopedCESelection,
  resolveScopedContentEditable,
  ensureCEAim,
  nodePathFromRoot,
  resolveNodePath,
  isValidContentEditableBookmark,
  buildMultilineFragment,
} from './contentEditableScope.js';

import { captureFieldTranslationSource, getFieldSourceScope } from './fieldSourceSnapshot.js';

// jsdom does not reflect contenteditable IDL attributes; stub the flag the way
// real browsers expose it on every CE fixture.
function makeCE(html) {
  const el = document.createElement('div');
  el.setAttribute('contenteditable', 'true');
  Object.defineProperty(el, 'isContentEditable', { value: true, configurable: true });
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

afterEach(() => {
  window.getSelection()?.removeAllRanges();
});

describe('serializeContentEditableText', () => {
  it('joins sibling block paragraphs with newlines', () => {
    const el = makeCE('<p>line1</p><p>line2</p>');
    expect(serializeContentEditableText(el)).toBe('line1\nline2');
    document.body.removeChild(el);
  });

  it('turns <br> into newlines and preserves intentional blank lines', () => {
    expect(serializeContentEditableText(makeCE('a<br>b'))).toBe('a\nb');
    const blank = makeCE('<p>a</p><p><br></p><p>b</p>');
    expect(serializeContentEditableText(blank)).toBe('a\n\nb');
    document.body.innerHTML = '';
  });

  it('keeps inline content in place and skips non-rendered elements', () => {
    const el = makeCE('<p>Hello <b>bold</b> world</p><script>var x = 1;</script><style>.a{}</style>');
    expect(serializeContentEditableText(el)).toBe('Hello bold world');
    document.body.removeChild(el);
  });

  it('preserves meaningful internal whitespace without trimming it', () => {
    const el = makeCE('<p>a  b</p>');
    expect(serializeContentEditableText(el)).toBe('a  b');
    document.body.removeChild(el);
  });

  it('does not multiply breaks through nested wrappers', () => {
    const el = makeCE('<div><div>deep</div></div>');
    expect(serializeContentEditableText(el)).toBe('deep');
    document.body.removeChild(el);
  });

  it.each([
    ['sibling blocks', '<div>line1</div><div>line2</div>', 'line1\nline2'],
    ['trailing empty block', '<div>line1</div><div><br></div>', 'line1\n'],
    ['leading empty block', '<div><br></div><div>line2</div>', '\nline2'],
    ['internal empty block', '<div>line1</div><div><br></div><div>line3</div>', 'line1\n\nline3'],
    ['trailing break at root', 'line1<br>', 'line1\n'],
    ['two leading empty blocks', '<div><br></div><div><br></div><div>hello</div>', '\n\nhello'],
    ['three leading empty blocks', '<div><br></div><div><br></div><div><br></div><div>hello</div>', '\n\n\nhello'],
  ])('keeps meaningful edge newlines: %s', (_label, html, expected) => {
    const el = makeCE(html);
    try {
      expect(serializeContentEditableText(el)).toBe(expected);
    } finally {
      document.body.removeChild(el);
    }
  });

  it('serializes an empty editor to empty, never to bare newlines', () => {
    for (const html of ['<div><br></div>', '<br>', '']) {
      const el = makeCE(html);
      try {
        expect(serializeContentEditableText(el)).toBe('');
      } finally {
        document.body.removeChild(el);
      }
    }
  });

  it('round-trips edge newlines through buildMultilineFragment', () => {
    for (const text of ['a\n', '\na', 'a\n\nb']) {
      const host = document.createElement('div');
      host.appendChild(buildMultilineFragment(text));
      expect(serializeContentEditableText(host)).toBe(text);
    }
  });
});

describe('CE capture', () => {
  it('captures only the contained selection with a serializable bookmark', () => {
    const el = makeCE('<p>Hello <b>سلام</b> world</p>');
    const boldText = el.querySelector('b').firstChild;
    setLiveSelection(boldText, 0, boldText, 4);

    const snapshot = captureFieldTranslationSource(el);

    expect(snapshot.text).toBe('سلام');
    expect(snapshot.selectionRange).toBeNull();
    expect(snapshot.sourceSnapshot).toMatchObject({
      scope: 'selection',
      targetKind: 'contenteditable',
      expectedSourceText: 'سلام',
    });
    expect(isValidContentEditableBookmark(snapshot.sourceSnapshot.bookmark)).toBe(true);
    // Serializable: no live refs survive the structured-clone round trip.
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);

    document.body.removeChild(el);
  });

  it('captures full canonical text with newlines when nothing is selected', () => {
    const el = makeCE('<p>line1</p><p>line2</p>');
    window.getSelection().removeAllRanges();

    const snapshot = captureFieldTranslationSource(el);

    expect(snapshot).toEqual({
      text: 'line1\nline2',
      selectionRange: null,
      sourceSnapshot: {
        scope: 'full',
        targetKind: 'contenteditable',
        expectedSourceText: 'line1\nline2',
      },
    });

    document.body.removeChild(el);
  });

  it('captures multiline selections spanning blocks with newlines', () => {
    const el = makeCE('<p>line1 tail</p><p>head line2</p>');
    const first = el.querySelectorAll('p')[0].firstChild;
    const second = el.querySelectorAll('p')[1].firstChild;
    setLiveSelection(first, 6, second, 4);

    const snapshot = captureFieldTranslationSource(el);

    expect(snapshot.text).toBe('tail\nhead');
    expect(snapshot.sourceSnapshot.scope).toBe('selection');

    document.body.removeChild(el);
  });

  it('rejects outside-target selections to full scope', () => {
    const target = makeCE('<p>target text</p>');
    const outsider = makeCE('<p>outside text</p>');
    const outsideText = outsider.querySelector('p').firstChild;
    setLiveSelection(outsideText, 0, outsideText, 7);

    const snapshot = captureFieldTranslationSource(target);

    expect(snapshot.sourceSnapshot.scope).toBe('full');
    expect(snapshot.text).toBe('target text');

    document.body.innerHTML = '';
  });

  it('treats collapsed selections as full scope', () => {
    const el = makeCE('<p>hello</p>');
    const textNode = el.querySelector('p').firstChild;
    setLiveSelection(textNode, 2, textNode, 2);
    expect(captureFieldTranslationSource(el).sourceSnapshot.scope).toBe('full');

    document.body.removeChild(el);
  });

  it('keeps whitespace/newline-only selections as selection scope (never escalates)', () => {
    const spaced = makeCE('<p>a  b</p>');
    const spacedText = spaced.querySelector('p').firstChild;
    setLiveSelection(spacedText, 1, spacedText, 3);

    const snapshot = captureFieldTranslationSource(spaced);

    expect(snapshot.text).toBe('  ');
    expect(snapshot.sourceSnapshot.scope).toBe('selection');
    expect(snapshot.sourceSnapshot.targetKind).toBe('contenteditable');
    expect(snapshot.sourceSnapshot.expectedSourceText).toBe('  ');
    expect(isValidContentEditableBookmark(snapshot.sourceSnapshot.bookmark)).toBe(true);

    document.body.removeChild(spaced);
  });
});

describe('bookmark restore', () => {
  it('restores the original range and reads the same source', () => {
    const el = makeCE('<p>Hello <b>سلام</b> world</p>');
    const boldText = el.querySelector('b').firstChild;
    setLiveSelection(boldText, 0, boldText, 4);

    const snapshot = captureFieldTranslationSource(el);
    // Move the live caret elsewhere: detached restore must be unaffected.
    setLiveSelection(el.querySelector('p').firstChild, 0, el.querySelector('p').firstChild, 0);

    expect(readContentEditableBookmarkText(el, snapshot.sourceSnapshot.bookmark)).toBe('سلام');

    document.body.removeChild(el);
  });

  it('fails closed on edited source, bad paths and bad offsets', () => {
    const el = makeCE('<p>Hello <b>سلام</b> world</p>');
    const boldText = el.querySelector('b').firstChild;
    setLiveSelection(boldText, 0, boldText, 4);
    const { bookmark } = captureFieldTranslationSource(el).sourceSnapshot;
    const scope = (overrides = {}) => ({
      scope: 'selection',
      targetKind: 'contenteditable',
      range: null,
      bookmark,
      expectedSourceText: 'سلام',
      ...overrides,
    });

    // Captured-source edit invalidates.
    boldText.textContent = 'CHANGED';
    expect(validateContentEditableSelection(el, scope())).toBe(false);

    // Bad paths / offsets never resolve.
    expect(restoreContentEditableBookmark(el, { ...bookmark, startPath: [99] })).toBeNull();
    expect(restoreContentEditableBookmark(el, { ...bookmark, startOffset: 9999 })).toBeNull();
    expect(validateContentEditableSelection(el, scope({ bookmark: { ...bookmark, endPath: [5, 5, 5] } }))).toBe(false);

    document.body.removeChild(el);
  });

  it('stays valid for outside edits when the bookmark still resolves to the same source', () => {
    const el = makeCE('<p>keep <b>سلام</b></p><p>change me</p>');
    const boldText = el.querySelector('b').firstChild;
    setLiveSelection(boldText, 0, boldText, 4);
    const fieldSource = getFieldSourceScope(null, captureFieldTranslationSource(el).sourceSnapshot);

    // Edit a different paragraph: bookmark and source text are untouched.
    el.querySelectorAll('p')[1].textContent = 'changed!';
    expect(validateContentEditableSelection(el, fieldSource)).toBe(true);

    document.body.removeChild(el);
  });

  it('refuses positional aliasing: same text under a swapped tag fails closed', () => {
    const el = makeCE('<p>x<i>B</i></p>');
    const iText = el.querySelector('i').firstChild;
    setLiveSelection(iText, 0, iText, 1);
    const fieldSource = getFieldSourceScope(null, captureFieldTranslationSource(el).sourceSnapshot);
    expect(fieldSource.scope).toBe('selection');

    // Structural surgery: identical path and text, different parent tag.
    // Text identity alone would false-accept; the structural lineage refuses.
    const u = document.createElement('u');
    u.textContent = 'B';
    el.querySelector('i').replaceWith(u);

    expect(validateContentEditableSelection(el, fieldSource)).toBe(false);
    expect(resolveScopedContentEditable(el, { fieldSource }).refused).toBe(true);

    document.body.removeChild(el);
  });

  it('accepts textually identical twin reorder (documented residual)', () => {
    const el = makeCE('<ul><li>B</li><li>B</li></ul>');
    const firstText = el.querySelectorAll('li')[0].firstChild;
    setLiveSelection(firstText, 0, firstText, 1);
    const fieldSource = getFieldSourceScope(null, captureFieldTranslationSource(el).sourceSnapshot);

    // True residual, described precisely: swapping indistinguishable twins
    // changes no lineage fact at any level (same tags, same child counts) and
    // no text, so no structural or textual signal exists to refuse on — and the
    // outcome is textually identical either way. Anything distinguishing
    // (insert/delete/tag-swap shifting the path, changed counts, changed text)
    // fails closed instead; this is accepted by design, not a text-search
    // relocation.
    const ul = el.querySelector('ul');
    ul.insertBefore(ul.children[1], ul.children[0]);

    expect(validateContentEditableSelection(el, fieldSource)).toBe(true);

    document.body.removeChild(el);
  });
});

describe('full CE scope', () => {
  it('validates unchanged (caret-only movement included) and refuses edits', () => {
    const el = makeCE('<p>line1</p><p>line2</p>');
    const full = getFieldSourceScope(null, captureFieldTranslationSource(el).sourceSnapshot);
    expect(full.scope).toBe('full');

    // Caret-only movement does not touch DOM text: still valid.
    const firstText = el.querySelectorAll('p')[0].firstChild;
    setLiveSelection(firstText, 1, firstText, 1);
    expect(validateContentEditableFull(el, full)).toBe(true);

    el.querySelectorAll('p')[1].textContent = 'line2!';
    expect(validateContentEditableFull(el, full)).toBe(false);

    document.body.removeChild(el);
  });

  it('keeps multiline identity exact', () => {
    const el = makeCE('<p>a</p><p>b</p>');
    const full = getFieldSourceScope(null, captureFieldTranslationSource(el).sourceSnapshot);
    expect(full.expectedSourceText).toBe('a\nb');
    expect(validateContentEditableFull(el, full)).toBe(true);
    document.body.removeChild(el);
  });
});

describe('CE scope coercion and resolution', () => {
  it('coerces CE descriptors and rejects cross-representation ambiguity', () => {
    const bookmark = { startPath: [0, 0], startOffset: 0, endPath: [0, 0], endOffset: 4 };
    const valid = getFieldSourceScope(null, {
      scope: 'selection',
      targetKind: 'contenteditable',
      bookmark,
      expectedSourceText: 'سلام',
    });
    expect(valid).toMatchObject({ scope: 'selection', targetKind: 'contenteditable' });

    // Native offsets must never ride on a CE descriptor.
    expect(
      getFieldSourceScope({ start: 0, end: 4 }, {
        scope: 'selection',
        targetKind: 'contenteditable',
        bookmark,
        expectedSourceText: 'سلام',
      }).scope
    ).toBe('invalid');

    // CE selection without a bookmark is malformed, not legacy.
    expect(
      getFieldSourceScope(null, {
        scope: 'selection',
        targetKind: 'contenteditable',
        expectedSourceText: 'سلام',
      }).scope
    ).toBe('invalid');
  });

  it('restores the live aim for valid selection and refuses malformed scopes', async () => {
    const { resolveScopedContentEditable } = await import('./contentEditableScope.js');
    const el = makeCE('<p>Hello <b>سلام</b> world</p>');
    const boldText = el.querySelector('b').firstChild;
    setLiveSelection(boldText, 0, boldText, 4);
    const fieldSource = getFieldSourceScope(null, captureFieldTranslationSource(el).sourceSnapshot);

    // Move live selection away, then resolve: aim must come back.
    setLiveSelection(el.querySelector('p').firstChild, 0, el.querySelector('p').firstChild, 0);
    const aimed = resolveScopedContentEditable(el, { isCurrent: () => true, fieldSource });
    expect(aimed).toEqual({ refused: false, restored: true });
    expect(window.getSelection().toString()).toBe('سلام');

    const refused = resolveScopedContentEditable(el, {
      isCurrent: () => true,
      fieldSource: { scope: 'invalid', targetKind: 'contenteditable', expectedSourceText: null },
    });
    expect(refused.refused).toBe(true);

    const legacy = resolveScopedContentEditable(el, null);
    expect(legacy).toEqual({ refused: false, restored: false });

    document.body.removeChild(el);
  });

  it('hasScopedCESelection gates only CE selection scopes', () => {    const ceSel = { scope: 'selection', targetKind: 'contenteditable', bookmark: {}, expectedSourceText: 'x' };
    const ceFull = { scope: 'full', targetKind: 'contenteditable', expectedSourceText: 'x' };
    const el = makeCE('<p>x</p>');
    expect(hasScopedCESelection(el, { fieldSource: ceSel })).toBe(true);
    expect(hasScopedCESelection(el, { fieldSource: ceFull })).toBe(false);
    expect(hasScopedCESelection(el, null)).toBe(false);
    expect(hasScopedCESelection(document.createElement('textarea'), { fieldSource: ceSel })).toBe(false);
    document.body.removeChild(el);
  });

  it('ensureCEAim revalidates and re-aims scoped CE, passes legacy through', () => {
    const el = makeCE('<p>Hello <b>سلام</b> world</p>');
    const boldText = el.querySelector('b').firstChild;
    setLiveSelection(boldText, 0, boldText, 4);
    const fieldSource = getFieldSourceScope(null, captureFieldTranslationSource(el).sourceSnapshot);

    // Legacy and non-CE inputs are untouched passthroughs.
    expect(ensureCEAim(el, null)).toBe(true);
    expect(ensureCEAim(document.createElement('textarea'), { fieldSource })).toBe(true);

    // Moved live selection is re-aimed at the captured bookmark.
    setLiveSelection(el.querySelector('p').firstChild, 0, el.querySelector('p').firstChild, 0);
    expect(ensureCEAim(el, { fieldSource })).toBe(true);
    expect(window.getSelection().toString()).toBe('سلام');

    // Edited source fails closed.
    boldText.textContent = 'CHANGED';
    expect(ensureCEAim(el, { fieldSource })).toBe(false);

    document.body.removeChild(el);
  });

  it('exposes node path round-trips', () => {
    const el = makeCE('<p>a<b>c</b></p>');
    const target = el.querySelector('b').firstChild;
    const path = nodePathFromRoot(el, target);
    expect(resolveNodePath(el, path)).toBe(target);
    expect(resolveNodePath(el, [9])).toBeNull();
    expect(nodePathFromRoot(el, document.createElement('span'))).toBeNull();
    document.body.removeChild(el);
  });

  it('builds fragments preserving newlines as breaks', () => {
    const fragment = buildMultilineFragment('a\n\nb');
    const host = document.createElement('div');
    host.appendChild(fragment);
    expect(host.querySelectorAll('br')).toHaveLength(2);
    expect(host.textContent).toBe('ab');
    // Round-trip through the canonical serializer restores the breaks.
    expect(serializeContentEditableText(host)).toBe('a\n\nb');
  });
});
