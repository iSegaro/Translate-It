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

import WhatsAppStrategy from './WhatsAppStrategy.js';
import { captureFieldTranslationSource, getFieldSourceScope } from '../utils/framework/framework-compat/fieldSourceSnapshot.js';
import { serializeContentEditableText } from '../utils/framework/framework-compat/contentEditableScope.js';

// Realistic WhatsApp Web composer subtree. The shared capture runs on the
// focused composer itself (no site-specific extraction in the smart path).
function makeComposer(html) {
  const container = document.createElement('div');
  container.setAttribute('aria-label', 'Type a message');
  // eslint-disable-next-line noUnsanitized/property -- Safe: static test-fixture markup only.
  container.innerHTML = `<div role="textbox" contenteditable="true" class="copyable-text selectable-text">${html}</div>`;
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

describe('WhatsAppStrategy contentEditable scope', () => {
  it('submits only the selected word and replaces only the captured range', async () => {
    const strategy = new WhatsAppStrategy(null, { handle: vi.fn() });
    const { container, editor } = makeComposer('<p>hello world</p>');
    const textNode = editor.querySelector('p').firstChild;
    const { snapshot, fieldSource } = ceSelectionScopeFor(editor, textNode, 6, textNode, 11);

    // The provider would receive only the selection (shared capture, no
    // site-specific extraction on this path).
    expect(snapshot.text).toBe('world');

    const result = await strategy.updateElement(editor, 'mundo', {
      isCurrent: () => true,
      fieldSource,
    });

    expect(result).toBe(true);
    expect(editor.textContent).toBe('hello mundo');

    document.body.removeChild(container);
  });

  it('preserves multiline structure on full replaces in both directions', async () => {
    const strategy = new WhatsAppStrategy(null, { handle: vi.fn() });
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

  it('still restores the captured range when live selection moved away', async () => {
    const strategy = new WhatsAppStrategy(null, { handle: vi.fn() });
    const { container, editor } = makeComposer('<p>hello world</p>');
    const textNode = editor.querySelector('p').firstChild;
    const { fieldSource } = ceSelectionScopeFor(editor, textNode, 6, textNode, 11);
    setLiveSelection(textNode, 0, textNode, 0);

    const result = await strategy.updateElement(editor, 'mundo', {
      isCurrent: () => true,
      fieldSource,
    });

    expect(result).toBe(true);
    expect(editor.textContent).toBe('hello mundo');

    document.body.removeChild(container);
  });
});
