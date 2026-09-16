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
  handleLiveDubbingStart,
  handleLiveDubbingStop,
} from './handlers.js';
import browser from 'webextension-polyfill';
import { liveDubbingCoordinator } from './LiveDubbingCoordinator.js';
import {
  FIREFOX_CONTENT_BACKGROUND_ACTIONS,
  FIREFOX_CONTENT_BACKGROUND_TARGET,
} from '../firefox/firefoxContentRuntimeMessenger.js';

describe('live dubbing browser gate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('routes Firefox public controls through the trusted UI gate', () => {
    vi.stubGlobal('__BROWSER__', 'firefox');

    expect(handleLiveDubbingStart()).toEqual({
      success: false,
      error: 'LIVE_DUBBING_UNAUTHORIZED',
    });
    expect(handleLiveDubbingStop()).toEqual({
      success: false,
      error: 'LIVE_DUBBING_UNAUTHORIZED',
    });
    expect(handleLiveDubbingGetStatus()).toEqual({
      success: false,
      error: 'LIVE_DUBBING_UNAUTHORIZED',
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

  it('routes trusted Firefox UI controls to the Coordinator', async () => {
    vi.stubGlobal('__BROWSER__', 'firefox');
    browser.runtime.id = 'extension-id';
    browser.runtime.getURL = (path = '') => `moz-extension://extension-id/${path}`;
    const start = vi.spyOn(liveDubbingCoordinator, 'start').mockResolvedValue({ success: true });
    const stop = vi.spyOn(liveDubbingCoordinator, 'stop').mockResolvedValue({ success: true });
    const status = vi.spyOn(liveDubbingCoordinator, 'getStatus').mockResolvedValue({ success: true });
    const sender = {
      id: 'extension-id',
      url: 'moz-extension://extension-id/src/html/popup.html',
    };

    await handleLiveDubbingStart({ data: { targetLanguage: 'en' } }, sender);
    await handleLiveDubbingStop({ data: { sessionId: 'session-1' } }, sender);
    await handleLiveDubbingGetStatus({}, sender);

    expect(start).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
    expect(status).toHaveBeenCalledOnce();
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

  it('routes an exact Firefox content bootstrap to Gemini and returns only the ephemeral token', async () => {
    vi.stubGlobal('__BROWSER__', 'firefox');
    browser.runtime.id = 'extension-id';
    const descriptor = {
      sessionId: 'session-1',
      providerId: 'gemini',
      tabId: 7,
      frameId: 0,
      documentId: 'doc-1',
      targetLanguage: 'en',
      runtimeHost: 'firefox-content',
      status: 'CONNECTING_PROVIDER',
      eventSequence: 3,
    };
    const sender = {
      id: 'extension-id',
      tab: { id: 7 },
      frameId: 0,
      documentId: 'doc-1',
    };
    const authorize = vi.spyOn(liveDubbingCoordinator, 'authorizeFirefoxContentBootstrapRequest')
      .mockReturnValue(descriptor);
    const stillAuthorized = vi.spyOn(liveDubbingCoordinator, 'isBootstrapRequestStillAuthorized')
      .mockReturnValue(true);
    geminiLiveBootstrapService.mintEphemeralToken.mockReset();
    geminiLiveBootstrapService.mintEphemeralToken.mockResolvedValue('auth_tokens/firefox-token');
    openAIRealtimeBootstrapService.mintClientSecret.mockClear();

    const response = await handleLiveDubbingBootstrapRequest({
      target: FIREFOX_CONTENT_BACKGROUND_TARGET,
      action: FIREFOX_CONTENT_BACKGROUND_ACTIONS.REQUEST_BOOTSTRAP,
      data: {
        sessionId: 'session-1',
        providerId: 'gemini',
        tabId: 7,
        frameId: 0,
        documentId: 'doc-1',
        targetLanguage: 'en',
        eventSequence: 3,
      },
    }, sender);

    expect(response).toEqual({
      success: true,
      providerId: 'gemini',
      targetLanguage: 'en',
      bootstrap: { accessToken: 'auth_tokens/firefox-token' },
    });
    expect(Object.keys(response)).toEqual(['success', 'providerId', 'targetLanguage', 'bootstrap']);
    expect(JSON.stringify(response)).not.toContain('apiKey');
    expect(JSON.stringify(response)).not.toContain('secret');
    expect(authorize).toHaveBeenCalledWith(expect.objectContaining({
      action: FIREFOX_CONTENT_BACKGROUND_ACTIONS.REQUEST_BOOTSTRAP,
    }), sender);
    expect(stillAuthorized).toHaveBeenCalledWith(descriptor, sender);
    expect(geminiLiveBootstrapService.mintEphemeralToken).toHaveBeenCalledWith('en');
    expect(openAIRealtimeBootstrapService.mintClientSecret).not.toHaveBeenCalled();
  });

  it('reserves Firefox minting across concurrent requests and fails closed after a stop', async () => {
    vi.stubGlobal('__BROWSER__', 'firefox');
    browser.runtime.id = 'extension-id';
    const descriptor = {
      sessionId: 'session-1',
      providerId: 'gemini',
      tabId: 7,
      frameId: 0,
      documentId: 'doc-1',
      targetLanguage: 'en',
      runtimeHost: 'firefox-content',
      status: 'CONNECTING_PROVIDER',
      eventSequence: 3,
    };
    const request = {
      target: FIREFOX_CONTENT_BACKGROUND_TARGET,
      action: FIREFOX_CONTENT_BACKGROUND_ACTIONS.REQUEST_BOOTSTRAP,
      data: {
        sessionId: 'session-1',
        providerId: 'gemini',
        tabId: 7,
        frameId: 0,
        documentId: 'doc-1',
        targetLanguage: 'en',
        eventSequence: 3,
      },
    };
    const sender = { id: 'extension-id', tab: { id: 7 }, frameId: 0, documentId: 'doc-1' };
    const authorize = vi.spyOn(liveDubbingCoordinator, 'authorizeFirefoxContentBootstrapRequest')
      .mockReturnValueOnce(descriptor)
      .mockReturnValueOnce(null);
    vi.spyOn(liveDubbingCoordinator, 'isBootstrapRequestStillAuthorized').mockReturnValue(false);
    let resolveMint;
    geminiLiveBootstrapService.mintEphemeralToken.mockReset();
    geminiLiveBootstrapService.mintEphemeralToken.mockReturnValue(new Promise(resolve => {
      resolveMint = resolve;
    }));

    const first = handleLiveDubbingBootstrapRequest(request, sender);
    const second = await handleLiveDubbingBootstrapRequest(request, sender);
    expect(second).toEqual({ success: false, error: 'LIVE_DUBBING_UNAUTHORIZED' });
    resolveMint('firefox-token-after-stop');
    await expect(first).resolves.toEqual({
      success: false,
      error: 'LIVE_DUBBING_UNAUTHORIZED',
    });
    expect(authorize).toHaveBeenCalledTimes(2);
    expect(geminiLiveBootstrapService.mintEphemeralToken).toHaveBeenCalledOnce();
  });

  it('does not retry a reserved Firefox bootstrap after mint failure', async () => {
    vi.stubGlobal('__BROWSER__', 'firefox');
    browser.runtime.id = 'extension-id';
    const descriptor = {
      sessionId: 'session-1',
      providerId: 'gemini',
      tabId: 7,
      frameId: 0,
      documentId: 'doc-1',
      targetLanguage: 'en',
      runtimeHost: 'firefox-content',
      status: 'CONNECTING_PROVIDER',
      eventSequence: 3,
    };
    const request = {
      target: FIREFOX_CONTENT_BACKGROUND_TARGET,
      action: FIREFOX_CONTENT_BACKGROUND_ACTIONS.REQUEST_BOOTSTRAP,
      data: {
        sessionId: 'session-1',
        providerId: 'gemini',
        tabId: 7,
        frameId: 0,
        documentId: 'doc-1',
        targetLanguage: 'en',
        eventSequence: 3,
      },
    };
    const sender = { id: 'extension-id', tab: { id: 7 }, frameId: 0, documentId: 'doc-1' };
    const authorize = vi.spyOn(liveDubbingCoordinator, 'authorizeFirefoxContentBootstrapRequest')
      .mockReturnValueOnce(descriptor)
      .mockReturnValueOnce(null);
    geminiLiveBootstrapService.mintEphemeralToken.mockReset();
    geminiLiveBootstrapService.mintEphemeralToken.mockResolvedValue(null);

    await expect(handleLiveDubbingBootstrapRequest(request, sender)).resolves.toEqual({
      success: false,
      error: 'LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE',
    });
    await expect(handleLiveDubbingBootstrapRequest(request, sender)).resolves.toEqual({
      success: false,
      error: 'LIVE_DUBBING_UNAUTHORIZED',
    });
    expect(authorize).toHaveBeenCalledTimes(2);
    expect(geminiLiveBootstrapService.mintEphemeralToken).toHaveBeenCalledOnce();
  });

  it('routes an authorized Firefox terminal into host-aware cleanup', async () => {
    vi.stubGlobal('__BROWSER__', 'firefox');
    browser.runtime.id = 'extension-id';
    const terminal = vi.spyOn(liveDubbingCoordinator, 'handleFirefoxContentTerminal')
      .mockResolvedValue({ success: true, terminalAuthorized: true, stopped: true });
    const offscreenTerminal = vi.spyOn(liveDubbingCoordinator, 'handleOffscreenTerminal');

    await expect(handleLiveDubbingStop({
      target: FIREFOX_CONTENT_BACKGROUND_TARGET,
      action: FIREFOX_CONTENT_BACKGROUND_ACTIONS.TERMINAL,
      data: {
        sessionId: 'session-1',
        providerId: 'gemini',
        tabId: 7,
        frameId: 0,
        documentId: 'doc-1',
        eventSequence: 3,
        event: 'PROVIDER_ERROR',
        status: 'RUNNING',
        error: 'LIVE_DUBBING_PROVIDER_ERROR',
      },
    }, {
      id: 'extension-id',
      tab: { id: 7 },
      frameId: 0,
      documentId: 'doc-1',
    })).resolves.toEqual({ success: true, terminalAuthorized: true, stopped: true });
    expect(terminal).toHaveBeenCalledOnce();
    expect(offscreenTerminal).not.toHaveBeenCalled();
  });
});
