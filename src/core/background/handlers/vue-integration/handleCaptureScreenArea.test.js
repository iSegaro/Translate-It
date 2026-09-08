import { beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';
import { handleCaptureScreenArea } from './handleCaptureScreenArea.js';
import { settingsManager } from '@/shared/managers/SettingsManager.js';

const mocks = vi.hoisted(() => ({
  captureVisibleTab: vi.fn(),
  sendMessage: vi.fn(),
  sendTabMessage: vi.fn(),
  hasDocument: vi.fn(),
  createDocument: vi.fn(),
  closeDocument: vi.fn(),
  acquireLease: vi.fn(),
  releaseLease: vi.fn(),
  recognize: vi.fn(),
  errorHandler: vi.fn()
}));

vi.mock('@/shared/managers/SettingsManager.js', () => ({
  settingsManager: {
    getAsync: vi.fn()
  }
}));

vi.mock('@/shared/runtime/OffscreenRuntimeLeaseManager.js', () => ({
  offscreenRuntimeLeaseManager: {
    acquire: mocks.acquireLease,
    release: mocks.releaseLease
  }
}));

vi.mock('@/features/screen-capture/services/ocrEngine.js', () => ({
  recognize: mocks.recognize
}));

vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: class {
    handle(...args) {
      return mocks.errorHandler(...args);
    }
  }
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  })
}));

