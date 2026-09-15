import { describe, expect, it, vi } from 'vitest';
import {
  FirefoxRuntimeCapabilitiesProbe,
  sanitizeFirefoxRuntimeCapabilities,
} from './spikeDevRuntimeCapabilities.js';

describe('Firefox DEV runtime capability probe', () => {
  it('reports local AudioContext graph, no-network WebSocket check, RTC data channel, and fetch availability', () => {
    const channel = { close: vi.fn() };
    const peers = [];
    class FakeRTCPeerConnection {
      constructor() {
        this.createDataChannel = vi.fn(() => channel);
        this.close = vi.fn();
        peers.push(this);
      }
    }
    const windowRef = {
      AudioContext: vi.fn(),
      WebSocket: class WebSocket {
        constructor() {
          throw new TypeError('URL is required; no connection was attempted');
        }
      },
      RTCPeerConnection: FakeRTCPeerConnection,
      fetch: vi.fn(),
    };
    const probe = new FirefoxRuntimeCapabilitiesProbe({
      windowRef,
      captureProbe: {
        audioContext: {},
        sourceNode: { connect: vi.fn() },
        analyserNode: {},
      },
    });

    const status = probe.start();

    expect(status.audioGraph).toEqual({ state: 'active', supported: true, connected: true });
    expect(status.webSocket).toEqual({
      result: 'supported', supported: true, constructed: false, closed: null, network: false,
    });
    expect(status.rtcPeerConnection).toEqual({
      result: 'supported', supported: true, constructed: true, closed: true, network: false,
    });
    expect(status.fetch).toEqual({
      result: 'supported', supported: true, constructed: null, closed: null, network: false,
    });
    expect(channel.close).toHaveBeenCalledOnce();
    expect(peers[0].close).toHaveBeenCalledOnce();
    expect(windowRef.fetch).not.toHaveBeenCalled();
    expect(peers[0].createDataChannel).toHaveBeenCalledWith('translate-it-firefox-spike');
  });

  it('reports unsupported and untested capabilities without attempting network APIs', () => {
    const windowRef = { WebSocket: null, RTCPeerConnection: null, fetch: null };
    const probe = new FirefoxRuntimeCapabilitiesProbe({ windowRef });

    expect(probe.status().audioGraph).toEqual({ state: 'untested', supported: false, connected: null });
    const status = probe.start();

    expect(status.audioGraph).toEqual({ state: 'untested', supported: false, connected: null });
    expect(status.webSocket.result).toBe('unsupported');
    expect(status.rtcPeerConnection.result).toBe('unsupported');
    expect(status.fetch.result).toBe('unsupported');
    expect(status.fetch.network).toBe(false);
  });

  it('sanitizes unknown runtime fields to the closed scalar shape', () => {
    const sanitized = sanitizeFirefoxRuntimeCapabilities({
      audioGraph: { state: 'active', supported: true, connected: true, source: { secret: 'x' } },
      webSocket: { result: 'supported', supported: true, url: 'wss://private' },
      rtcPeerConnection: { result: 'failed', error: { message: 'private' } },
      fetch: { result: 'supported', supported: true, response: { body: 'private' } },
      privateObject: { secret: 'x' },
    });

    expect(sanitized).toEqual({
      audioGraph: { state: 'active', supported: true, connected: true },
      webSocket: { result: 'supported', supported: true, constructed: null, closed: null, network: null },
      rtcPeerConnection: { result: 'failed', supported: null, constructed: null, closed: null, network: null },
      fetch: { result: 'supported', supported: true, constructed: null, closed: null, network: null },
    });
    expect(JSON.stringify(sanitized)).not.toContain('private');
  });
});
