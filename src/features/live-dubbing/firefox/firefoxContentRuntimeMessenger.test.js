import { describe, expect, it, vi } from 'vitest';
import { LIVE_DUBBING_ACTIONS } from '../constants.js';
import {
  createFirefoxContentRuntimeMessenger,
  FIREFOX_CONTENT_BACKGROUND_ACTIONS,
  FIREFOX_CONTENT_BACKGROUND_TARGET,
  parseFirefoxContentBackgroundMessage,
} from './firefoxContentRuntimeMessenger.js';

const descriptor = {
  sessionId: 'session-1',
  providerId: 'gemini',
  tabId: 7,
  frameId: 0,
  documentId: 'doc-1',
  targetLanguage: 'en',
  eventSequence: 0,
};

function bootstrapRequest(eventSequence = 2) {
  return {
    action: LIVE_DUBBING_ACTIONS.REQUEST_PROVIDER_BOOTSTRAP,
    data: {
      sessionId: descriptor.sessionId,
      providerId: descriptor.providerId,
      targetLanguage: descriptor.targetLanguage,
      eventSequence,
    },
  };
}

describe('Firefox content runtime messenger', () => {
  it('sends exact identity and accepts only an ephemeral Gemini access token', async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      success: true,
      providerId: 'gemini',
      targetLanguage: 'en',
      bootstrap: { accessToken: 'ephemeral-token' },
    });
    const messenger = createFirefoxContentRuntimeMessenger({
      browserAPI: { runtime: { sendMessage } },
    });

    await expect(messenger.requestBootstrap(bootstrapRequest(), descriptor)).resolves.toEqual({
      success: true,
      providerId: 'gemini',
      targetLanguage: 'en',
      bootstrap: { accessToken: 'ephemeral-token' },
    });
    expect(sendMessage).toHaveBeenCalledWith({
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
    });

    sendMessage.mockResolvedValueOnce({
      success: true,
      providerId: 'gemini',
      targetLanguage: 'en',
      bootstrap: { accessToken: 'token', extra: 'rejected' },
    });
    await expect(messenger.requestBootstrap(bootstrapRequest(), descriptor))
      .resolves.toMatchObject({ success: false, error: 'LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE' });
  });

  it('rejects provider switches and malformed bootstrap identity without sending', async () => {
    const sendMessage = vi.fn();
    const messenger = createFirefoxContentRuntimeMessenger({
      browserAPI: { runtime: { sendMessage } },
    });

    await expect(messenger.requestBootstrap(
      { ...bootstrapRequest(), data: { ...bootstrapRequest().data, providerId: 'openai' } },
      { ...descriptor, providerId: 'openai' },
    )).resolves.toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE',
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('fails malformed bootstrap and non-terminal notifications closed', async () => {
    const sendMessage = vi.fn();
    const messenger = createFirefoxContentRuntimeMessenger({
      browserAPI: { runtime: { sendMessage } },
    });

    await expect(messenger.requestBootstrap(
      bootstrapRequest(),
      { ...descriptor, targetLanguage: 'unsupported' },
    )).resolves.toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE',
    });
    await expect(messenger.notifyTerminal({ action: 'NOT_TERMINAL', data: {} }, descriptor))
      .resolves.toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('uses a separate scalar terminal contract and drops diagnostics', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ success: true });
    const messenger = createFirefoxContentRuntimeMessenger({
      browserAPI: { runtime: { sendMessage } },
    });

    await expect(messenger.notifyTerminal({
      action: LIVE_DUBBING_ACTIONS.TERMINAL,
      data: {
        eventSequence: 3,
        event: 'PROVIDER_ERROR',
        status: 'RUNNING',
        error: 'LIVE_DUBBING_PROVIDER_ERROR',
        providerDiagnostic: { token: 'secret' },
        cleanupDiagnostic: { pcm: 'audio' },
      },
    }, descriptor)).resolves.toBe(true);
    expect(sendMessage).toHaveBeenCalledWith({
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
    });
    expect(JSON.stringify(sendMessage.mock.calls[0][0])).not.toContain('secret');
    expect(JSON.stringify(sendMessage.mock.calls[0][0])).not.toContain('pcm');
  });

  it('parses only closed Firefox Background bootstrap and terminal route data', () => {
    const bootstrap = {
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
    expect(parseFirefoxContentBackgroundMessage(bootstrap)).toEqual(bootstrap);
    expect(parseFirefoxContentBackgroundMessage({
      ...bootstrap,
      data: { ...bootstrap.data, apiKey: 'long-lived-key' },
    })).toBeNull();
    expect(parseFirefoxContentBackgroundMessage({
      ...bootstrap,
      data: { ...bootstrap.data, eventSequence: 2 },
    })).toBeNull();

    const { targetLanguage, ...terminalIdentity } = bootstrap.data;
    void targetLanguage;
    const terminal = {
      target: FIREFOX_CONTENT_BACKGROUND_TARGET,
      action: FIREFOX_CONTENT_BACKGROUND_ACTIONS.TERMINAL,
      data: {
        ...terminalIdentity,
        event: 'PROVIDER_ERROR',
        error: 'LIVE_DUBBING_PROVIDER_ERROR',
      },
    };
    expect(parseFirefoxContentBackgroundMessage(terminal)).toEqual(terminal);
    expect(parseFirefoxContentBackgroundMessage({
      ...terminal,
      data: { ...terminal.data, error: { token: 'secret' } },
    })).toBeNull();
  });
});
