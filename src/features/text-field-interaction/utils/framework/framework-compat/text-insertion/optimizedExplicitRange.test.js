import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  tryExecCommandInsertion: vi.fn(),
  tryOptimizedPasteInsertion: vi.fn(),
  tryPasteInsertion: vi.fn(),
  tryBeforeInputInsertion: vi.fn(),
  tryGoogleDocsInsertion: vi.fn(),
  tryContentEditableInsertion: vi.fn(),
  tryInputInsertion: vi.fn(),
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    warn: vi.fn(),
    init: vi.fn(),
  })),
}));

vi.mock('@/shared/logging/logConstants.js', () => ({
  LOG_COMPONENTS: { FRAMEWORK: 'framework' },
}));

// Deterministic downstream doubles: no jsdom paste/execCommand dependence.
vi.mock('./strategies/index.js', () => ({
  tryExecCommandInsertion: (...args) => mocks.tryExecCommandInsertion(...args),
  tryOptimizedPasteInsertion: (...args) => mocks.tryOptimizedPasteInsertion(...args),
  tryPasteInsertion: (...args) => mocks.tryPasteInsertion(...args),
  tryBeforeInputInsertion: (...args) => mocks.tryBeforeInputInsertion(...args),
  tryGoogleDocsInsertion: (...args) => mocks.tryGoogleDocsInsertion(...args),
  tryContentEditableInsertion: (...args) => mocks.tryContentEditableInsertion(...args),
  tryInputInsertion: (...args) => mocks.tryInputInsertion(...args),
}));

import { optimizedTextInsertion } from './index.js';

describe('optimizedTextInsertion explicit range authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tryOptimizedPasteInsertion.mockResolvedValue(false);
    mocks.tryExecCommandInsertion.mockResolvedValue(false);
    mocks.tryPasteInsertion.mockResolvedValue(false);
    mocks.tryBeforeInputInsertion.mockResolvedValue(false);
    mocks.tryGoogleDocsInsertion.mockResolvedValue(false);
    mocks.tryContentEditableInsertion.mockResolvedValue(false);
    mocks.tryInputInsertion.mockResolvedValue(false);
  });

  it('hands exec-first layers an effective hasSelection=true for a collapsed live selection', async () => {
    // spellcheck=true forces the real detector onto the paste-first path.
    const el = document.createElement('textarea');
    el.setAttribute('spellcheck', 'true');
    el.value = 'Hello سلام world';
    document.body.appendChild(el);
    // Live selection collapsed while the request carries [6,10].
    el.setSelectionRange(0, 0);

    let observedAtEntry = null;
    mocks.tryOptimizedPasteInsertion.mockImplementation(async (element, text, hasSelection) => {
      observedAtEntry = {
        selectionStart: element.selectionStart,
        selectionEnd: element.selectionEnd,
        hasSelection,
      };
      return true;
    });

    const result = await optimizedTextInsertion(el, 'hello', 6, 10, {
      isCurrent: () => true,
    });

    expect(result).toBe(true);
    // Explicit range installed before strategy selection; downstream must see
    // the effective range, never the stale collapsed live state (which would
    // make paste/exec layers select-all and full-replace the scoped request).
    expect(observedAtEntry).toMatchObject({
      selectionStart: 6,
      selectionEnd: 10,
      hasSelection: true,
    });
    expect(el.selectionStart).toBe(6);
    expect(el.selectionEnd).toBe(10);

    document.body.removeChild(el);
  });

  it('keeps legacy behavior untouched when no explicit range is passed', async () => {
    const el = document.createElement('textarea');
    el.setAttribute('spellcheck', 'true');
    el.value = 'Hello سلام world';
    document.body.appendChild(el);
    el.setSelectionRange(0, 0);

    let observedHasSelection = null;
    mocks.tryOptimizedPasteInsertion.mockImplementation(async (element, text, hasSelection) => {
      observedHasSelection = hasSelection;
      return true;
    });

    const result = await optimizedTextInsertion(el, 'hello', null, null, {
      isCurrent: () => true,
    });

    expect(result).toBe(true);
    expect(observedHasSelection).toBe(false);

    document.body.removeChild(el);
  });
});