describe('handleCaptureScreenArea settings access', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    browser.tabs.captureVisibleTab = mocks.captureVisibleTab;
    browser.tabs.sendMessage = mocks.sendTabMessage;
    browser.runtime.sendMessage = mocks.sendMessage;
    browser.offscreen = {
      hasDocument: mocks.hasDocument,
      createDocument: mocks.createDocument,
      closeDocument: mocks.closeDocument
    };

    mocks.captureVisibleTab.mockResolvedValue('image-data');
    mocks.acquireLease.mockResolvedValue(true);
    mocks.releaseLease.mockResolvedValue(true);
    mocks.sendMessage.mockResolvedValue({ success: true, text: 'recognized text' });
    mocks.sendTabMessage.mockResolvedValue(undefined);
    mocks.recognize.mockResolvedValue('recognized text');
    vi.mocked(settingsManager.getAsync).mockImplementation(async key => ({
      OCR_DEFAULT_LANG: 'eng',
      SOURCE_LANGUAGE: 'auto'
    })[key]);
  });

  it('waits for first-use settings readiness before OCR', async () => {
    let resolveSettings;
    const settingsReady = new Promise(resolve => {
      resolveSettings = resolve;
    });
    vi.mocked(settingsManager.getAsync).mockImplementation(() => settingsReady);

    const resultPromise = handleCaptureScreenArea({ data: {} }, { tab: { id: 42 } });

    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(settingsManager.getAsync).toHaveBeenCalledTimes(2);
    expect(settingsManager.getAsync).toHaveBeenCalledWith('OCR_DEFAULT_LANG');
    expect(settingsManager.getAsync).toHaveBeenCalledWith('SOURCE_LANGUAGE');

    resolveSettings('eng');

    await expect(resultPromise).resolves.toMatchObject({
      success: true,
      data: { text: 'recognized text' }
    });
  });

  it('preserves explicit OCR language precedence and capture result delivery', async () => {
    const result = await handleCaptureScreenArea(
      { data: { ocrLang: 'fr', coordinates: { x: 1, y: 2 }, captureId: 'capture-1' } },
      { tab: { id: 42 } }
    );

    expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      target: 'offscreen',
      data: expect.objectContaining({
        image: 'image-data',
        coordinates: { x: 1, y: 2 },
        lang: 'fra'
      })
    }));
    expect(mocks.acquireLease).toHaveBeenCalledWith({
      owner: 'screen-capture',
      leaseId: 'capture-1',
      requiredReasons: ['WORKERS']
    });
    expect(mocks.releaseLease).toHaveBeenCalledWith(mocks.acquireLease.mock.calls[0][0]);
    expect(mocks.acquireLease.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.sendMessage.mock.invocationCallOrder[0]
    );
    expect(mocks.releaseLease.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.sendMessage.mock.invocationCallOrder[0]
    );
    expect(mocks.sendTabMessage).toHaveBeenCalledWith(42, expect.objectContaining({
      data: expect.objectContaining({
        text: 'recognized text',
        captureId: 'capture-1',
        captureType: 'area'
      })
    }));
    expect(result).toMatchObject({
      success: true,
      data: expect.objectContaining({
        imageData: 'image-data',
        coordinates: { x: 1, y: 2 },
        captureId: 'capture-1'
      })
    });
  });

  it('uses manager-provided canonical defaults when persisted values are absent', async () => {
    vi.mocked(settingsManager.getAsync).mockResolvedValueOnce('eng').mockResolvedValueOnce('auto');

    await handleCaptureScreenArea({ data: {} }, { tab: { id: 42 } });

    expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ lang: 'eng' })
    }));
  });

  it('releases Chrome lease when OCR fails', async () => {
    mocks.sendMessage.mockRejectedValueOnce(new Error('OCR failed'));

    const result = await handleCaptureScreenArea(
      { data: { captureId: 'capture-error' } },
      { tab: { id: 42 } }
    );

    expect(result).toEqual({ success: false, error: 'OCR failed' });
    expect(mocks.acquireLease).toHaveBeenCalledWith({
      owner: 'screen-capture',
      leaseId: 'capture-error',
      requiredReasons: ['WORKERS']
    });
    expect(mocks.releaseLease).toHaveBeenCalledWith(mocks.acquireLease.mock.calls[0][0]);
    expect(mocks.releaseLease.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.sendMessage.mock.invocationCallOrder[0]
    );
  });

  it('returns string-safe unsupported response when Chrome offscreen lease is unavailable', async () => {
    browser.offscreen = undefined;
    mocks.acquireLease.mockResolvedValue(false);

    const result = await handleCaptureScreenArea(
      { data: { captureId: 'firefox-capture' } },
      { tab: { id: 42 } }
    );

    expect(result).toEqual({
      success: false,
      error: 'Screen capture is not supported in this browser or context.',
      errorType: 'SCREEN_CAPTURE_NOT_SUPPORTED'
    });
    expect(mocks.acquireLease).toHaveBeenCalledWith({
      owner: 'screen-capture',
      leaseId: 'firefox-capture',
      requiredReasons: ['WORKERS']
    });
    expect(mocks.releaseLease).not.toHaveBeenCalled();
    expect(mocks.recognize).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('returns string-safe unsupported response when Chrome offscreen capability is incomplete', async () => {
    browser.offscreen = {
      hasDocument: mocks.hasDocument,
      createDocument: mocks.createDocument
    };
    mocks.acquireLease.mockResolvedValue(false);

    const result = await handleCaptureScreenArea(
      { data: { captureId: 'partial-offscreen-capture' } },
      { tab: { id: 42 } }
    );

    expect(result).toEqual({
      success: false,
      error: 'Screen capture is not supported in this browser or context.',
      errorType: 'SCREEN_CAPTURE_NOT_SUPPORTED'
    });
    expect(mocks.recognize).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(mocks.acquireLease).toHaveBeenCalledWith({
      owner: 'screen-capture',
      leaseId: 'partial-offscreen-capture',
      requiredReasons: ['WORKERS']
    });
    expect(mocks.releaseLease).not.toHaveBeenCalled();
  });

  it('returns string-safe unsupported response when Chrome lease acquisition loses capability race', async () => {
    mocks.acquireLease.mockResolvedValue(false);

    const result = await handleCaptureScreenArea(
      { data: { captureId: 'race-capture' } },
      { tab: { id: 42 } }
    );

    expect(result).toEqual({
      success: false,
      error: 'Screen capture is not supported in this browser or context.',
      errorType: 'SCREEN_CAPTURE_NOT_SUPPORTED'
    });
    expect(mocks.acquireLease).toHaveBeenCalledWith({
      owner: 'screen-capture',
      leaseId: 'race-capture',
      requiredReasons: ['WORKERS']
    });
    expect(mocks.recognize).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(mocks.releaseLease).not.toHaveBeenCalled();
  });

  it('keeps unsupported capture failure string-safe through sendResponse', async () => {
    mocks.acquireLease.mockResolvedValue(false);
    const sendResponse = vi.fn();

    const result = await handleCaptureScreenArea(
      { data: { captureId: 'integration-capture' } },
      { tab: { id: 42 } },
      sendResponse
    );

    expect(sendResponse).toHaveBeenCalledWith(result);
    expect(result.error).toBe('Screen capture is not supported in this browser or context.');
    expect(typeof result.error).toBe('string');
    expect(result.error).not.toBe('[object Object]');
    expect(result.errorType).toBe('SCREEN_CAPTURE_NOT_SUPPORTED');
  });
});
