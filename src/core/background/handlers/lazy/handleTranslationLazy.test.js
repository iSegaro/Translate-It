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

describe.each([
  ['handleTranslateLazy', '@/features/translation/handlers/handleTranslate.js', 'handleTranslate', 'Failed to load translation functionality'],
  ['handleRevertTranslationLazy', '@/features/translation/handlers/handleRevertTranslation.js', 'handleRevertTranslation', 'Failed to load revert translation functionality'],
  ['handleCancelTranslationLazy', '@/features/translation/handlers/handleCancelTranslation.js', 'handleCancelTranslation', 'Failed to load cancel translation functionality'],
  ['handleCancelSessionLazy', '@/features/translation/handlers/handleCancelSession.js', 'handleCancelSession', 'Failed to load cancel session functionality'],
  ['handleCheckTranslationStatusLazy', '@/features/translation/handlers/handleCheckTranslationStatus.js', 'handleCheckTranslationStatus', 'Failed to load translation status check functionality'],
  ['handleBatchTranslateLazy', '@/features/translation/handlers/handleBatchTranslate.js', 'handleBatchTranslate', 'Failed to load batch translation functionality']
])('%s', (handlerName, importPath, exportName, safeMessage) => {
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

    vi.doMock(importPath, () => {
      const module = {};
      Object.defineProperty(module, exportName, {
        get: () => {
          throw importError;
        }
      });
      return module;
    });

    const { [handlerName]: lazyHandler } = await import('./handleTranslationLazy.js');
    const response = await lazyHandler({ action: 'UNKNOWN' });

    expect(response).toMatchObject({
      success: false,
      error: safeMessage,
      errorDetails: {
        message: safeMessage,
        type: 'NETWORK_ERROR'
      }
    });
    expect(response.errorDetails).not.toHaveProperty('cause');
    expect(response.errorDetails).not.toHaveProperty('arbitrary');
  });
});

describe('handleParentAcceptanceAckLazy', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('keeps the control-flow STALE envelope without error fields on import failure', async () => {
    vi.doMock('@/features/translation/handlers/handleParentAcceptanceAck.js', () => {
      const module = {};
      Object.defineProperty(module, 'handleParentAcceptanceAck', {
        get: () => {
          throw new Error('private loader failure');
        }
      });
      return module;
    });

    const { handleParentAcceptanceAckLazy } = await import('./handleTranslationLazy.js');
    const response = await handleParentAcceptanceAckLazy({ action: 'PARENT_ACCEPTANCE_ACK' });

    expect(response).toEqual({
      acknowledged: false,
      status: 'STALE'
    });
    expect(response).not.toHaveProperty('error');
    expect(response).not.toHaveProperty('errorDetails');
    expect(response).not.toHaveProperty('success');
  });
});
