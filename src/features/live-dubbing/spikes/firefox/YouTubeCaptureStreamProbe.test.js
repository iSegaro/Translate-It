import { describe, expect, it, vi } from 'vitest';
import {
  FIREFOX_CAPTURE_PROBE_STATUS,
  YouTubeCaptureStreamProbe,
} from './YouTubeCaptureStreamProbe.js';

function createEventTarget() {
  const listeners = new Map();
  return {
    addEventListener: vi.fn((eventName, handler) => {
      const handlers = listeners.get(eventName) || new Set();
      handlers.add(handler);
      listeners.set(eventName, handlers);
    }),
    removeEventListener: vi.fn((eventName, handler) => listeners.get(eventName)?.delete(handler)),
    dispatch(eventName) {
      for (const handler of listeners.get(eventName) || []) handler();
    },
  };
}

function createMedia({
  tagName = 'VIDEO',
  paused = false,
  ended = false,
  muted = false,
  captureStream,
  mozCaptureStream,
} = {}) {
  return Object.assign(createEventTarget(), {
    tagName,
    paused,
    ended,
    muted,
    isConnected: true,
    captureStream,
    mozCaptureStream,
  });
}

function createDocument({ videos = [], audios = [] } = {}) {
  const events = createEventTarget();
  return {
    ...events,
    documentElement: {},
    videos,
    audios,
    querySelectorAll: vi.fn(selector => selector === 'video' ? videos : audios),
    contains: vi.fn(media => media?.isConnected !== false),
  };
}

function createTrack({ readyState = 'live', muted = false } = {}) {
  return Object.assign(createEventTarget(), {
    readyState,
    muted,
    stop: vi.fn(),
  });
}

function createStream(audioTracks = [], tracks = audioTracks) {
  return {
    getAudioTracks: vi.fn(() => audioTracks),
    getTracks: vi.fn(() => tracks),
  };
}

