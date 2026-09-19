import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('./GeminiLiveBootstrapService.js', () => ({
  geminiLiveBootstrapService: { mintEphemeralToken: vi.fn() },
}));
vi.mock('./OpenAIRealtimeBootstrapService.js', () => ({
  openAIRealtimeBootstrapService: { mintClientSecret: vi.fn() },
}));
import { geminiLiveBootstrapService } from './GeminiLiveBootstrapService.js';
import { openAIRealtimeBootstrapService } from './OpenAIRealtimeBootstrapService.js';
import {
  handleLiveDubbingGetStatus,
  handleLiveDubbingBootstrapRequest,
  handleLiveDubbingSetOriginalVolume,
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
    expect(handleLiveDubbingSetOriginalVolume()).toEqual({
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

    // Trusted extension pages opened in a normal browser tab carry
    // sender.tab; the exact UI document path still authorizes.
    const tabBoundOptionsSender = {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/options.html',
      tab: { id: 42 },
    };
    await handleLiveDubbingStart({ data: { targetLanguage: 'en' } }, tabBoundOptionsSender);
    await handleLiveDubbingStop({ data: { sessionId: 'session-1' } }, tabBoundOptionsSender);
    await handleLiveDubbingGetStatus({}, tabBoundOptionsSender);
    expect(start).toHaveBeenCalledTimes(2);
    expect(stop).toHaveBeenCalledTimes(2);
    expect(status).toHaveBeenCalledTimes(2);

    // Extension origin alone never authorizes arbitrary pages, even tab-bound.
    expect(handleLiveDubbingStart({ data: { targetLanguage: 'en' } }, {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/other.html',
      tab: { id: 42 },
    })).toEqual({ success: false, error: 'LIVE_DUBBING_UNAUTHORIZED' });
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('routes original-volume control only from trusted Popup and Sidepanel UI', async () => {
    vi.stubGlobal('__BROWSER__', 'chrome');
    browser.runtime.id = 'extension-id';
    browser.runtime.getURL = (path = '') => `chrome-extension://extension-id/${path}`;
    const setOriginalVolume = vi.spyOn(liveDubbingCoordinator, 'setOriginalVolume')
      .mockResolvedValue({ success: true });
    const message = {
      action: 'SET_LIVE_DUBBING_ORIGINAL_VOLUME',
      data: { sessionId: 'session-1', providerId: 'gemini', eventSequence: 2, volume: 0.5 },
    };

    await expect(handleLiveDubbingSetOriginalVolume(message, {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/popup.html',
    })).resolves.toEqual({ success: true });
    await expect(handleLiveDubbingSetOriginalVolume(message, {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/sidepanel.html',
    })).resolves.toEqual({ success: true });
    expect(setOriginalVolume).toHaveBeenCalledTimes(2);

    expect(handleLiveDubbingSetOriginalVolume(message, {
      id: 'extension-id',
      url: 'https://example.test/page',
      tab: { id: 42 },
    })).toEqual({ success: false, error: 'LIVE_DUBBING_UNAUTHORIZED' });
    await expect(handleLiveDubbingSetOriginalVolume(message, {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/popup.html',
      tab: { id: 42 },
    })).resolves.toEqual({ success: true });

    const internalMessage = {
      ...message,
      action: 'LIVE_DUBBING_SET_ORIGINAL_VOLUME',
    };
    expect(handleLiveDubbingSetOriginalVolume(internalMessage, {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/popup.html',
    })).toEqual({ success: false, error: 'LIVE_DUBBING_UNAUTHORIZED' });
    expect(setOriginalVolume).toHaveBeenCalledTimes(3);
  });

  it('rejects bootstrap requests from page/content senders without resolving a key', async () => {
    vi.stubGlobal('__BROWSER__', 'chrome');
    browser.runtime.id = 'extension-id';
    browser.runtime.getURL = (path = '') => `chrome-extension://extension-id/${path}`;

    await expect(handleLiveDubbingBootstrapRequest({
      data: { sessionId: 'session-1', providerId: 'gemini', targetLanguage: 'en', eventSequence: 1 },
    }, {
      id: 'extension-id',
      url: 'https://example.test/page',
      tab: { id: 42 },
    })).resolves.toEqual({
      success: false,
      error: 'LIVE_DUBBING_UNAUTHORIZED',
    });
  });

  it('rejects bootstrap requests when the Offscreen sender URL is missing', async () => {
    vi.stubGlobal('__BROWSER__', 'chrome');
    browser.runtime.id = 'extension-id';
    browser.runtime.getURL = (path = '') => `chrome-extension://extension-id/${path}`;
    const readDescriptor = vi.spyOn(liveDubbingCoordinator, '_readDescriptor');

    await expect(handleLiveDubbingBootstrapRequest({
      data: { sessionId: 'session-1', providerId: 'gemini', targetLanguage: 'en', eventSequence: 1 },
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

  it('resolves an authorized bootstrap request with an ephemeral access token', async () => {
    vi.stubGlobal('__BROWSER__', 'chrome');
    browser.runtime.id = 'extension-id';
    browser.runtime.getURL = (path = '') => `chrome-extension://extension-id/${path}`;
    const authorize = vi.spyOn(liveDubbingCoordinator, 'authorizeOffscreenControlMessage')
      .mockResolvedValue({ sessionId: 'session-1', providerId: 'gemini', targetLanguage: 'zh-Hans' });
    const stillAuthorized = vi.spyOn(liveDubbingCoordinator, 'isBootstrapRequestStillAuthorized')
      .mockReturnValue(true);
    geminiLiveBootstrapService.mintEphemeralToken.mockResolvedValue('auth_tokens/ephemeral-token-1');

    const response = await handleLiveDubbingBootstrapRequest({
      data: { sessionId: 'session-1', providerId: 'gemini', targetLanguage: 'zh-Hans', eventSequence: 1 },
    }, {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    });

    expect(response).toEqual({
      success: true,
      providerId: 'gemini',
      targetLanguage: 'zh-Hans',
      bootstrap: { accessToken: 'auth_tokens/ephemeral-token-1' },
    });
    expect(geminiLiveBootstrapService.mintEphemeralToken).toHaveBeenCalledWith('zh-Hans');
    expect(authorize).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    }), { type: 'bootstrap' });
    expect(stillAuthorized).toHaveBeenCalledWith({
      sessionId: 'session-1',
      providerId: 'gemini',
      targetLanguage: 'zh-Hans',
    });
    expect(Object.keys(response.bootstrap)).toEqual(['accessToken']);
    expect(JSON.stringify(response)).not.toContain('apiKey');
  });

  it('routes an authorized OpenAI identity to the OpenAI bootstrap service', async () => {
    vi.stubGlobal('__BROWSER__', 'chrome');
    browser.runtime.id = 'extension-id';
    browser.runtime.getURL = (path = '') => `chrome-extension://extension-id/${path}`;
    geminiLiveBootstrapService.mintEphemeralToken.mockClear();
    openAIRealtimeBootstrapService.mintClientSecret.mockResolvedValue('ek_openai-secret');
    vi.spyOn(liveDubbingCoordinator, 'isBootstrapRequestStillAuthorized').mockReturnValue(true);
    vi.spyOn(liveDubbingCoordinator, 'authorizeOffscreenControlMessage')
      .mockResolvedValue({ sessionId: 'session-openai', providerId: 'openai', targetLanguage: 'en-US' });

    await expect(handleLiveDubbingBootstrapRequest({
      data: { sessionId: 'session-openai', providerId: 'openai', targetLanguage: 'en-US', eventSequence: 1 },
    }, {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    })).resolves.toEqual({
      success: true,
      providerId: 'openai',
      targetLanguage: 'en-US',
      bootstrap: { secret: 'ek_openai-secret' },
    });
    expect(geminiLiveBootstrapService.mintEphemeralToken).not.toHaveBeenCalled();
    expect(openAIRealtimeBootstrapService.mintClientSecret).toHaveBeenCalledWith('en-US');
  });

  it('does not return an OpenAI secret when the active session fence closes first', async () => {
    vi.stubGlobal('__BROWSER__', 'chrome');
    browser.runtime.id = 'extension-id';
    browser.runtime.getURL = (path = '') => `chrome-extension://extension-id/${path}`;
    vi.spyOn(liveDubbingCoordinator, 'authorizeOffscreenControlMessage')
      .mockResolvedValue({ sessionId: 'session-openai', providerId: 'openai', targetLanguage: 'en-US' });
    vi.spyOn(liveDubbingCoordinator, 'isBootstrapRequestStillAuthorized').mockReturnValue(false);
    openAIRealtimeBootstrapService.mintClientSecret.mockResolvedValue('ek_openai-secret');

    await expect(handleLiveDubbingBootstrapRequest({
      data: { sessionId: 'session-openai', providerId: 'openai', targetLanguage: 'en-US', eventSequence: 1 },
    }, {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    })).resolves.toEqual({
      success: false,
      error: 'LIVE_DUBBING_UNAUTHORIZED',
    });
  });

  it.each(['null', 'throw'])('returns the generic OpenAI bootstrap failure when minting %s', async outcome => {
    vi.stubGlobal('__BROWSER__', 'chrome');
    browser.runtime.id = 'extension-id';
    browser.runtime.getURL = (path = '') => `chrome-extension://extension-id/${path}`;
    vi.spyOn(liveDubbingCoordinator, 'authorizeOffscreenControlMessage')
      .mockResolvedValue({ sessionId: 'session-openai', providerId: 'openai', targetLanguage: 'en-US' });
    const stillAuthorized = vi.spyOn(liveDubbingCoordinator, 'isBootstrapRequestStillAuthorized')
      .mockReturnValue(true);
    if (outcome === 'null') {
      openAIRealtimeBootstrapService.mintClientSecret.mockResolvedValue(null);
    } else {
      openAIRealtimeBootstrapService.mintClientSecret.mockRejectedValue(
        new Error('openai-secret network failure'),
      );
    }

    const response = await handleLiveDubbingBootstrapRequest({
      data: { sessionId: 'session-openai', providerId: 'openai', targetLanguage: 'en-US', eventSequence: 2 },
    }, {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    });
    expect(response).toEqual({
      success: false,
      error: 'LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE',
    });
    expect(stillAuthorized).not.toHaveBeenCalled();
    expect(JSON.stringify(response)).not.toContain('openai-secret');
  });

  it('rejects a bootstrap response when the active session fence closes first', async () => {
    vi.stubGlobal('__BROWSER__', 'chrome');
    browser.runtime.id = 'extension-id';
    browser.runtime.getURL = (path = '') => `chrome-extension://extension-id/${path}`;
    vi.spyOn(liveDubbingCoordinator, 'authorizeOffscreenControlMessage')
      .mockResolvedValue({ sessionId: 'session-1', providerId: 'gemini', targetLanguage: 'en' });
    const stillAuthorized = vi.spyOn(liveDubbingCoordinator, 'isBootstrapRequestStillAuthorized')
      .mockReturnValue(false);
    geminiLiveBootstrapService.mintEphemeralToken.mockResolvedValue('auth_tokens/ephemeral-token-1');

    const response = await handleLiveDubbingBootstrapRequest({
      data: { sessionId: 'session-1', providerId: 'gemini', targetLanguage: 'en', eventSequence: 2 },
    }, {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    });

    expect(response).toEqual({
      success: false,
      error: 'LIVE_DUBBING_UNAUTHORIZED',
    });
    expect(stillAuthorized).toHaveBeenCalledOnce();
    expect(JSON.stringify(response)).not.toContain('auth_tokens/ephemeral-token-1');
  });

  it('returns UNAVAILABLE when ephemeral minting fails for every key', async () => {
    vi.stubGlobal('__BROWSER__', 'chrome');
    browser.runtime.id = 'extension-id';
    browser.runtime.getURL = (path = '') => `chrome-extension://extension-id/${path}`;
    vi.spyOn(liveDubbingCoordinator, 'authorizeOffscreenControlMessage')
      .mockResolvedValue({ sessionId: 'session-1', providerId: 'gemini', targetLanguage: 'en' });
    const stillAuthorized = vi.spyOn(liveDubbingCoordinator, 'isBootstrapRequestStillAuthorized')
      .mockReturnValue(true);
    geminiLiveBootstrapService.mintEphemeralToken.mockResolvedValue(null);

    await expect(handleLiveDubbingBootstrapRequest({
      data: { sessionId: 'session-1', providerId: 'gemini', targetLanguage: 'en', eventSequence: 2 },
    }, {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    })).resolves.toEqual({
      success: false,
      error: 'LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE',
    });
    expect(stillAuthorized).not.toHaveBeenCalled();
  });

  it('returns UNAVAILABLE when ephemeral minting throws', async () => {
    vi.stubGlobal('__BROWSER__', 'chrome');
    browser.runtime.id = 'extension-id';
    browser.runtime.getURL = (path = '') => `chrome-extension://extension-id/${path}`;
    vi.spyOn(liveDubbingCoordinator, 'authorizeOffscreenControlMessage')
      .mockResolvedValue({ sessionId: 'session-1', providerId: 'gemini', targetLanguage: 'en' });
    geminiLiveBootstrapService.mintEphemeralToken.mockRejectedValue(new Error('mint failed'));

    await expect(handleLiveDubbingBootstrapRequest({
      data: { sessionId: 'session-1', providerId: 'gemini', targetLanguage: 'en', eventSequence: 2 },
    }, {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    })).resolves.toEqual({
      success: false,
      error: 'LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE',
    });
  });
});
