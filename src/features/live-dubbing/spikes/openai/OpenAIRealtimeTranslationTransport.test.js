import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/shared/proxy/ProxySettings.js', () => ({ resolveProxyConfig: vi.fn() }));
vi.mock('@/shared/proxy/ProxyManager.js', () => ({ proxyManager: { fetch: vi.fn() } }));
import { resolveProxyConfig } from '@/shared/proxy/ProxySettings.js';
import { proxyManager } from '@/shared/proxy/ProxyManager.js';
import {
  OPENAI_REALTIME_EVENTS_CHANNEL,
  OPENAI_REALTIME_TRANSLATIONS_CALLS_ENDPOINT,
  OpenAIRealtimeTranslationTransport,
} from './OpenAIRealtimeTranslationTransport.js';

const OFFER_SDP = 'v=0\r\no=mock-offer';
const ANSWER_SDP = 'v=0\r\no=mock-answer';

function createTrack(overrides = {}) {
  return {
    kind: 'audio',
    readyState: 'live',
    stop: vi.fn(),
    ...overrides,
  };
}

function createSourceStream(tracks) {
  return { getAudioTracks: vi.fn(() => tracks) };
}

function createChannel(label) {
  return {
    label,
    onmessage: null,
    close: vi.fn(async () => {}),
    send: vi.fn(),
  };
}

function createPeerConnection({ channels = [] } = {}) {
  const pc = {
    addTrack: vi.fn(() => ({ id: 'sender-1' })),
    createDataChannel: vi.fn((label) => {
      const channel = createChannel(label);
      channels.push(channel);
      return channel;
    }),
    createOffer: vi.fn(async () => ({ type: 'offer', sdp: OFFER_SDP })),
    setLocalDescription: vi.fn(async () => {}),
    setRemoteDescription: vi.fn(async () => {}),
    close: vi.fn(() => {}),
    localDescription: { type: 'offer', sdp: OFFER_SDP },
    ontrack: null,
    onconnectionstatechange: null,
  };
  return pc;
}

function createAudioElement() {
  return {
    srcObject: null,
    play: vi.fn(async () => {}),
    pause: vi.fn(async () => {}),
  };
}

function okSdpAnswer(sdp = ANSWER_SDP) {
  return { ok: true, status: 200, text: async () => sdp };
}

function createTransport({ pc, pcs = [], audioElements = [], fetchImpl, logger } = {}) {
  const peerConnectionFactory = vi.fn(async () => {
    const connection = pc || createPeerConnection();
    pcs.push(connection);
    return connection;
  });
  const audioElementFactory = vi.fn(() => {
    const element = createAudioElement();
    audioElements.push(element);
    return element;
  });
  const transport = new OpenAIRealtimeTranslationTransport({
    peerConnectionFactory,
    audioElementFactory,
    fetchImpl: fetchImpl || (async () => okSdpAnswer()),
    performanceNow: () => 1000,
    logger: logger || { debug: () => {}, warn: () => {}, error: () => {} },
  });
  return { transport, pcs, audioElements, peerConnectionFactory, audioElementFactory };
}

const BOOTSTRAP = { secret: 'ek_test_secret', targetLanguage: 'es', model: 'gpt-realtime-translate' };

