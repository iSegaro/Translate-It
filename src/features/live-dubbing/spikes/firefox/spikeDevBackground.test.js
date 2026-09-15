import { describe, expect, it, vi } from 'vitest';
import {
  FIREFOX_TRANSPORT_ERROR_CATEGORIES,
  FIREFOX_YOUTUBE_SPIKE_MESSAGE_ACTIONS,
  FIREFOX_YOUTUBE_SPIKE_MESSAGE_TARGET,
  FIREFOX_YOUTUBE_SPIKE_PORT_NAME,
} from './spikeDevTransport.js';
import {
  FirefoxSpikeBackgroundReceiver,
  inspectFirefoxTransferPayload,
  installFirefoxSpikeBackgroundReceiver,
} from './spikeDevBackground.js';

class FakeTrack {
  constructor() {
    this.kind = 'audio';
    this.readyState = 'live';
    this.muted = false;
  }
}

class FakeStream {
  constructor(track) {
    this.track = track;
  }

  getAudioTracks() {
    return [this.track];
  }
}

function validMessage(action, payload = new FakeTrack()) {
  return {
    target: FIREFOX_YOUTUBE_SPIKE_MESSAGE_TARGET,
    action,
    data: { source: 'original-audio-track', payload },
  };
}

function sender(id = 'extension-id', url = 'https://www.youtube.com/watch?v=1') {
  return { id, url };
}

function createPort() {
  const messageListeners = new Set();
  const disconnectListeners = new Set();
  return {
    name: FIREFOX_YOUTUBE_SPIKE_PORT_NAME,
    sender: sender(),
    onMessage: {
      addListener: listener => messageListeners.add(listener),
      removeListener: listener => messageListeners.delete(listener),
    },
    onDisconnect: {
      addListener: listener => disconnectListeners.add(listener),
      removeListener: listener => disconnectListeners.delete(listener),
    },
    postMessage: vi.fn(),
    disconnect: vi.fn(() => {
      for (const listener of disconnectListeners) listener();
    }),
    emitMessage(message) {
      return Promise.all([...messageListeners].map(listener => listener(message)));
    },
  };
}

describe('Firefox DEV spike background transport receiver', () => {
  it('accepts native received tracks and returns scalar ownership/audio facts only', () => {
    const track = new FakeTrack();
    const result = inspectFirefoxTransferPayload('original-audio-track', track, {
      transport: 'send-message',
      MediaStreamTrack: FakeTrack,
    });

    expect(result).toMatchObject({
      transport: 'send-message',
      source: 'original-audio-track',
      accepted: true,
      receivedType: 'MediaStreamTrack',
      kind: 'audio',
      readyState: 'live',
      muted: false,
      ended: false,
      ownership: 'received',
      analyserActivity: 'unsupported',
    });
    expect(JSON.stringify(result)).not.toContain('payload');
    expect(JSON.stringify(result)).not.toContain('track-object');
  });

  it('inspects stream analyser activity only as a scalar and never stops received tracks', () => {
    const track = new FakeTrack();
    const stream = new FakeStream(track);
    const analyser = {
      fftSize: 2,
      getFloatTimeDomainData: values => { values[0] = 0.25; values[1] = 0; },
      disconnect: vi.fn(),
    };
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    const context = {
      createMediaStreamSource: vi.fn(() => source),
      createAnalyser: vi.fn(() => analyser),
      close: vi.fn(),
    };

    const result = inspectFirefoxTransferPayload('captured-stream', stream, {
      transport: 'port',
      MediaStream: FakeStream,
      MediaStreamTrack: FakeTrack,
      audioContextFactory: () => context,
    });

    expect(result).toMatchObject({
      accepted: true,
      receivedType: 'MediaStream',
      kind: 'audio',
      analyserActivity: 'active',
      analyserPeak: 0.25,
      ownership: 'received',
    });
    expect(track).not.toHaveProperty('stop');
    expect(context.close).toHaveBeenCalledOnce();
  });

  it('rejects plain serialized object mocks instead of claiming transfer success', () => {
    const result = inspectFirefoxTransferPayload('original-audio-track', {
      kind: 'audio',
      readyState: 'live',
      muted: false,
    }, { MediaStreamTrack: FakeTrack });

    expect(result.accepted).toBe(false);
    expect(result.errorCategory).toBe(FIREFOX_TRANSPORT_ERROR_CATEGORIES.UNSUPPORTED_PAYLOAD);
    expect(result.receivedType).toBe('Object');
  });

  it('authenticates extension YouTube senders and isolates unrelated messages', async () => {
    const inspectPayload = vi.fn(() => ({
      transport: 'send-message',
      source: 'original-audio-track',
      accepted: false,
      outcome: 'rejected',
      errorCategory: null,
    }));
    const receiver = new FirefoxSpikeBackgroundReceiver({
      browserAPI: { runtime: { id: 'extension-id' } },
      inspectPayload,
    });
    const message = validMessage(FIREFOX_YOUTUBE_SPIKE_MESSAGE_ACTIONS.SEND_MESSAGE);

    await expect(receiver.handleMessage(message, sender('other-extension')))
      .resolves.toMatchObject({ accepted: false, errorCategory: 'UNAUTHORIZED' });
    await expect(receiver.handleMessage(message, sender('extension-id', 'https://example.com')))
      .resolves.toMatchObject({ accepted: false, errorCategory: 'UNAUTHORIZED' });
    await expect(receiver.handleMessage({ target: 'other-target', action: message.action }, sender()))
      .resolves.toBe(null);
    await expect(receiver.handleMessage(message, sender())).resolves.toMatchObject({
      source: 'original-audio-track',
      transport: 'send-message',
    });
    expect(inspectPayload).toHaveBeenCalledOnce();
  });

  it('posts one scalar Port reply and cleans the Port listener/connection', async () => {
    const port = createPort();
    const receiver = new FirefoxSpikeBackgroundReceiver({
      browserAPI: { runtime: { id: 'extension-id' } },
      inspectPayload: vi.fn((source, _payload, options) => ({
        transport: options.transport,
        source,
        accepted: false,
        outcome: 'rejected',
        errorCategory: 'UNSUPPORTED_PAYLOAD',
      })),
    });
    expect(receiver.handlePort(port)).toBe(true);

    await port.emitMessage(validMessage(FIREFOX_YOUTUBE_SPIKE_MESSAGE_ACTIONS.PORT_TRANSFER));

    expect(port.postMessage).toHaveBeenCalledOnce();
    expect(port.postMessage.mock.calls[0][0]).toMatchObject({
      transport: 'port',
      source: 'original-audio-track',
      accepted: false,
    });
    expect(port.disconnect).toHaveBeenCalledOnce();
    expect(receiver.ports.size).toBe(0);
  });

  it('installs only in DEV with both runtime listeners available', () => {
    const runtime = {
      id: 'extension-id',
      onMessage: { addListener: vi.fn() },
      onConnect: { addListener: vi.fn() },
    };
    const browserAPI = { runtime };

    expect(installFirefoxSpikeBackgroundReceiver({ browserAPI, isDevelopment: false })).toBeUndefined();
    expect(runtime.onMessage.addListener).not.toHaveBeenCalled();

    const receiver = installFirefoxSpikeBackgroundReceiver({ browserAPI, isDevelopment: true });
    expect(receiver).toBeInstanceOf(FirefoxSpikeBackgroundReceiver);
    expect(runtime.onMessage.addListener).toHaveBeenCalledOnce();
    expect(runtime.onConnect.addListener).toHaveBeenCalledOnce();
  });
});
