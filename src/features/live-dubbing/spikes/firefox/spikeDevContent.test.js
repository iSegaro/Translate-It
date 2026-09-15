import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FIREFOX_YOUTUBE_SPIKE_HOOK,
  FIREFOX_YOUTUBE_SPIKE_INSTALL_STATUS,
  FIREFOX_YOUTUBE_SPIKE_INSTALL_STATES,
  installFirefoxYouTubeCaptureStreamSpikeHook,
} from './spikeDevContent.js';

function createPageWorld({ failPublish = false } = {}) {
  class XrayPromise extends Promise {}
  const events = [];
  const pageWindow = new Proxy({}, {
    get(target, property, receiver) {
      if (property === FIREFOX_YOUTUBE_SPIKE_HOOK || property === FIREFOX_YOUTUBE_SPIKE_INSTALL_STATUS) {
        events.push(`get:${String(property)}`);
      }
      return Reflect.get(target, property, receiver);
    },
    set(target, property, value) {
      if (property === FIREFOX_YOUTUBE_SPIKE_HOOK || property === FIREFOX_YOUTUBE_SPIKE_INSTALL_STATUS) {
        events.push(`set:${String(property)}`);
      }
      if (failPublish && property === FIREFOX_YOUTUBE_SPIKE_HOOK) {
        throw new Error('private publish failure');
      }
      Reflect.set(target, property, value);
      return true;
    },
    defineProperty() {
      throw new Error('page defineProperty is forbidden');
    },
    preventExtensions() {
      throw new Error('page freeze is forbidden');
    },
  });
  const cloneIntoApi = vi.fn((value, _target, options) => {
    if (options?.cloneFunctions === true) return { ...value };
    return structuredClone(value);
  });
  const xrayWindow = {
    location: { hostname: 'www.youtube.com' },
    wrappedJSObject: pageWindow,
    Promise: XrayPromise,
    cloneInto: cloneIntoApi,
  };
  return { pageWindow, xrayWindow, cloneIntoApi, XrayPromise, events };
}

