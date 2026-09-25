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
  LOG_COMPONENTS: { FRAMEWORK: 'framework', TEXT_FIELD_INTERACTION: 't', TRANSLATION: 'tr' },
}));

import { smartTextReplacement } from './index.js';
import { captureFieldTranslationSource, getFieldSourceScope } from './fieldSourceSnapshot.js';

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

// Sabotage is injected with a plain timer (no module mocks): it is registered
// before the apply call with a shorter delay than the pipeline's first awaited
// smartDelay, so it deterministically lands mid-flight on a single thread.
// A flag asserts the sabotage actually ran, so the test cannot pass vacuously.
describe('CE just-in-time aim under live-selection races', () => {
  it('replaces the captured range when selection moves mid-flight', async () => {
    const field = makeCE('<p>Hello <b>سلام</b> world</p>');
    const boldText = field.querySelector('b').firstChild;
    const firstText = field.querySelector('p').firstChild;
    setLiveSelection(boldText, 0, boldText, 4);
    const snapshot = captureFieldTranslationSource(field);
    expect(snapshot.sourceSnapshot.scope).toBe('selection');
    const fieldSource = getFieldSourceScope(null, snapshot.sourceSnapshot);
    window.getSelection().removeAllRanges();

    let sabotaged = false;
    setTimeout(() => {
      sabotaged = true;
      setLiveSelection(firstText, 0, firstText, 5);
    }, 5);

    const result = await smartTextReplacement(field, 'hello', null, null, true, {
      isCurrent: () => true,
      fieldSource,
    });

    expect(sabotaged).toBe(true);
    expect(result).toBe(true);
    // Captured range replaced; the mid-flight moved range is byte-identical.
    expect(field.textContent).toBe('Hello hello world');

    document.body.removeChild(field);
  });

  it('fails closed with no overwrite when the source is edited mid-flight', async () => {
    const field = makeCE('<p>Hello <b>سلام</b> world</p>');
    const boldText = field.querySelector('b').firstChild;
    setLiveSelection(boldText, 0, boldText, 4);
    const snapshot = captureFieldTranslationSource(field);
    const fieldSource = getFieldSourceScope(null, snapshot.sourceSnapshot);
    window.getSelection().removeAllRanges();

    let sabotaged = false;
    setTimeout(() => {
      sabotaged = true;
      boldText.textContent = 'CHANGED';
    }, 5);

    const result = await smartTextReplacement(field, 'hello', null, null, true, {
      isCurrent: () => true,
      fieldSource,
    });

    expect(sabotaged).toBe(true);
    expect(result).toBe(false);
    expect(field.textContent).toBe('Hello CHANGED world');

    document.body.removeChild(field);
  });

  it('applies full scope when only the caret moves mid-flight', async () => {
    const field = makeCE('<p>line1</p><p>line2</p>');
    window.getSelection().removeAllRanges();
    const snapshot = captureFieldTranslationSource(field);
    const fieldSource = getFieldSourceScope(null, snapshot.sourceSnapshot);

    let sabotaged = false;
    setTimeout(() => {
      sabotaged = true;
      const firstText = field.querySelectorAll('p')[0].firstChild;
      setLiveSelection(firstText, 1, firstText, 1);
    }, 5);

    const result = await smartTextReplacement(field, 'all new', null, null, true, {
      isCurrent: () => true,
      fieldSource,
    });

    expect(sabotaged).toBe(true);
    expect(result).toBe(true);
    expect(field.textContent).toBe('all new');

    document.body.removeChild(field);
  });
});
