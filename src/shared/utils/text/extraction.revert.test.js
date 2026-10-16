import { afterEach, describe, expect, it, vi } from 'vitest';
import { revertTranslations } from './extraction.js';

function addTranslatedContainer(id, originalText) {
  const parent = document.createElement('div');
  parent.dataset.aiwcOriginalDirection = 'rtl';
  parent.dataset.aiwcOriginalTextAlign = 'right';
  const container = document.createElement('span');
  container.setAttribute('data-aiwc-original-id', id);
  container.setAttribute('data-aiwc-original-text', originalText);
  container.textContent = 'translated';
  parent.appendChild(container);
  document.body.appendChild(parent);
  return { parent, container };
}

describe('revertTranslations legacy DOM restoration', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('returns the successful numeric count and reports a failed container without losing other restores', async () => {
    const failed = addTranslatedContainer('failed', 'original one');
    const restored = addTranslatedContainer('restored', 'original two');
    const restorationError = new Error('replace failed');
    vi.spyOn(failed.parent, 'replaceChild').mockImplementation(() => {
      throw restorationError;
    });
    const originalTexts = new Map([['entry', 'value']]);
    const onRestoreFailure = vi.fn();
    const handle = vi.fn(() => {
      throw new Error('reporting failed');
    });

    const result = await revertTranslations({
      state: { originalTexts },
      errorHandler: { handle },
      onRestoreFailure,
    });

    expect(result).toBe(1);
    expect(typeof result).toBe('number');
    expect(failed.container.isConnected).toBe(true);
    expect(restored.parent.textContent).toBe('original two');
    expect(restored.parent.style.direction).toBe('rtl');
    expect(restored.parent.style.textAlign).toBe('right');
    expect(onRestoreFailure).toHaveBeenCalledWith({ phase: 'legacy-container', error: restorationError });
    expect(handle).toHaveBeenCalledOnce();
    expect(originalTexts.size).toBe(0);
  });

  it('continues restoration and cleanup when the observer throws', async () => {
    const failed = addTranslatedContainer('failed', 'original one');
    const restored = addTranslatedContainer('restored', 'original two');
    vi.spyOn(failed.parent, 'replaceChild').mockImplementation(() => {
      throw new Error('replace failed');
    });
    const originalTexts = new Map([['entry', 'value']]);

    const result = await revertTranslations({
      state: { originalTexts },
      errorHandler: { handle: vi.fn() },
      onRestoreFailure: () => {
        throw new Error('observer failed');
      },
    });

    expect(result).toBe(1);
    expect(typeof result).toBe('number');
    expect(restored.parent.textContent).toBe('original two');
    expect(originalTexts.size).toBe(0);
  });

  it('keeps the numeric return for callers without an observer', async () => {
    const restored = addTranslatedContainer('restored', 'original');
    const originalTexts = new Map([['entry', 'value']]);

    expect(await revertTranslations({ state: { originalTexts }, errorHandler: { handle: vi.fn() } })).toBe(1);
    expect(restored.parent.textContent).toBe('original');
    expect(originalTexts.size).toBe(0);
  });
});
