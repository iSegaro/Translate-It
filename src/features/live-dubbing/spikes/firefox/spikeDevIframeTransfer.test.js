import { describe, expect, it, vi } from 'vitest';
import {
  FIREFOX_SPIKE_IFRAME_ACTION,
  FirefoxExtensionIframeTransferProbe,
} from './spikeDevIframeTransfer.js';
import { installFirefoxSpikeIframeReceiver } from './spikeDevIframeDocument.js';

class FakeTrack {
  constructor() {
    this.kind = 'audio';
    this.readyState = 'live';
    this.muted = false;
    this.stop = vi.fn(() => { this.readyState = 'ended'; });
  }

  clone() {
    return new FakeTrack();
  }
}

class FakeStream {
  constructor(tracks) {
    this.tracks = tracks;
  }

  getTracks() {
    return this.tracks;
  }
}

function createParentWorld({ reply = true } = {}) {
  const listeners = new Set();
  const iframe = {
    contentWindow: { postMessage: vi.fn() },
    remove: vi.fn(),
    setAttribute: vi.fn(),
    parentNode: { removeChild: vi.fn() },
    hidden: false,
  };
  const documentRef = {
    body: {
      appendChild: vi.fn(node => {
        node.parentNode = documentRef.body;
        queueMicrotask(() => node.onload?.());
      }),
    },
    createElement: vi.fn(() => iframe),
  };
  const windowRef = {
    addEventListener: vi.fn((_type, listener) => listeners.add(listener)),
    removeEventListener: vi.fn((_type, listener) => listeners.delete(listener)),
  };
  const extensionOrigin = 'moz-extension://firefox-spike';
  iframe.contentWindow.postMessage.mockImplementation((message, targetOrigin, transfer) => {
    if (!reply) return;
    queueMicrotask(() => {
      for (const listener of listeners) listener({
        source: iframe.contentWindow,
        origin: extensionOrigin,
        data: {
          action: FIREFOX_SPIKE_IFRAME_ACTION,
          nonce: message.nonce,
          origin: extensionOrigin,
          supported: true,
          accepted: true,
          receiverType: 'MediaStream',
          receiverKind: 'audio',
          receiverReadyState: 'live',
          receiverMuted: false,
          receiverAnalyserActivity: 'active',
          receiverAnalyserPeak: 0.2,
          errorCategory: null,
        },
      });
    });
    expect(targetOrigin).toBe(extensionOrigin);
    expect(transfer).toHaveLength(1);
  });
  return { documentRef, windowRef, iframe, extensionOrigin };
}

describe('Firefox DEV extension iframe transfer probe', () => {
  it('transfers only a cloned audio track and returns nonce-bound scalar facts', async () => {
    const world = createParentWorld();
    const original = new FakeTrack();
    const runtime = { getURL: vi.fn(() => `${world.extensionOrigin}/spikeDevIframe.html`) };
    const probe = new FirefoxExtensionIframeTransferProbe({
      documentRef: world.documentRef,
      windowRef: world.windowRef,
      runtime,
      nonceFactory: () => 'nonce-1234567890123456',
    });

    const result = await probe.start({
      captureProbe: { audioTracks: [original] },
      transportStatus: { success: false },
    });

    expect(result).toMatchObject({
      state: 'COMPLETE',
      supported: true,
      accepted: true,
      receiverType: 'MediaStream',
      receiverKind: 'audio',
      receiverAnalyserActivity: 'active',
      receiverAnalyserPeak: 0.2,
      senderCloneOwnership: 'transferred',
      senderCloneEnded: true,
    });
    expect(original.stop).not.toHaveBeenCalled();
    expect(world.iframe.contentWindow.postMessage).toHaveBeenCalledOnce();
    const [message, targetOrigin, transfer] = world.iframe.contentWindow.postMessage.mock.calls[0];
    expect(message.track).not.toBe(original);
    expect(transfer).toEqual([message.track]);
    expect(targetOrigin).toBe(world.extensionOrigin);
    expect(world.iframe.remove).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain('track');
    expect(JSON.stringify(result)).not.toContain('samples');
  });

  it('reports the exact extension-resource blocker without page-iframe fallback', async () => {
    const world = createParentWorld();
    const track = new FakeTrack();
    const probe = new FirefoxExtensionIframeTransferProbe({
      documentRef: world.documentRef,
      windowRef: world.windowRef,
      runtime: {},
      nonceFactory: () => 'nonce-1234567890123456',
    });

    const result = await probe.start({
      captureProbe: { audioTracks: [track] },
      transportStatus: { success: false },
    });

    expect(result).toMatchObject({
      state: 'UNSUPPORTED',
      supported: false,
      accepted: null,
      errorCategory: 'EXTENSION_URL_UNAVAILABLE',
      senderCloneOwnership: 'sender-released',
      senderCloneEnded: true,
    });
    expect(world.documentRef.createElement).not.toHaveBeenCalled();
  });

  it('does not run when transport A is accepted', async () => {
    const world = createParentWorld();
    const probe = new FirefoxExtensionIframeTransferProbe({
      documentRef: world.documentRef,
      windowRef: world.windowRef,
      runtime: { getURL: vi.fn() },
      nonceFactory: () => 'nonce-1234567890123456',
    });

    const result = await probe.start({
      captureProbe: { audioTracks: [new FakeTrack()] },
      transportStatus: { success: true },
    });

    expect(result).toMatchObject({ state: 'IDLE', accepted: null, errorCategory: 'TRANSPORT_ACCEPTED' });
    expect(world.documentRef.createElement).not.toHaveBeenCalled();
  });

  it('accepts only the expected iframe source/origin/nonce and cleans on stop', async () => {
    const world = createParentWorld({ reply: false });
    const track = new FakeTrack();
    const probe = new FirefoxExtensionIframeTransferProbe({
      documentRef: world.documentRef,
      windowRef: world.windowRef,
      runtime: { getURL: () => `${world.extensionOrigin}/spikeDevIframe.html` },
      nonceFactory: () => 'nonce-1234567890123456',
      timeoutMs: 1000,
    });
    const pending = probe.start({ captureProbe: { audioTracks: [track] }, transportStatus: { success: false } });
    await new Promise(resolve => queueMicrotask(resolve));
    await probe.stop();
    await pending;

    expect(world.iframe.remove).toHaveBeenCalledOnce();
    expect(track.stop).not.toHaveBeenCalled();
    expect(probe.status().state).toBe('STOPPED');
  });
});