function createAudioContext(samples = [0.5, -0.5, 0.25, -0.25]) {
  const analyser = {
    fftSize: 4,
    connect: vi.fn(),
    disconnect: vi.fn(),
    getFloatTimeDomainData: vi.fn(data => data.set(samples)),
  };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const sink = {
    gain: { value: 1 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  return {
    destination: {},
    createMediaStreamSource: vi.fn(() => source),
    createAnalyser: vi.fn(() => analyser),
    createGain: vi.fn(() => sink),
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    analyser,
    source,
    sink,
  };
}

function createObserverFactory() {
  let callback;
  const observer = {
    observe: vi.fn(),
    disconnect: vi.fn(),
    trigger: () => callback?.(),
  };
  const Factory = vi.fn(function MutationObserver(handler) {
    callback = handler;
    return observer;
  });
  return { Factory, observer };
}

function createProbe({ documentRef, contextFactory, observerFactory } = {}) {
  const context = contextFactory ? contextFactory() : createAudioContext();
  const observer = observerFactory || createObserverFactory();
  const windowRef = createEventTarget();
  return {
    context,
    observer: observer.observer,
    probe: new YouTubeCaptureStreamProbe({
      documentRef,
      windowRef,
      audioContextFactory: vi.fn(() => context),
      mutationObserverFactory: observer.Factory,
      analyserFftSize: 4,
    }),
  };
}

describe('YouTubeCaptureStreamProbe (Firefox DEV spike)', () => {
  it('prefers captureStream and reports only scalar track and audio metrics', async () => {
    const audioTrack = createTrack();
    const stream = createStream([audioTrack]);
    const media = createMedia({ captureStream: vi.fn(() => stream), mozCaptureStream: vi.fn() });
    const documentRef = createDocument({ videos: [media] });
    const { probe } = createProbe({ documentRef });

    const status = await probe.start();

    expect(status).toMatchObject({
      success: true,
      state: FIREFOX_CAPTURE_PROBE_STATUS.ACTIVE,
      mediaType: 'video',
      captureMethod: 'captureStream',
      trackCount: 1,
      audioTracks: [{ readyState: 'live', muted: false }],
      rms: Math.sqrt(0.625 / 4),
      peak: 0.5,
    });
    expect(media.captureStream).toHaveBeenCalledOnce();
    expect(media.mozCaptureStream).not.toHaveBeenCalled();
    expect(status).not.toHaveProperty('stream');
    expect(status).not.toHaveProperty('samples');
    expect(JSON.stringify(status)).not.toContain('VIDEO');
  });

  it('falls back to a playing audio element and mozCaptureStream only when needed', async () => {
    const audioTrack = createTrack();
    const stream = createStream([audioTrack]);
    const video = createMedia({ paused: true, tagName: 'VIDEO' });
    const audio = createMedia({
      tagName: 'AUDIO',
      captureStream: undefined,
      mozCaptureStream: vi.fn(() => stream),
    });
    const documentRef = createDocument({ videos: [video], audios: [audio] });
    const { probe } = createProbe({ documentRef });

    await expect(probe.start()).resolves.toMatchObject({
      state: FIREFOX_CAPTURE_PROBE_STATUS.ACTIVE,
      mediaType: 'audio',
      captureMethod: 'mozCaptureStream',
    });
    expect(audio.mozCaptureStream).toHaveBeenCalledOnce();
  });

  it.each([
    ['no media', {}, FIREFOX_CAPTURE_PROBE_STATUS.NO_MEDIA],
    ['paused media', { videos: [createMedia({ paused: true })] }, FIREFOX_CAPTURE_PROBE_STATUS.PAUSED],
    ['ended media', { videos: [createMedia({ ended: true })] }, FIREFOX_CAPTURE_PROBE_STATUS.ENDED],
  ])('distinguishes %s before attempting capture', async (_label, options, state) => {
    const documentRef = createDocument(options);
    const { probe } = createProbe({ documentRef });

    await expect(probe.start()).resolves.toMatchObject({ state });
    expect(documentRef.videos[0]?.captureStream).toBeUndefined();
  });

  it('distinguishes unavailable capture and a successful capture with no audio tracks', async () => {
    const unavailableMedia = createMedia();
    const unavailableDocument = createDocument({ videos: [unavailableMedia] });
    const unavailableProbe = createProbe({ documentRef: unavailableDocument }).probe;
    await expect(unavailableProbe.start()).resolves.toMatchObject({
      success: false,
      state: FIREFOX_CAPTURE_PROBE_STATUS.UNAVAILABLE,
      reason: 'CAPTURE_STREAM_UNAVAILABLE',
    });

    const emptyStream = createStream([]);
    const emptyMedia = createMedia({ captureStream: vi.fn(() => emptyStream) });
    const emptyDocument = createDocument({ videos: [emptyMedia] });
    const emptyProbe = createProbe({ documentRef: emptyDocument }).probe;
    await expect(emptyProbe.start()).resolves.toMatchObject({
      state: FIREFOX_CAPTURE_PROBE_STATUS.NO_TRACKS,
      trackCount: 0,
    });

    const endedTrack = createTrack({ readyState: 'ended' });
    const endedStream = createStream([endedTrack]);
    const endedMedia = createMedia({ captureStream: vi.fn(() => endedStream) });
    const endedProbe = createProbe({
      documentRef: createDocument({ videos: [endedMedia] }),
    }).probe;
    await expect(endedProbe.start()).resolves.toMatchObject({
      state: FIREFOX_CAPTURE_PROBE_STATUS.ENDED,
      trackCount: 1,
      audioTracks: [{ readyState: 'ended', muted: false }],
    });
  });

  it('distinguishes muted and silent audio while retaining scalar track state', async () => {
    const mutedTrack = createTrack();
    const mutedStream = createStream([mutedTrack]);
    const mutedMedia = createMedia({ muted: true, captureStream: vi.fn(() => mutedStream) });
    const mutedProbe = createProbe({ documentRef: createDocument({ videos: [mutedMedia] }) }).probe;
    await expect(mutedProbe.start()).resolves.toMatchObject({
      state: FIREFOX_CAPTURE_PROBE_STATUS.MUTED,
      rms: null,
      peak: null,
    });

    const silentTrack = createTrack();
    const silentStream = createStream([silentTrack]);
    const silentMedia = createMedia({ captureStream: vi.fn(() => silentStream) });
    const silentContextFactory = () => createAudioContext([0, 0, 0, 0]);
    const silentProbe = createProbe({
      documentRef: createDocument({ videos: [silentMedia] }),
      contextFactory: silentContextFactory,
    }).probe;
    await expect(silentProbe.start()).resolves.toMatchObject({
      state: FIREFOX_CAPTURE_PROBE_STATUS.SILENT,
      rms: 0,
      peak: 0,
      audioTracks: [{ readyState: 'live', muted: false }],
    });
  });

  it('updates pause/resume and track mute lifecycle without recapturing', async () => {
    const track = createTrack();
    const stream = createStream([track]);
    const media = createMedia({ captureStream: vi.fn(() => stream) });
    const { probe } = createProbe({ documentRef: createDocument({ videos: [media] }) });
    await probe.start();

    media.paused = true;
    media.dispatch('pause');
    expect(probe.status().state).toBe(FIREFOX_CAPTURE_PROBE_STATUS.PAUSED);

    media.paused = false;
    media.dispatch('play');
    expect(probe.status().state).toBe(FIREFOX_CAPTURE_PROBE_STATUS.ACTIVE);

    track.muted = true;
    track.dispatch('mute');
    expect(probe.status().state).toBe(FIREFOX_CAPTURE_PROBE_STATUS.MUTED);
    expect(media.captureStream).toHaveBeenCalledOnce();
  });

  it('marks navigation and media replacement stale without automatic recapture', async () => {
    const firstStream = createStream([createTrack()]);
    const first = createMedia({ captureStream: vi.fn(() => firstStream) });
    const documentRef = createDocument({ videos: [first] });
    const { probe, observer } = createProbe({ documentRef });
    await probe.start();

    documentRef.dispatch('yt-navigate-start');
    expect(probe.status()).toMatchObject({
      state: FIREFOX_CAPTURE_PROBE_STATUS.STALE,
      reason: 'YOUTUBE_NAVIGATION',
    });
    expect(first.captureStream).toHaveBeenCalledOnce();
    await expect(probe.start()).resolves.toMatchObject({ state: FIREFOX_CAPTURE_PROBE_STATUS.STALE });

    const replacement = createMedia({ captureStream: vi.fn(() => createStream([createTrack()])) });
    first.isConnected = false;
    documentRef.videos.splice(0, 1, replacement);
    observer.trigger();
    expect(probe.status().state).toBe(FIREFOX_CAPTURE_PROBE_STATUS.STALE);
    expect(replacement.captureStream).not.toHaveBeenCalled();

    await expect(probe.restart()).resolves.toMatchObject({
      state: FIREFOX_CAPTURE_PROBE_STATUS.ACTIVE,
      mediaType: 'video',
    });
    expect(replacement.captureStream).toHaveBeenCalledOnce();
  });

  it('reports capture errors and cleans probe-owned resources idempotently', async () => {
    const errorMedia = createMedia({ captureStream: vi.fn(() => { throw new Error('raw page detail'); }) });
    const errorDocument = createDocument({ videos: [errorMedia] });
    const errorProbe = createProbe({ documentRef: errorDocument }).probe;

    await expect(errorProbe.start()).resolves.toMatchObject({
      success: false,
      state: FIREFOX_CAPTURE_PROBE_STATUS.CAPTURE_ERROR,
      reason: 'CAPTURE_STREAM_FAILED',
    });
    expect(errorProbe.status().state).toBe(FIREFOX_CAPTURE_PROBE_STATUS.CAPTURE_ERROR);
    expect(JSON.stringify(errorProbe.status())).not.toContain('raw page detail');

    const track = createTrack();
    const stream = createStream([track]);
    const media = createMedia({ captureStream: vi.fn(() => stream) });
    const observerFactory = createObserverFactory();
    const { probe, context } = createProbe({
      documentRef: createDocument({ videos: [media] }),
      contextFactory: () => createAudioContext(),
      observerFactory,
    });
    await probe.start();
    await probe.stop();
    await probe.stop();

    expect(track.stop).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
    expect(observerFactory.observer.disconnect).toHaveBeenCalledOnce();
  });
});
