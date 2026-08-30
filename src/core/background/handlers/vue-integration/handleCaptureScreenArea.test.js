import { beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';
import { handleCaptureScreenArea } from './handleCaptureScreenArea.js';
import { settingsManager } from '@/shared/managers/SettingsManager.js';

const mocks = vi.hoisted(() => ({
  captureVisibleTab: vi.fn(),
  sendMessage: vi.fn(),
  sendTabMessage: vi.fn(),
  ensureOffscreenDocument: vi.fn(),
  errorHandler: vi.fn()
}));

vi.mock('@/shared/managers/SettingsManager.js', () => ({
  settingsManager: {
    getAsync: vi.fn()
  }
}));

vi.mock('@/features/tts/services/TTSStateManager.js', () => ({
  ttsStateManager: {
    ensureOffscreenDocument: mocks.ensureOffscreenDocument
  }
}));

vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: vi.fn(() => ({ handle: mocks.errorHandler }))
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
    browser.offscreen = {};

    mocks.captureVisibleTab.mockResolvedValue('image-data');
    mocks.ensureOffscreenDocument.mockResolvedValue(undefined);
    mocks.sendMessage.mockResolvedValue({ success: true, text: 'recognized text' });
    mocks.sendTabMessage.mockResolvedValue(undefined);
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
});
