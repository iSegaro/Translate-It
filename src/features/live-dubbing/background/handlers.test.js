import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/features/translation/providers/ApiKeyManager.js', () => ({
  ApiKeyManager: { getPrimaryKey: vi.fn().mockResolvedValue('handler-secret') },
}));
import {
  handleLiveDubbingGetStatus,
  handleLiveDubbingCredentialRequest,
  handleLiveDubbingStart,
  handleLiveDubbingStop,
} from './handlers.js';
import browser from 'webextension-polyfill';
import { liveDubbingCoordinator } from './LiveDubbingCoordinator.js';

describe('live dubbing browser gate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns unsupported without routing Firefox background requests', () => {
    vi.stubGlobal('__BROWSER__', 'firefox');

    expect(handleLiveDubbingStart()).toEqual({
      success: false,
      error: 'LIVE_DUBBING_UNSUPPORTED',
    });
    expect(handleLiveDubbingStop()).toEqual({
      success: false,
      error: 'LIVE_DUBBING_UNSUPPORTED',
    });
    expect(handleLiveDubbingGetStatus()).toEqual({
      success: false,
      error: 'LIVE_DUBBING_UNSUPPORTED',
    });
  });

  it('accepts only trusted extension UI senders for public controls', async () => {
    vi.stubGlobal('__BROWSER__', 'chrome');
    browser.runtime.id = 'extension-id';
    browser.runtime.getURL = (path = '') => `chrome-extension://extension-id/${path}`;
    const start = vi.spyOn(liveDubbingCoordinator, 'start').mockResolvedValue({ success: true });
    const stop = vi.spyOn(liveDubbingCoordinator, 'stop').mockResolvedValue({ success: true });
    const status = vi.spyOn(liveDubbingCoordinator, 'getStatus').mockResolvedValue({ success: true });
    const pageSender = {
      id: 'extension-id',
      url: 'https://example.test/page',
      tab: { id: 42 },
    };

    expect(handleLiveDubbingStart({ data: { targetLanguage: 'en' } }, pageSender))
      .toEqual({ success: false, error: 'LIVE_DUBBING_UNAUTHORIZED' });
    expect(handleLiveDubbingStop({ data: { sessionId: 'session-1' } }, pageSender))
      .toEqual({ success: false, error: 'LIVE_DUBBING_UNAUTHORIZED' });
    expect(handleLiveDubbingGetStatus({}, pageSender))
      .toEqual({ success: false, error: 'LIVE_DUBBING_UNAUTHORIZED' });
    expect(start).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();

    const uiSender = {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/popup.html',
    };
    await handleLiveDubbingStart({ data: { targetLanguage: 'en' } }, uiSender);
    await handleLiveDubbingStop({ data: { sessionId: 'session-1' } }, uiSender);
    await handleLiveDubbingGetStatus({}, uiSender);
    expect(start).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
    expect(status).toHaveBeenCalledOnce();
  });

  it('rejects credential requests from page/content senders without resolving a key', async () => {
    vi.stubGlobal('__BROWSER__', 'chrome');
    browser.runtime.id = 'extension-id';
    browser.runtime.getURL = (path = '') => `chrome-extension://extension-id/${path}`;

    await expect(handleLiveDubbingCredentialRequest({
      data: { sessionId: 'session-1', targetLanguage: 'en', eventSequence: 1 },
    }, {
      id: 'extension-id',
      url: 'https://example.test/page',
      tab: { id: 42 },
    })).resolves.toEqual({
      success: false,
      error: 'LIVE_DUBBING_UNAUTHORIZED',
    });
  });

  it('rejects credential requests when the Offscreen sender URL is missing', async () => {
    vi.stubGlobal('__BROWSER__', 'chrome');
    browser.runtime.id = 'extension-id';
    browser.runtime.getURL = (path = '') => `chrome-extension://extension-id/${path}`;
    const readDescriptor = vi.spyOn(liveDubbingCoordinator, '_readDescriptor');

    await expect(handleLiveDubbingCredentialRequest({
      data: { sessionId: 'session-1', targetLanguage: 'en', eventSequence: 1 },
    }, {
      id: 'extension-id',
    })).resolves.toEqual({
      success: false,
      error: 'LIVE_DUBBING_UNAUTHORIZED',
    });
    expect(readDescriptor).not.toHaveBeenCalled();
  });

  it('rejects terminal notifications without an authenticated Offscreen sender', async () => {
    vi.stubGlobal('__BROWSER__', 'chrome');

    expect(handleLiveDubbingStop({
      action: 'LIVE_DUBBING_TERMINAL',
      data: { sessionId: 'session-1', eventSequence: 1 },
    })).toEqual({
      success: false,
      error: 'LIVE_DUBBING_UNAUTHORIZED',
    });
  });

  it('resolves an authorized credential request with only key and target language', async () => {
    vi.stubGlobal('__BROWSER__', 'chrome');
    browser.runtime.id = 'extension-id';
    browser.runtime.getURL = (path = '') => `chrome-extension://extension-id/${path}`;
    const authorize = vi.spyOn(liveDubbingCoordinator, 'authorizeOffscreenControlMessage')
      .mockResolvedValue({ sessionId: 'session-1', targetLanguage: 'zh-Hans' });
    const stillAuthorized = vi.spyOn(liveDubbingCoordinator, 'isCredentialRequestStillAuthorized')
      .mockReturnValue(true);

    await expect(handleLiveDubbingCredentialRequest({
      data: { sessionId: 'session-1', targetLanguage: 'zh-Hans', eventSequence: 1 },
    }, {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    })).resolves.toEqual({
      success: true,
      apiKey: 'handler-secret',
      targetLanguage: 'zh-Hans',
    });
    expect(authorize).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    }), { type: 'credential' });
    expect(stillAuthorized).toHaveBeenCalledWith({ sessionId: 'session-1', targetLanguage: 'zh-Hans' });
  });

  it('rejects a credential response when the active session fence closes first', async () => {
    vi.stubGlobal('__BROWSER__', 'chrome');
    browser.runtime.id = 'extension-id';
    browser.runtime.getURL = (path = '') => `chrome-extension://extension-id/${path}`;
    vi.spyOn(liveDubbingCoordinator, 'authorizeOffscreenControlMessage')
      .mockResolvedValue({ sessionId: 'session-1', targetLanguage: 'en' });
    const stillAuthorized = vi.spyOn(liveDubbingCoordinator, 'isCredentialRequestStillAuthorized')
      .mockReturnValue(false);

    await expect(handleLiveDubbingCredentialRequest({
      data: { sessionId: 'session-1', targetLanguage: 'en', eventSequence: 2 },
    }, {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    })).resolves.toEqual({
      success: false,
      error: 'LIVE_DUBBING_UNAUTHORIZED',
    });
    expect(stillAuthorized).toHaveBeenCalledOnce();
  });
});