describe('spikeDevContent Firefox page-world bridge', () => {
  beforeEach(() => {
    delete globalThis[FIREFOX_YOUTUBE_SPIKE_HOOK];
  });

  it('clones one four-method API into the Xray window and assigns only that clone', () => {
    const pageWorld = createPageWorld();
    const target = pageWorld.xrayWindow;
    const probe = {
      start: vi.fn(async () => ({ state: 'ACTIVE' })),
      status: vi.fn(() => ({ state: 'ACTIVE' })),
      restart: vi.fn(async () => ({ state: 'ACTIVE' })),
      stop: vi.fn(async () => ({ state: 'STOPPED' })),
    };

    const hook = installFirefoxYouTubeCaptureStreamSpikeHook({
      target,
      probe,
      isDevelopment: true,
    });

    expect(hook).toBe(pageWorld.pageWindow[FIREFOX_YOUTUBE_SPIKE_HOOK]);
    expect(target[FIREFOX_YOUTUBE_SPIKE_HOOK]).toBeUndefined();
    expect(Object.keys(hook)).toEqual(['start', 'status', 'restart', 'stop']);
    expect(Object.keys(hook).every(name => hook[name].length === 0)).toBe(true);
    expect(pageWorld.pageWindow[FIREFOX_YOUTUBE_SPIKE_INSTALL_STATUS])
      .toBe(FIREFOX_YOUTUBE_SPIKE_INSTALL_STATES.INSTALLED);

    const hookAssignedAt = pageWorld.events.indexOf(`set:${FIREFOX_YOUTUBE_SPIKE_HOOK}`);
    const hookReadAt = pageWorld.events.indexOf(`get:${FIREFOX_YOUTUBE_SPIKE_HOOK}`, hookAssignedAt + 1);
    const markerAssignedAt = pageWorld.events.indexOf(`set:${FIREFOX_YOUTUBE_SPIKE_INSTALL_STATUS}`, hookReadAt + 1);
    expect(hookAssignedAt).toBeGreaterThanOrEqual(0);
    expect(hookReadAt).toBeGreaterThan(hookAssignedAt);
    expect(markerAssignedAt).toBeGreaterThan(hookReadAt);

    expect(pageWorld.cloneIntoApi).toHaveBeenCalledTimes(1);
    expect(pageWorld.cloneIntoApi).toHaveBeenCalledWith(
      expect.objectContaining({
        start: expect.any(Function),
        status: expect.any(Function),
        restart: expect.any(Function),
        stop: expect.any(Function),
      }),
      target,
      { cloneFunctions: true },
    );
    expect(pageWorld.cloneIntoApi.mock.results[0].value).toBe(hook);
  });

  it('uses the Xray Promise and returns only cloned scalar DTOs without page arguments', async () => {
    const pageWorld = createPageWorld();
    const target = pageWorld.xrayWindow;
    const privateStatus = {
      success: true,
      state: 'ACTIVE',
      reason: null,
      mediaType: 'video',
      captureMethod: 'captureStream',
      trackCount: 1,
      audioTracks: [{ readyState: 'live', muted: false }],
      rms: 0.25,
      peak: 0.5,
      stream: { secret: 'stream-object' },
      media: { title: 'private-title' },
      samples: [1, 2, 3],
    };
    const probe = {
      start: vi.fn(async () => privateStatus),
      status: vi.fn(() => privateStatus),
      restart: vi.fn(async () => privateStatus),
      stop: vi.fn(async () => ({ ...privateStatus, state: 'STOPPED' })),
    };
    const hook = installFirefoxYouTubeCaptureStreamSpikeHook({
      target,
      probe,
      isDevelopment: true,
    });

    const status = hook.status({ stream: 'page-input' });
    expect(status).toEqual({
      success: true,
      state: 'ACTIVE',
      reason: null,
      mediaType: 'video',
      captureMethod: 'captureStream',
      trackCount: 1,
      audioTracks: [{ readyState: 'live', muted: false }],
      rms: 0.25,
      peak: 0.5,
      transport: {
        success: false,
        state: 'IDLE',
        sourceAvailable: false,
        cloneState: 'none',
        attempts: [],
      },
      iframeTransfer: {
        state: 'IDLE',
        supported: null,
        accepted: null,
        receiverType: null,
        receiverKind: null,
        receiverReadyState: null,
        receiverMuted: null,
        receiverAnalyserActivity: 'untested',
        receiverAnalyserPeak: null,
        senderCloneOwnership: 'untested',
        senderCloneReadyState: null,
        senderCloneMuted: null,
        senderCloneEnded: null,
        errorCategory: null,
      },
      runtimeCapabilities: {
        audioGraph: { state: 'untested', supported: false, connected: null },
        webSocket: { result: 'untested', supported: null, constructed: null, closed: null, network: null },
        rtcPeerConnection: { result: 'untested', supported: null, constructed: null, closed: null, network: null },
        fetch: { result: 'untested', supported: null, constructed: null, closed: null, network: null },
      },
    });
    expect(status).not.toHaveProperty('stream');
    expect(status).not.toHaveProperty('media');
    expect(status).not.toHaveProperty('samples');
    expect(probe.status).toHaveBeenCalledWith();

    const startResult = hook.start({ stream: 'page-input' });
    expect(startResult).toBeInstanceOf(pageWorld.XrayPromise);
    await expect(startResult).resolves.toEqual(status);
    expect(probe.start).toHaveBeenCalledWith();
    expect(pageWorld.cloneIntoApi.mock.calls[0][2]).toEqual({ cloneFunctions: true });
    expect(pageWorld.cloneIntoApi.mock.calls.slice(1).every(([, scope]) => scope === target)).toBe(true);

    await expect(hook.restart()).resolves.toEqual(status);
    await expect(hook.stop()).resolves.toMatchObject({ state: 'STOPPED' });
    expect(probe.restart).toHaveBeenCalledWith();
    expect(probe.stop).toHaveBeenCalledWith();
  });

  it('resolves rejected async probe calls to a closed scalar DTO', async () => {
    const pageWorld = createPageWorld();
    const target = pageWorld.xrayWindow;
    const probe = {
      start: vi.fn(async () => { throw new Error('raw private failure'); }),
      status: vi.fn(() => ({ state: 'STOPPED' })),
      restart: vi.fn(async () => ({ state: 'STOPPED' })),
      stop: vi.fn(async () => ({ state: 'STOPPED' })),
    };
    const hook = installFirefoxYouTubeCaptureStreamSpikeHook({ target, probe, isDevelopment: true });

    const result = hook.start();
    expect(result).toBeInstanceOf(pageWorld.XrayPromise);
    await expect(result).resolves.toEqual(expect.objectContaining({
      success: false,
      state: 'CAPTURE_ERROR',
      reason: 'BRIDGE_ERROR',
    }));
    await result.then(value => {
      expect(value).not.toHaveProperty('stream');
      expect(value).not.toHaveProperty('media');
      expect(value).not.toHaveProperty('samples');
      expect(JSON.stringify(value)).not.toContain('raw private failure');
    });
  });

  it('keeps private state unreachable through returned DTOs and page arguments', () => {
    const pageWorld = createPageWorld();
    const target = pageWorld.xrayWindow;
    const privateState = { state: 'ACTIVE', rms: 0.5, peak: 0.75 };
    const probe = {
      start: vi.fn(async () => privateState),
      status: vi.fn(() => privateState),
      restart: vi.fn(async () => privateState),
      stop: vi.fn(async () => ({ state: 'STOPPED' })),
    };
    const hook = installFirefoxYouTubeCaptureStreamSpikeHook({
      target,
      probe,
      isDevelopment: true,
    });

    const escaped = hook.status();
    escaped.state = 'MUTATED';
    escaped.rms = 0;
    hook.start({ mutate: privateState });

    expect(privateState).toEqual({ state: 'ACTIVE', rms: 0.5, peak: 0.75 });
    expect(probe.start).toHaveBeenCalledWith();
    expect(hook.status()).toMatchObject({ state: 'ACTIVE', rms: 0.5, peak: 0.75 });
  });

  it('does not expose a page hook for production or missing bridge APIs', () => {
    const productionWorld = createPageWorld();
    const productionHook = installFirefoxYouTubeCaptureStreamSpikeHook({
      target: productionWorld.xrayWindow,
      isDevelopment: false,
    });
    expect(productionHook).toBeUndefined();
    expect(productionWorld.pageWindow[FIREFOX_YOUTUBE_SPIKE_HOOK]).toBeUndefined();
    expect(productionWorld.pageWindow[FIREFOX_YOUTUBE_SPIKE_INSTALL_STATUS]).toBeUndefined();

    const unavailableWorld = createPageWorld();
    const unavailableTarget = { ...unavailableWorld.xrayWindow, cloneInto: undefined };
    const unavailableHook = installFirefoxYouTubeCaptureStreamSpikeHook({
      target: unavailableTarget,
      isDevelopment: true,
    });
    expect(unavailableHook).toBeUndefined();
    expect(unavailableWorld.pageWindow[FIREFOX_YOUTUBE_SPIKE_HOOK]).toBeUndefined();
    expect(unavailableWorld.pageWindow[FIREFOX_YOUTUBE_SPIKE_INSTALL_STATUS])
      .toBe(FIREFOX_YOUTUBE_SPIKE_INSTALL_STATES.BRIDGE_UNAVAILABLE);
  });

  it('does not expose a page hook outside YouTube', () => {
    const pageWorld = createPageWorld();
    const target = { ...pageWorld.xrayWindow, location: { hostname: 'example.com' } };
    const hook = installFirefoxYouTubeCaptureStreamSpikeHook({
      target,
      isDevelopment: true,
    });

    expect(hook).toBeUndefined();
    expect(pageWorld.pageWindow[FIREFOX_YOUTUBE_SPIKE_HOOK]).toBeUndefined();
    expect(pageWorld.pageWindow[FIREFOX_YOUTUBE_SPIKE_INSTALL_STATUS]).toBeUndefined();
  });

  it('publishes only a closed clone-failed marker when cloning fails', () => {
    const pageWorld = createPageWorld();
    const target = pageWorld.xrayWindow;
    const cloneIntoApi = vi.fn(() => { throw new Error('private bridge failure'); });

    expect(installFirefoxYouTubeCaptureStreamSpikeHook({
      target,
      isDevelopment: true,
      cloneIntoApi,
    })).toBeUndefined();
    expect(target.wrappedJSObject[FIREFOX_YOUTUBE_SPIKE_HOOK]).toBeUndefined();
    expect(target.wrappedJSObject[FIREFOX_YOUTUBE_SPIKE_INSTALL_STATUS])
      .toBe(FIREFOX_YOUTUBE_SPIKE_INSTALL_STATES.CLONE_FAILED);
    expect(JSON.stringify(target.wrappedJSObject[FIREFOX_YOUTUBE_SPIKE_INSTALL_STATUS]))
      .not.toContain('private bridge failure');
  });

  it('publishes a separate closed publish-failed marker when wrapped assignment fails', () => {
    const pageWorld = createPageWorld({ failPublish: true });
    const target = pageWorld.xrayWindow;

    expect(installFirefoxYouTubeCaptureStreamSpikeHook({
      target,
      isDevelopment: true,
    })).toBeUndefined();
    expect(target.wrappedJSObject[FIREFOX_YOUTUBE_SPIKE_HOOK]).toBeUndefined();
    expect(target.wrappedJSObject[FIREFOX_YOUTUBE_SPIKE_INSTALL_STATUS])
      .toBe(FIREFOX_YOUTUBE_SPIKE_INSTALL_STATES.PUBLISH_FAILED);
  });

  it('is idempotent and does not replace the page hook', () => {
    const pageWorld = createPageWorld();
    const target = pageWorld.xrayWindow;
    const firstProbe = {
      start: vi.fn(), status: vi.fn(), restart: vi.fn(), stop: vi.fn(),
    };
    const first = installFirefoxYouTubeCaptureStreamSpikeHook({
      target,
      probe: firstProbe,
      isDevelopment: true,
    });
    const secondProbe = {
      start: vi.fn(), status: vi.fn(), restart: vi.fn(), stop: vi.fn(),
    };
    const second = installFirefoxYouTubeCaptureStreamSpikeHook({
      target,
      probe: secondProbe,
      isDevelopment: true,
    });

    expect(second).toBe(first);
    expect(pageWorld.cloneIntoApi).toHaveBeenCalledTimes(1);
    expect(secondProbe.start).not.toHaveBeenCalled();
  });
});
