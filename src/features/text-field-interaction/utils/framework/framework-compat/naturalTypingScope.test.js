import { describe, expect, it, vi, afterEach } from 'vitest';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    debugLazy: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    init: vi.fn(),
    trace: vi.fn(),
  })),
}));

vi.mock('@/shared/logging/logConstants.js', () => ({
  LOG_COMPONENTS: { FRAMEWORK: 'framework' },
}));

import { simulateNaturalTyping } from './naturalTyping.js';
import { smartTextReplacement } from './index.js';
import { captureFieldTranslationSource, getFieldSourceScope } from './fieldSourceSnapshot.js';

const layerCalls = vi.hoisted(() => ({ optimized: [], universal: [], natural: [] }));

// Force the pipeline past optimized/universal so the natural-typing branch is
// reached deterministically in jsdom (where the real fragment fallback would
// otherwise succeed first).
vi.mock('./text-insertion/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    optimizedTextInsertion: async (...args) => {
      layerCalls.optimized.push(args);
      return false;
    },
    universalTextInsertion: async (...args) => {
      layerCalls.universal.push(args);
      // Simulate the user moving selection during this awaited insertion step.
      const other = document.querySelector('[data-sabotage-target]');
      if (other?.firstChild) {
        const range = document.createRange();
        range.selectNodeContents(other.firstChild);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
      return false;
    },
  };
});

vi.mock('./naturalTyping.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    simulateNaturalTyping: async (...args) => {
      layerCalls.natural.push(args);
      return actual.simulateNaturalTyping(...args);
    },
  };
});

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

const ceSelectionScope = {
  scope: 'selection',
  targetKind: 'contenteditable',
  range: null,
  bookmark: { startPath: [0, 0], startOffset: 0, endPath: [0, 0], endOffset: 4 },
  expectedSourceText: 'test',
};

afterEach(() => {
  window.getSelection()?.removeAllRanges();
});

describe('simulateNaturalTyping scoped CE yield', () => {
  it('starts no mutation on CE selection scope, emitting nothing', async () => {
    const el = makeCE('<p>test data here</p>');
    const textNode = el.querySelector('p').firstChild;
    setLiveSelection(textNode, 0, textNode, 4);
    const seen = [];
    for (const type of ['input', 'change', 'keydown', 'keyup', 'beforeinput']) {
      el.addEventListener(type, (event) => seen.push(event.type));
    }

    const result = await simulateNaturalTyping(el, 'hello', 0, true, {
      isCurrent: () => true,
      fieldSource: ceSelectionScope,
    });

    expect(result).toBe(false);
    expect(el.textContent).toBe('test data here');
    expect(seen).toEqual([]);

    document.body.removeChild(el);
  });

  it('starts no mutation on CE full scope, emitting nothing', async () => {
    const el = makeCE('<p>test data here</p>');
    window.getSelection().removeAllRanges();
    const seen = [];
    for (const type of ['input', 'change', 'keydown', 'keyup', 'beforeinput']) {
      el.addEventListener(type, (event) => seen.push(event.type));
    }

    const result = await simulateNaturalTyping(el, 'hello', 0, false, {
      isCurrent: () => true,
      fieldSource: { scope: 'full', targetKind: 'contenteditable', range: null, bookmark: null, expectedSourceText: 'test data here' },
    });

    expect(result).toBe(false);
    expect(el.textContent).toBe('test data here');
    expect(seen).toEqual([]);

    document.body.removeChild(el);
  });

  it('keeps legacy descriptor-absent typing exactly (char-by-char with events)', async () => {
    const el = makeCE('<p>xy</p>');
    window.getSelection().removeAllRanges();
    const seen = [];
    el.addEventListener('input', (event) => seen.push(event.type));

    const result = await simulateNaturalTyping(el, 'hi', 0, false, {
      isCurrent: () => true,
    });

    expect(result).toBe(true);
    expect(el.textContent).toContain('hi');
    expect(seen.length).toBeGreaterThan(0);

    document.body.removeChild(el);
  });
});

describe('scoped CE pipeline forced past optimized/universal', () => {
  it('cannot drift output to a moved selection; another target stays untouched', async () => {
    const field = makeCE('<p>Hello <b>سلام</b> world</p>');
    const other = makeCE('<p>untouched other</p>');
    other.setAttribute('data-sabotage-target', 'true');
    const boldText = field.querySelector('b').firstChild;
    setLiveSelection(boldText, 0, boldText, 4);
    const snapshot = captureFieldTranslationSource(field);
    expect(snapshot.sourceSnapshot.scope).toBe('selection');
    const fieldSource = getFieldSourceScope(null, snapshot.sourceSnapshot);
    window.getSelection().removeAllRanges();

    // Enter the natural-typing site gate deterministically.
    layerCalls.optimized.length = 0;
    layerCalls.universal.length = 0;
    layerCalls.natural.length = 0;
    const realWindow = globalThis.window;
    const realGetSelection = realWindow.getSelection.bind(realWindow);
    vi.stubGlobal('window', {
      ...realWindow,
      location: { hostname: 'chat.openai.com' },
      getSelection: (...args) => realGetSelection(...args),
    });
    try {
      expect(window.location.hostname).toBe('chat.openai.com');

      const result = await smartTextReplacement(field, 'hello', null, null, true, {
        isCurrent: () => true,
        fieldSource,
      });

      // Optimized + universal were forced to fail; natural typing was entered
      // exactly once and yielded without mutating; the final scoped fallback
      // re-aimed and replaced only the captured range.
      expect(layerCalls.optimized.length).toBe(1);
      expect(layerCalls.universal.length).toBe(1);
      expect(layerCalls.natural.length).toBe(1);
      expect(result).toBe(true);
      expect(field.textContent).toBe('Hello hello world');
      expect(other.textContent).toBe('untouched other');
    } finally {
      vi.unstubAllGlobals();
    }

    document.body.removeChild(field);
    document.body.removeChild(other);
  });
});