describe('OpenAIRealtimeTranslationTransport (SPIKE)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds source-stream audio tracks and completes offer/answer', async () => {
    const fetchImpl = vi.fn(async () => okSdpAnswer());
    const { transport, pcs } = createTransport({ fetchImpl });
    const track = createTrack();

    const result = await transport.start({
      sourceStream: createSourceStream([track]),
      targetLanguage: 'es',
      bootstrap: BOOTSTRAP,
    });

    expect(result).toEqual({ success: true, targetLanguage: 'es' });
    const pc = pcs[0];
    expect(pc.addTrack).toHaveBeenCalledWith(track, expect.anything());
    expect(pc.createOffer).toHaveBeenCalledOnce();
    expect(pc.setLocalDescription).toHaveBeenCalledOnce();
    expect(pc.setRemoteDescription).toHaveBeenCalledWith({ type: 'answer', sdp: ANSWER_SDP });
  });

  it('accepts a lone source audio track without a stream', async () => {
    const { transport, pcs } = createTransport({});

    const result = await transport.start({
      sourceAudioTrack: createTrack(),
      targetLanguage: 'es',
      bootstrap: BOOTSTRAP,
    });

    expect(result.success).toBe(true);
    expect(pcs[0].addTrack).toHaveBeenCalledOnce();
  });

  it('rejects without network use when no live audio track exists', async () => {
    const fetchImpl = vi.fn(async () => okSdpAnswer());
    const peerConnectionFactory = vi.fn();
    const transport = new OpenAIRealtimeTranslationTransport({
      peerConnectionFactory,
      fetchImpl,
      audioElementFactory: () => createAudioElement(),
      logger: { debug: () => {}, warn: () => {}, error: () => {} },
    });

    await expect(transport.start({
      sourceStream: createSourceStream([]),
      targetLanguage: 'es',
      bootstrap: BOOTSTRAP,
    })).resolves.toMatchObject({ success: false, error: 'NO_AUDIO_TRACK' });

    await expect(transport.start({
      sourceAudioTrack: createTrack({ readyState: 'ended' }),
      targetLanguage: 'es',
      bootstrap: BOOTSTRAP,
    })).resolves.toMatchObject({ success: false, error: 'NO_AUDIO_TRACK' });

    expect(peerConnectionFactory).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects invalid target languages before creating a peer connection', async () => {
    const peerConnectionFactory = vi.fn();
    const fetchImpl = vi.fn(async () => okSdpAnswer());
    const transport = new OpenAIRealtimeTranslationTransport({
      peerConnectionFactory,
      fetchImpl,
      audioElementFactory: () => createAudioElement(),
      logger: { debug: () => {}, warn: () => {}, error: () => {} },
    });

    await expect(transport.start({
      sourceAudioTrack: createTrack(),
      targetLanguage: '',
      bootstrap: BOOTSTRAP,
    })).resolves.toMatchObject({ success: false, error: 'INVALID_TARGET_LANGUAGE' });
    expect(peerConnectionFactory).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects secret-less bootstraps without network use', async () => {
    const fetchImpl = vi.fn(async () => okSdpAnswer());
    const peerConnectionFactory = vi.fn();
    const transport = new OpenAIRealtimeTranslationTransport({
      peerConnectionFactory,
      fetchImpl,
      audioElementFactory: () => createAudioElement(),
      logger: { debug: () => {}, warn: () => {}, error: () => {} },
    });

    await expect(transport.start({
      sourceAudioTrack: createTrack(),
      targetLanguage: 'es',
      bootstrap: { targetLanguage: 'es' },
    })).resolves.toMatchObject({ success: false, error: 'INVALID_BOOTSTRAP' });
    expect(peerConnectionFactory).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed on bootstrap/target-language mismatch', async () => {
    const fetchImpl = vi.fn(async () => okSdpAnswer());
    const { transport } = createTransport({ fetchImpl });

    await expect(transport.start({
      sourceAudioTrack: createTrack(),
      targetLanguage: 'fr',
      bootstrap: BOOTSTRAP,
    })).resolves.toMatchObject({ success: false, error: 'LANGUAGE_MISMATCH' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('creates the oai-events data channel', async () => {
    const { transport, pcs } = createTransport({});

    await transport.start({
      sourceAudioTrack: createTrack(),
      targetLanguage: 'es',
      bootstrap: BOOTSTRAP,
    });

    expect(pcs[0].createDataChannel).toHaveBeenCalledWith(OPENAI_REALTIME_EVENTS_CHANNEL);
  });

  it('POSTs raw SDP with the client secret and SDP content type', async () => {
    const fetchImpl = vi.fn(async () => okSdpAnswer());
    const { transport } = createTransport({ fetchImpl });

    await transport.start({
      sourceAudioTrack: createTrack(),
      targetLanguage: 'es',
      bootstrap: BOOTSTRAP,
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe(OPENAI_REALTIME_TRANSLATIONS_CALLS_ENDPOINT);
    expect(options.method).toBe('POST');
    expect(options.headers).toMatchObject({
      Authorization: 'Bearer ek_test_secret',
      'Content-Type': 'application/sdp',
    });
    expect(options.body).toBe(OFFER_SDP);
  });

  it('routes remote tracks to audio-element playback', async () => {
    const { transport, pcs, audioElements } = createTransport({});
    await transport.start({
      sourceAudioTrack: createTrack(),
      targetLanguage: 'es',
      bootstrap: BOOTSTRAP,
    });

    const remoteStream = { id: 'remote-1' };
    pcs[0].ontrack({ track: createTrack(), streams: [remoteStream] });

    expect(audioElements).toHaveLength(1);
    expect(audioElements[0].srcObject).toBe(remoteStream);
    expect(audioElements[0].play).toHaveBeenCalledOnce();
    expect(transport.getTelemetry()).toMatchObject({ remoteTracks: 1 });
  });

  it('counts transcript events only and never stores text', async () => {
    const debug = vi.fn();
    const channels = [];
    const pc = createPeerConnection({ channels });
    const { transport } = createTransport({
      pc,
      logger: { debug, warn: () => {}, error: () => {} },
    });
    await transport.start({
      sourceAudioTrack: createTrack(),
      targetLanguage: 'es',
      bootstrap: BOOTSTRAP,
    });

    const channel = channels[0];
    channel.onmessage({ data: JSON.stringify({ type: 'transcript.delta', text: 'hola mundo secreto' }) });
    channel.onmessage({ data: JSON.stringify({ type: 'response.transcript.done', text: 'otro secreto' }) });
    channel.onmessage({ data: { type: 'session.updated' } });
    channel.onmessage({ data: JSON.stringify({ type: 'audio.delta', audio: 'AAAA' }) });
    channel.onmessage({ data: 'not-json{{{' });
    channel.onmessage({});

    expect(transport.getTelemetry()).toMatchObject({ transcriptEvents: 2 });
    const snapshot = JSON.stringify([transport.getTelemetry(), transport.getSnapshot(), debug.mock.calls]);
    expect(snapshot).not.toContain('hola mundo secreto');
    expect(snapshot).not.toContain('otro secreto');
    expect(snapshot).not.toContain('ek_test_secret');
    expect(snapshot).not.toContain(OFFER_SDP);
    expect(snapshot).not.toContain(ANSWER_SDP);
  });

  it('exposes scalar-only telemetry and snapshots', async () => {
    const { transport } = createTransport({});
    await transport.start({
      sourceAudioTrack: createTrack(),
      targetLanguage: 'es',
      bootstrap: BOOTSTRAP,
    });

    const telemetry = transport.getTelemetry();
    expect(telemetry).toMatchObject({ offerCreated: true, answerApplied: true });
    expect(JSON.stringify(telemetry)).not.toContain('ek_test_secret');

    const snapshot = transport.getSnapshot();
    expect(snapshot).toMatchObject({ active: true, targetLanguage: 'es' });
    expect(JSON.stringify(snapshot)).not.toContain('ek_test_secret');
  });

  it('disposes idempotently and clears handlers without stopping source tracks', async () => {
    const { transport, pcs } = createTransport({});
    const track = createTrack();
    await transport.start({
      sourceAudioTrack: track,
      targetLanguage: 'es',
      bootstrap: BOOTSTRAP,
    });
    const pc = pcs[0];
    const channel = pc.createDataChannel.mock.results[0].value;

    await expect(transport.dispose()).resolves.toMatchObject({ success: true });
    await expect(transport.dispose()).resolves.toMatchObject({ success: true, idempotent: true });

    expect(channel.close).toHaveBeenCalled();
    expect(pc.close).toHaveBeenCalled();
    expect(pc.ontrack).toBeNull();
    expect(channel.onmessage).toBeNull();
    expect(track.stop).not.toHaveBeenCalled();
    expect(transport.getSnapshot().active).toBe(false);
  });

  it('ignores late data-channel and track events after dispose', async () => {
    const channels = [];
    const pc = createPeerConnection({ channels });
    const { transport, audioElements } = createTransport({ pc });
    await transport.start({
      sourceAudioTrack: createTrack(),
      targetLanguage: 'es',
      bootstrap: BOOTSTRAP,
    });
    await transport.dispose();

    channels[0].onmessage?.({ data: JSON.stringify({ type: 'transcript.delta', text: 'late' }) });
    pc.ontrack?.({ track: createTrack(), streams: [{ id: 'late' }] });

    expect(transport.getTelemetry()).toMatchObject({ transcriptEvents: 0, remoteTracks: 0 });
    expect(audioElements).toHaveLength(0);
  });

  it('closes the peer connection when the SDP exchange fails', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, text: async () => '' }));
    const { transport, pcs } = createTransport({ fetchImpl });

    await expect(transport.start({
      sourceAudioTrack: createTrack(),
      targetLanguage: 'es',
      bootstrap: BOOTSTRAP,
    })).resolves.toMatchObject({ success: false, error: 'SDP_EXCHANGE_FAILED' });

    expect(pcs[0].close).toHaveBeenCalled();
    expect(transport.getSnapshot().active).toBe(false);
  });

  it('rejects empty SDP answers without applying remote state', async () => {
    const fetchImpl = vi.fn(async () => okSdpAnswer('   '));
    const { transport, pcs } = createTransport({ fetchImpl });

    await expect(transport.start({
      sourceAudioTrack: createTrack(),
      targetLanguage: 'es',
      bootstrap: BOOTSTRAP,
    })).resolves.toMatchObject({ success: false, error: 'ANSWER_FAILED' });
    expect(pcs[0].setRemoteDescription).not.toHaveBeenCalled();
  });

  it('rejects a second start while a session is active', async () => {
    const { transport } = createTransport({});

    await expect(transport.start({
      sourceAudioTrack: createTrack(),
      targetLanguage: 'es',
      bootstrap: BOOTSTRAP,
    })).resolves.toMatchObject({ success: true });
    await expect(transport.start({
      sourceAudioTrack: createTrack(),
      targetLanguage: 'es',
      bootstrap: BOOTSTRAP,
    })).resolves.toMatchObject({ success: false, error: 'ALREADY_STARTED' });
  });

  it('leaves the live session fenced and functional after a rejected second start', async () => {
    const channels = [];
    const pc = createPeerConnection({ channels });
    const { transport, audioElements } = createTransport({ pc });

    await expect(transport.start({
      sourceAudioTrack: createTrack(),
      targetLanguage: 'es',
      bootstrap: BOOTSTRAP,
    })).resolves.toMatchObject({ success: true });
    const generationAfterFirstStart = transport.generation;

    await expect(transport.start({
      sourceAudioTrack: createTrack(),
      targetLanguage: 'es',
      bootstrap: BOOTSTRAP,
    })).resolves.toMatchObject({ success: false, error: 'ALREADY_STARTED' });

    // Zero mutation: the fence did not move, so session A still owns events.
    expect(transport.generation).toBe(generationAfterFirstStart);

    channels[0].onmessage({ data: JSON.stringify({ type: 'transcript.delta', text: 'sigue viva' }) });
    const remoteStream = { id: 'remote-still-live' };
    pc.ontrack({ track: createTrack(), streams: [remoteStream] });

    expect(transport.getTelemetry()).toMatchObject({ transcriptEvents: 1, remoteTracks: 1 });
    expect(audioElements).toHaveLength(1);
    expect(audioElements[0].srcObject).toBe(remoteStream);
    expect(audioElements[0].play).toHaveBeenCalledOnce();
    const snapshot = JSON.stringify([transport.getTelemetry(), transport.getSnapshot()]);
    expect(snapshot).not.toContain('sigue viva');

    await expect(transport.dispose()).resolves.toMatchObject({ success: true });
  });

  it('rejects a concurrent start while one is pending with a single factory call', async () => {
    let resolveFactory;
    const peerConnectionFactory = vi.fn(() => new Promise((resolve) => { resolveFactory = resolve; }));
    const transport = new OpenAIRealtimeTranslationTransport({
      peerConnectionFactory,
      audioElementFactory: () => createAudioElement(),
      fetchImpl: async () => okSdpAnswer(),
      performanceNow: () => 1000,
      logger: { debug: () => {}, warn: () => {}, error: () => {} },
    });
    const input = {
      sourceAudioTrack: createTrack(),
      targetLanguage: 'es',
      bootstrap: BOOTSTRAP,
    };

    const startA = transport.start(input);
    // A is suspended on the deferred factory; B must fence off the
    // synchronously reserved pending start.
    await expect(transport.start(input)).resolves.toMatchObject({ success: false, error: 'ALREADY_STARTED' });

    expect(peerConnectionFactory).toHaveBeenCalledOnce();
    expect(transport.generation).toBe(1);

    resolveFactory(createPeerConnection());
    await expect(startA).resolves.toMatchObject({ success: true, targetLanguage: 'es' });
    expect(transport.getSnapshot().active).toBe(true);

    await expect(transport.dispose()).resolves.toMatchObject({ success: true });
  });

  it('invalidates a pending start on dispose so the late connection never publishes', async () => {
    let resolveFactory;
    const peerConnectionFactory = vi.fn(() => new Promise((resolve) => { resolveFactory = resolve; }));
    const transport = new OpenAIRealtimeTranslationTransport({
      peerConnectionFactory,
      audioElementFactory: () => createAudioElement(),
      fetchImpl: async () => okSdpAnswer(),
      performanceNow: () => 1000,
      logger: { debug: () => {}, warn: () => {}, error: () => {} },
    });
    const track = createTrack();

    const startA = transport.start({
      sourceAudioTrack: track,
      targetLanguage: 'es',
      bootstrap: BOOTSTRAP,
    });
    await expect(transport.dispose()).resolves.toMatchObject({ success: true, idempotent: true });

    const latePc = createPeerConnection();
    resolveFactory(latePc);
    await expect(startA).resolves.toMatchObject({ success: false, error: 'START_CANCELLED' });

    expect(latePc.close).toHaveBeenCalledOnce();
    expect(transport.getSnapshot()).toMatchObject({ active: false, targetLanguage: null });
    expect(track.stop).not.toHaveBeenCalled();

    // The reservation was cleared: a legitimate start works afterwards.
    const startC = transport.start({
      sourceAudioTrack: createTrack(),
      targetLanguage: 'es',
      bootstrap: BOOTSTRAP,
    });
    resolveFactory(createPeerConnection());
    await expect(startC).resolves.toMatchObject({ success: true, targetLanguage: 'es' });

    await expect(transport.dispose()).resolves.toMatchObject({ success: true });
  });

  it('exchanges SDP through the proxy infrastructure on the default path', async () => {
    const config = { enabled: false };
    resolveProxyConfig.mockResolvedValue(config);
    proxyManager.fetch.mockResolvedValue(okSdpAnswer());
    const pcs = [];
    const transport = new OpenAIRealtimeTranslationTransport({
      peerConnectionFactory: async () => {
        const pc = createPeerConnection();
        pcs.push(pc);
        return pc;
      },
      audioElementFactory: () => createAudioElement(),
      performanceNow: () => 1000,
      logger: { debug: () => {}, warn: () => {}, error: () => {} },
    });

    await expect(transport.start({
      sourceAudioTrack: createTrack(),
      targetLanguage: 'es',
      bootstrap: BOOTSTRAP,
    })).resolves.toMatchObject({ success: true });

    expect(resolveProxyConfig).toHaveBeenCalled();
    expect(proxyManager.fetch).toHaveBeenCalledOnce();
    expect(proxyManager.fetch.mock.calls[0][0]).toBe(OPENAI_REALTIME_TRANSLATIONS_CALLS_ENDPOINT);
    expect(proxyManager.fetch.mock.calls[0][2]).toBe(config);
  });

  it('stays browser-neutral with no capture or pipeline coupling', async () => {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const source = await readFile(join(
      process.cwd(),
      'src/features/live-dubbing/spikes/openai/OpenAIRealtimeTranslationTransport.js',
    ), 'utf8');

    for (const forbidden of ['tabCapture', 'TabAudioPipeline', 'PcmOutputPlayer', 'getMediaStreamId', 'chrome.']) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).toContain('RTCPeerConnection');
    expect(source).toContain(OPENAI_REALTIME_EVENTS_CHANNEL);
  });
});