describe('Firefox DEV extension iframe receiver', () => {
  it('validates parent/origin/action and accepts one audio transfer only', () => {
    const listeners = new Set();
    const parent = { postMessage: vi.fn() };
    const receiverWindow = {
      parent,
      addEventListener: (_type, listener) => listeners.add(listener),
      removeEventListener: (_type, listener) => listeners.delete(listener),
      AudioContext: class {
        createMediaStreamSource() { return { connect: vi.fn(), disconnect: vi.fn() }; }
        createAnalyser() {
          return {
            fftSize: 2,
            getFloatTimeDomainData: values => { values[0] = 0.3; values[1] = 0; },
            disconnect: vi.fn(),
          };
        }
        close() {}
      },
    };
    const extensionOrigin = 'moz-extension://firefox-spike';
    installFirefoxSpikeIframeReceiver({
      windowRef: receiverWindow,
      extensionOrigin,
      expectedNonce: 'nonce-1234567890123456',
      MediaStream: FakeStream,
      MediaStreamTrack: FakeTrack,
    });
    const listener = [...listeners][0];
    const track = new FakeTrack();
    const valid = {
      source: receiverWindow.parent,
      origin: 'https://www.youtube.com',
      data: {
        action: FIREFOX_SPIKE_IFRAME_ACTION,
        nonce: 'nonce-1234567890123456',
        origin: extensionOrigin,
        track,
      },
    };

    listener({ ...valid, source: {} });
    listener({ ...valid, origin: 'https://example.com' });
    listener({ ...valid, data: { ...valid.data, nonce: 'wrong-nonce-1234567890' } });
    listener(valid);
    listener(valid);

    expect(parent.postMessage).toHaveBeenCalledOnce();
    if (parent.postMessage.mock.calls[0][0].accepted !== true) {
      throw new Error(JSON.stringify(parent.postMessage.mock.calls[0][0]));
    }
    expect(parent.postMessage.mock.calls[0][0]).toMatchObject({
      supported: true,
      accepted: true,
      receiverType: 'MediaStream',
      receiverKind: 'audio',
      receiverAnalyserActivity: 'active',
    });
    expect(parent.postMessage.mock.calls[0][0].receiverAnalyserPeak).toBeCloseTo(0.3);
    expect(parent.postMessage.mock.calls[0][1]).toBe('https://www.youtube.com');
    expect(track.stop).toHaveBeenCalledOnce();
    expect(JSON.stringify(parent.postMessage.mock.calls[0][0])).not.toContain('track');
  });

  it('rejects serialized track-shaped objects and never claims native transfer', () => {
    const listeners = new Set();
    const parent = { postMessage: vi.fn() };
    const receiverWindow = {
      parent,
      addEventListener: (_type, listener) => listeners.add(listener),
      removeEventListener: (_type, listener) => listeners.delete(listener),
    };
    installFirefoxSpikeIframeReceiver({
      windowRef: receiverWindow,
      extensionOrigin: 'moz-extension://firefox-spike',
      expectedNonce: 'nonce-1234567890123456',
      MediaStream: FakeStream,
      MediaStreamTrack: FakeTrack,
    });
    [...listeners][0]({
      source: parent,
      origin: 'https://www.youtube.com',
      data: {
        action: FIREFOX_SPIKE_IFRAME_ACTION,
        nonce: 'nonce-1234567890123456',
        origin: 'moz-extension://firefox-spike',
        track: { kind: 'audio', readyState: 'live', muted: false },
      },
    });

    expect(parent.postMessage).toHaveBeenCalledOnce();
    expect(parent.postMessage.mock.calls[0][0]).toMatchObject({
      supported: false,
      accepted: false,
      errorCategory: 'UNSUPPORTED_PAYLOAD',
    });
  });
});
