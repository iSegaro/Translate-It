import { describe, expect, it, vi } from 'vitest';
import {
  createFirefoxContentRuntimeReadyMessage,
  FIREFOX_CONTENT_RUNTIME_ACTIONS,
  FIREFOX_CONTENT_RUNTIME_TARGET,
} from './firefoxContentRuntimeContract.js';
import {
  FirefoxContentRuntimeRegistration,
} from './firefoxContentRuntimeRegistration.js';

function createRuntime() {
  const listeners = new Set();
  return {
    id: 'extension-id',
    onMessage: {
      addListener: vi.fn(listener => listeners.add(listener)),
      removeListener: vi.fn(listener => listeners.delete(listener)),
      listeners,
    },
  };
}

function createSender(overrides = {}) {
  return {
    id: 'extension-id',
    tab: { id: 7 },
    frameId: 0,
    documentId: 'doc-1',
    ...overrides,
  };
}

function browserWithRuntime(runtime, sendMessage = vi.fn(() => Promise.resolve())) {
  return {
    runtime,
    tabs: { sendMessage },
  };
}

async function emit(runtime, message, sender) {
  const [listener] = [...runtime.onMessage.listeners];
  expect(listener).toBeTypeOf('function');
  return listener(message, sender);
}

describe('Firefox content runtime registry identity', () => {
  it('derives identity from native sender fields and rejects spoofed senders', async () => {
    const runtime = createRuntime();
    const registration = new FirefoxContentRuntimeRegistration({
      browserAPI: browserWithRuntime(runtime),
    }).install();

    await emit(runtime, createFirefoxContentRuntimeReadyMessage(), createSender({
      id: 'other-extension',
    }));
    await emit(runtime, createFirefoxContentRuntimeReadyMessage(), createSender({
      frameId: 1,
    }));
    await emit(runtime, createFirefoxContentRuntimeReadyMessage(), createSender({
      documentId: undefined,
    }));

    expect(registration.get(7, 0)).toBeNull();
  });

  it('replaces a stale document for a frame without storing payload identity or descriptor data', async () => {
    const runtime = createRuntime();
    const registration = new FirefoxContentRuntimeRegistration({
      browserAPI: browserWithRuntime(runtime),
    }).install();

    await emit(runtime, {
      ...createFirefoxContentRuntimeReadyMessage(),
      data: { tabId: 999, frameId: 4, documentId: 'spoofed' },
    }, createSender());
    expect(registration.get(7, 0)).toBeNull();

    await emit(runtime, createFirefoxContentRuntimeReadyMessage(), createSender());
    await emit(runtime, createFirefoxContentRuntimeReadyMessage(), createSender({
      documentId: 'doc-2',
      url: 'https://page.example/secret',
    }));

    expect(registration.get(7, 0)).toEqual({ tabId: 7, frameId: 0, documentId: 'doc-2' });
    expect(registration.registry.size).toBe(1);
    expect(registration.registry.get(7, 0)).not.toHaveProperty('url');

    // A descriptor remains caller-owned; registry replacement never rebinds it.
    const activeDescriptor = { tabId: 7, frameId: 0, documentId: 'doc-1', sessionId: 'session-1' };
    expect(activeDescriptor.documentId).toBe('doc-1');
  });
});

