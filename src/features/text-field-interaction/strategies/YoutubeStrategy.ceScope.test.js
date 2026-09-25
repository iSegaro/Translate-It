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

import YoutubeStrategy from './YoutubeStrategy.js';
import { captureFieldTranslationSource, getFieldSourceScope } from '../utils/framework/framework-compat/fieldSourceSnapshot.js';
import { serializeContentEditableText } from '../utils/framework/framework-compat/contentEditableScope.js';

function makeCommentBox(html) {
  const editor = document.createElement('div');
  editor.setAttribute('contenteditable', 'true');
  Object.defineProperty(editor, 'isContentEditable', { value: true, configurable: true });
  // jsdom focus() collapses live selection while real browsers preserve it.
  editor.focus = () => {};
  // eslint-disable-next-line noUnsanitized/property -- Safe: static test-fixture markup only.
  editor.innerHTML = html;
  document.body.appendChild(editor);
  return editor;
}

// YouTube delegates contentEditable straight to the shared pipeline, so CE
// scope is inherited with no strategy-local logic.
describe('YoutubeStrategy contentEditable scope inheritance', () => {
  it('replaces only the captured range', async () => {
    const strategy = new YoutubeStrategy(null, { handle: vi.fn() });
    const editor = makeCommentBox('<p>Hello <b>سلام</b> world</p>');
    const boldText = editor.querySelector('b').firstChild;
    const range = document.createRange();
    range.setStart(boldText, 0);
    range.setEnd(boldText, 4);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    const snapshot = captureFieldTranslationSource(editor);
    expect(snapshot.text).toBe('سلام');
    const fieldSource = getFieldSourceScope(null, snapshot.sourceSnapshot);
    window.getSelection().removeAllRanges();

    const result = await strategy.updateElement(editor, 'hello', {
      isCurrent: () => true,
      fieldSource,
    });

    expect(result).toBe(true);
    expect(editor.textContent).toBe('Hello hello world');

    document.body.removeChild(editor);
  });

  it('replaces the whole box on full scope with multiline kept', async () => {
    const strategy = new YoutubeStrategy(null, { handle: vi.fn() });
    const editor = makeCommentBox('<p>line1</p><p>line2</p>');
    window.getSelection().removeAllRanges();
    const fieldSource = getFieldSourceScope(
      null,
      captureFieldTranslationSource(editor).sourceSnapshot
    );

    const result = await strategy.updateElement(editor, 'a\nb', {
      isCurrent: () => true,
      fieldSource,
    });

    expect(result).toBe(true);
    expect(serializeContentEditableText(editor)).toBe('a\nb');

    document.body.removeChild(editor);
  });
});
