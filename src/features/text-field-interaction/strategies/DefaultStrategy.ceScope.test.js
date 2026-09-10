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

import DefaultStrategy from './DefaultStrategy.js';
import { captureFieldTranslationSource, getFieldSourceScope } from '../utils/framework/framework-compat/fieldSourceSnapshot.js';
import { serializeContentEditableText } from '../utils/framework/framework-compat/contentEditableScope.js';

function makeCE(html) {
  const el = document.createElement('div');
  el.setAttribute('contenteditable', 'true');
  Object.defineProperty(el, 'isContentEditable', { value: true, configurable: true });
  // jsdom focus() collapses live selection while real browsers preserve it.
  el.focus = () => {};
  // eslint-disable-next-line noUnsanitized/property -- Safe: static test-fixture markup only.
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

function ceSelectionScopeFor(editor, startNode, startOffset, endNode, endOffset) {
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  const snapshot = captureFieldTranslationSource(editor);
  const fieldSource = getFieldSourceScope(null, snapshot.sourceSnapshot);
  window.getSelection().removeAllRanges();
  return { snapshot, fieldSource };
}

// DefaultStrategy delegates contentEditable straight to the shared pipeline,
// so these tests prove generic CE scope inheritance for strategies with the
// same delegation shape (Instagram, ChatGPT, YouTube). Medium keeps its own
// scoped routing (original-target direct, legacy finder) — see
// MediumStrategy.fieldScope.test.js — and Discord gates Slate explicitly.
describe('DefaultStrategy contentEditable scope inheritance', () => {
  it('replaces only the captured CE range', async () => {
    const strategy = new DefaultStrategy(null, { handle: vi.fn() });
    const field = makeCE('<p>Hello <b>سلام</b> world</p>');
    const boldText = field.querySelector('b').firstChild;
    const { snapshot, fieldSource } = ceSelectionScopeFor(field, boldText, 0, boldText, 4);

    expect(snapshot.text).toBe('سلام');

    const result = await strategy.updateElement(field, 'hello', {
      isCurrent: () => true,
      fieldSource,
    });

    expect(result).toBe(true);
    expect(field.textContent).toBe('Hello hello world');

    document.body.removeChild(field);
  });

  it('replaces the whole CE field on full scope with multiline kept', async () => {
    const strategy = new DefaultStrategy(null, { handle: vi.fn() });
    const field = makeCE('<p>line1</p><p>line2</p>');
    window.getSelection().removeAllRanges();
    const fieldSource = getFieldSourceScope(
      null,
      captureFieldTranslationSource(field).sourceSnapshot
    );

    const result = await strategy.updateElement(field, 'a\nb', {
      isCurrent: () => true,
      fieldSource,
    });

    expect(result).toBe(true);
    expect(serializeContentEditableText(field)).toBe('a\nb');

    document.body.removeChild(field);
  });

  it('keeps legacy descriptor-absent CE behavior (historical select-all full replace)', async () => {
    const strategy = new DefaultStrategy(null, { handle: vi.fn() });
    const field = makeCE('<p>Hello world</p>');
    const textNode = field.querySelector('p').firstChild;
    const range = document.createRange();
    range.setStart(textNode, 6);
    range.setEnd(textNode, 11);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);

    // Pre-existing quirk, preserved: DefaultStrategy passes (null, null) for
    // contentEditable (never reads the live CE range), so descriptor-absent
    // calls keep the historical select-all full replace.
    const result = await strategy.updateElement(field, 'mundo', {
      isCurrent: () => true,
    });

    expect(result).toBe(true);
    expect(field.textContent).toBe('mundo');

    document.body.removeChild(field);
  });
});
