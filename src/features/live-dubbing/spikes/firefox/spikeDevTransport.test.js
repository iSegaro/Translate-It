import { describe, expect, it, vi } from 'vitest';
import {
  FIREFOX_TRANSPORT_OUTCOMES,
  FIREFOX_TRANSPORT_ERROR_CATEGORIES,
  FIREFOX_YOUTUBE_SPIKE_MESSAGE_ACTIONS,
  FIREFOX_YOUTUBE_SPIKE_MESSAGE_TARGET,
  FirefoxWebExtensionTransportProbe,
} from './spikeDevTransport.js';

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
  constructor(track) {
    this.track = track;
  }

  getAudioTracks() {
    return [this.track];
  }

  getTracks() {
    return [this.track];
  }
}

function createPort(reply) {
  const messageListeners = new Set();
  const disconnectListeners = new Set();
  const port = {
    name: 'firefox-youtube-capture-stream-spike',
    sender: { id: 'extension-id', url: 'https://www.youtube.com/watch?v=1' },
    onMessage: {
      addListener: listener => messageListeners.add(listener),
      removeListener: listener => messageListeners.delete(listener),
    },
    onDisconnect: {
      addListener: listener => disconnectListeners.add(listener),
      removeListener: listener => disconnectListeners.delete(listener),
    },
    postMessage: vi.fn(message => {
      queueMicrotask(() => {
        for (const listener of messageListeners) listener(reply(message));
      });
    }),
    disconnect: vi.fn(() => {
      for (const listener of disconnectListeners) listener();
    }),
  };
  return port;
}

function createCaptureSource({ clone = true } = {}) {
  const track = new FakeTrack();
  if (!clone) track.clone = undefined;
  return { track, stream: new FakeStream(track) };
}

function acceptedReply(message) {
  const source = message.data.source;
  const isStream = source === 'captured-stream';
  return {
    transport: 'port',
    source,
    outcome: FIREFOX_TRANSPORT_OUTCOMES.ACCEPTED,
    accepted: true,
    receivedType: isStream ? 'MediaStream' : 'MediaStreamTrack',
    kind: 'audio',
    readyState: 'live',
    muted: false,
    analyserActivity: isStream ? 'active' : 'unsupported',
    analyserPeak: isStream ? 0.25 : null,
    ended: false,
    ownership: 'received',
    errorCategory: null,
  };
}

describe('Firefox DEV WebExtension transport probe', () => {
  it('records serialization rejection and accepted scalar Port replies, then cleans clones and ports', async () => {
    const { track, stream } = createCaptureSource();
    const ports = [];
    const sendMessage = vi.fn(async () => {
      const error = new Error('message cannot be cloned');
      error.name = 'DataCloneError';
      throw error;
    });
    const runtime = {
      sendMessage,
      connect: vi.fn(() => {
        const port = createPort(acceptedReply);
        ports.push(port);
        return port;
      }),
    };
    const probe = new FirefoxWebExtensionTransportProbe({ runtime });

    const status = await probe.start({ captureProbe: {
      captureStream: stream,
      audioTracks: [track],
    } });

    expect(status.success).toBe(true);
    expect(status.attempts).toHaveLength(6);
    expect(status.attempts.filter(attempt => attempt.transport === 'send-message'))
      .toHaveLength(3);
    expect(status.attempts.filter(attempt => attempt.transport === 'port'))
      .toHaveLength(3);
    expect(status.attempts.filter(attempt => attempt.transport === 'send-message')
      .every(attempt => attempt.errorCategory === FIREFOX_TRANSPORT_ERROR_CATEGORIES.DATA_CLONE_ERROR))
      .toBe(true);
    expect(status.attempts.filter(attempt => attempt.transport === 'port')
      .every(attempt => attempt.outcome === FIREFOX_TRANSPORT_OUTCOMES.ACCEPTED))
      .toBe(true);
    expect(sendMessage.mock.calls.every(([message]) => (
      message.target === FIREFOX_YOUTUBE_SPIKE_MESSAGE_TARGET
      && message.action === FIREFOX_YOUTUBE_SPIKE_MESSAGE_ACTIONS.SEND_MESSAGE
      && message.data.payload
    ))).toBe(true);

    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain('payload');
    expect(serialized).not.toContain('stream-object');
    expect(serialized).not.toContain('private');

    await probe.stop();
    expect(ports).toHaveLength(3);
    expect(ports.every(port => port.disconnect.mock.calls.length > 0)).toBe(true);
    expect(track.stop).toHaveBeenCalledTimes(0);
    expect(status.cloneState).toBe('owned');
    expect(probe.status().cloneState).toBe('released');
    expect(probe.status().attempts).toHaveLength(6);
  });

  it('does not claim success when a mock reply reports an unreceived object', async () => {
    const { track, stream } = createCaptureSource();
    const runtime = {
      sendMessage: vi.fn(async message => ({
        transport: 'send-message',
        source: message.data.source,
        accepted: true,
        receivedType: 'Object',
      })),
    };
    const probe = new FirefoxWebExtensionTransportProbe({ runtime });

    const status = await probe.start({ captureProbe: { captureStream: stream, audioTracks: [track] } });

    expect(status.success).toBe(false);
    expect(status.attempts.filter(attempt => attempt.transport === 'send-message')
      .every(attempt => attempt.errorCategory === FIREFOX_TRANSPORT_ERROR_CATEGORIES.INVALID_REPLY))
      .toBe(true);
    expect(status.attempts.filter(attempt => attempt.transport === 'port')
      .every(attempt => attempt.outcome === FIREFOX_TRANSPORT_OUTCOMES.UNSUPPORTED))
      .toBe(true);
    await probe.stop();
  });

  it('reports all sources as untested when capture has not started', async () => {
    const probe = new FirefoxWebExtensionTransportProbe({ runtime: {} });
    const status = await probe.start({ captureProbe: {} });

    expect(status.sourceAvailable).toBe(false);
    expect(status.attempts).toHaveLength(6);
    expect(status.attempts.every(attempt => attempt.outcome === FIREFOX_TRANSPORT_OUTCOMES.UNTESTED))
      .toBe(true);
    expect(status.attempts.every(attempt => (
      attempt.errorCategory === FIREFOX_TRANSPORT_ERROR_CATEGORIES.SOURCE_UNAVAILABLE
    ))).toBe(true);
  });

  it('reports clone unsupported without fabricating a clone attempt', async () => {
    const { track, stream } = createCaptureSource({ clone: false });
    const probe = new FirefoxWebExtensionTransportProbe({ runtime: {} });

    const status = await probe.start({ captureProbe: { captureStream: stream, audioTracks: [track] } });

    const cloneAttempts = status.attempts.filter(attempt => attempt.source === 'cloned-audio-track');
    expect(cloneAttempts).toHaveLength(2);
    expect(cloneAttempts.every(attempt => attempt.outcome === FIREFOX_TRANSPORT_OUTCOMES.UNSUPPORTED))
      .toBe(true);
    expect(cloneAttempts.every(attempt => (
      attempt.errorCategory === FIREFOX_TRANSPORT_ERROR_CATEGORIES.CLONE_UNSUPPORTED
    ))).toBe(true);
    await probe.stop();
  });
});
