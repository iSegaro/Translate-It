import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  })
}));

describe('handleTranslateTextLazy', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns canonical error details when handler import fails', async () => {
    const importError = Object.assign(new Error('private loader failure'), {
      type: 'NETWORK_ERROR',
      cause: 'private cause',
      arbitrary: { ignored: true }
    });

    vi.doMock('@/features/translation/handlers/handleTranslateText.js', () => {
      const module = {};
      Object.defineProperty(module, 'handleTranslateText', {
        get: () => {
          throw importError;
        }
      });
      return module;
    });

    const { handleTranslateTextLazy } = await import('./handleTranslationLazy.js');
    const response = await handleTranslateTextLazy({ action: 'TRANSLATE_TEXT' });

    expect(response).toMatchObject({
      success: false,
      error: 'Failed to load text translation functionality',
      errorDetails: {
        message: 'Failed to load text translation functionality',
        type: 'NETWORK_ERROR'
      }
    });
    expect(response.errorDetails).not.toHaveProperty('cause');
    expect(response.errorDetails).not.toHaveProperty('arbitrary');
  });

  it('delegates successful dynamic imports without changing response', async () => {
    const response = { success: true, translation: 'سلام' };
    const handleTranslateText = vi.fn().mockResolvedValue(response);
    vi.doMock('@/features/translation/handlers/handleTranslateText.js', () => ({
      handleTranslateText
    }));

    const { handleTranslateTextLazy } = await import('./handleTranslationLazy.js');
    const message = { action: 'TRANSLATE_TEXT' };
    const sender = { id: 'sender' };
    const sendResponse = vi.fn();

    await expect(handleTranslateTextLazy(message, sender, sendResponse)).resolves.toBe(response);
    expect(handleTranslateText).toHaveBeenCalledWith(message, sender, sendResponse);
  });
});
