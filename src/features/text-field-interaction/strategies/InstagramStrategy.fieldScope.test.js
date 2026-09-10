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

import InstagramStrategy from './InstagramStrategy.js';
import { captureFieldTranslationSource, getFieldSourceScope } from '../utils/framework/framework-compat/fieldSourceSnapshot.js';

// Instagram's updateElement is the same 3-line delegation shape as Default
// (visual feedback + smartTextReplacement null/null with ctx), so CE scope is
// inherited from the shared pipeline with no strategy-local logic.
describe('InstagramStrategy contentEditable scope inheritance', () => {
  it('replaces only the captured range in a direct-message composer', async () => {
    const strategy = new InstagramStrategy(null, { handle: vi.fn() });
    const editor = document.createElement('div');
    editor.setAttribute('role', 'textbox');
    editor.setAttribute('contenteditable', 'true');
    Object.defineProperty(editor, 'isContentEditable', { value: true, configurable: true });
    // jsdom focus() collapses live selection while real browsers preserve it.
    editor.focus = () => {};
    editor.innerHTML = '<p>Hello <b>سلام</b> world</p>';
    document.body.appendChild(editor);

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
});