describe('Firefox content runtime discovery', () => {
  it('accepts only an active matching nonce and native target identity', async () => {
    const runtime = createRuntime();
    let sentMessage;
    const sendMessage = vi.fn((tabId, message, options) => {
      sentMessage = { tabId, message, options };
      return Promise.resolve();
    });
    const registration = new FirefoxContentRuntimeRegistration({
      browserAPI: browserWithRuntime(runtime, sendMessage),
      nonceFactory: () => 'nonce-1',
      discoveryTimeoutMs: 100,
    }).install();

    const discovered = registration.discover(7, 0);
    await vi.waitFor(() => expect(sentMessage?.message?.action)
      .toBe(FIREFOX_CONTENT_RUNTIME_ACTIONS.DISCOVER));

    await emit(runtime, createFirefoxContentRuntimeReadyMessage('stale-nonce'), createSender());
    expect(registration.get(7, 0)).toBeNull();
    await emit(runtime, createFirefoxContentRuntimeReadyMessage('nonce-1'), createSender({
      id: 'other-extension',
    }));
    expect(registration.get(7, 0)).toBeNull();
    await emit(runtime, createFirefoxContentRuntimeReadyMessage('nonce-1'), createSender({
      frameId: 1,
    }));
    expect(registration.get(7, 0)).toBeNull();

    await emit(runtime, createFirefoxContentRuntimeReadyMessage('nonce-1'), createSender({
      documentId: 'doc-discovered',
    }));
    await expect(discovered).resolves.toEqual({
      tabId: 7,
      frameId: 0,
      documentId: 'doc-discovered',
    });
    expect(sentMessage).toMatchObject({ tabId: 7, options: { frameId: 0 } });
    expect(sentMessage.message).toEqual({
      target: FIREFOX_CONTENT_RUNTIME_TARGET,
      action: FIREFOX_CONTENT_RUNTIME_ACTIONS.DISCOVER,
      data: { nonce: 'nonce-1' },
    });
  });

  it('rejects out-of-order challenges and stale ready messages', async () => {
    const runtime = createRuntime();
    const nonces = ['nonce-1', 'nonce-2'];
    const sendMessage = vi.fn(() => Promise.resolve());
    const registration = new FirefoxContentRuntimeRegistration({
      browserAPI: browserWithRuntime(runtime, sendMessage),
      nonceFactory: () => nonces.shift(),
      discoveryTimeoutMs: 100,
    }).install();

    const first = registration.discover(7, 0);
    const second = registration.discover(7, 0);
    await expect(first).resolves.toBeNull();

    await emit(runtime, createFirefoxContentRuntimeReadyMessage('nonce-1'), createSender());
    expect(registration.get(7, 0)).toBeNull();
    await emit(runtime, createFirefoxContentRuntimeReadyMessage('nonce-2'), createSender({
      documentId: 'doc-current',
    }));

    await expect(second).resolves.toEqual({ tabId: 7, frameId: 0, documentId: 'doc-current' });
  });

  it('bounds discovery timeout and leaves an empty registry for worker recovery', async () => {
    const runtime = createRuntime();
    const registration = new FirefoxContentRuntimeRegistration({
      browserAPI: browserWithRuntime(runtime, vi.fn(() => Promise.resolve())),
      nonceFactory: () => 'nonce-timeout',
      discoveryTimeoutMs: 1,
    }).install();

    await expect(registration.discover(7, 0)).resolves.toBeNull();
    expect(registration.get(7, 0)).toBeNull();

    // A restarted worker starts empty and can recover via a fresh challenge.
    const restartedRuntime = createRuntime();
    let restartedMessage;
    const restartedRegistration = new FirefoxContentRuntimeRegistration({
      browserAPI: browserWithRuntime(restartedRuntime, vi.fn((tabId, message) => {
        restartedMessage = { tabId, message };
        return Promise.resolve();
      })),
      nonceFactory: () => 'nonce-recovery',
      discoveryTimeoutMs: 100,
    }).install();

    const recovered = restartedRegistration.discover(7, 0);
    await vi.waitFor(() => expect(restartedMessage?.message?.data?.nonce).toBe('nonce-recovery'));
    await emit(
      restartedRuntime,
      createFirefoxContentRuntimeReadyMessage('nonce-recovery'),
      createSender({ documentId: 'doc-recovered' }),
    );
    await expect(recovered).resolves.toEqual({
      tabId: 7,
      frameId: 0,
      documentId: 'doc-recovered',
    });
  });
});
