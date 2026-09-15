import { describe, expect, it, vi } from 'vitest';
import { FirefoxDevSpikeProbe } from './spikeDevProbe.js';

describe('Firefox DEV Phase 2 probe composition', () => {
  it('runs transport and runtime checks only after explicit local capture start', async () => {
    const captureProbe = {
      captureStream: { private: 'stream' },
      audioTracks: [{ kind: 'audio' }],
      start: vi.fn(async () => ({ state: 'ACTIVE' })),
      status: vi.fn(() => ({ state: 'ACTIVE' })),
      stop: vi.fn(async () => ({ state: 'STOPPED' })),
    };
    const transportProbe = {
      start: vi.fn(async () => ({ state: 'COMPLETE', attempts: [] })),
      status: vi.fn(() => ({ state: 'COMPLETE', attempts: [] })),
      stop: vi.fn(async () => ({})),
    };
    const runtimeCapabilitiesProbe = {
      start: vi.fn(() => ({})),
      status: vi.fn(() => ({})),
      stop: vi.fn(() => ({})),
    };
    const iframeTransferProbe = {
      start: vi.fn(async () => ({ state: 'UNSUPPORTED' })),
      status: vi.fn(() => ({ state: 'UNSUPPORTED' })),
      stop: vi.fn(async () => ({})),
    };
    const probe = new FirefoxDevSpikeProbe({
      captureProbe,
      transportProbe,
      iframeTransferProbe,
      runtimeCapabilitiesProbe,
    });

    expect(transportProbe.start).not.toHaveBeenCalled();
    expect(runtimeCapabilitiesProbe.start).not.toHaveBeenCalled();

    const result = await probe.start();

    expect(captureProbe.start).toHaveBeenCalledOnce();
    expect(transportProbe.start).toHaveBeenCalledWith({ captureProbe });
    expect(iframeTransferProbe.start).toHaveBeenCalledWith({
      captureProbe,
      transportStatus: { state: 'COMPLETE', attempts: [] },
    });
    expect(runtimeCapabilitiesProbe.start).toHaveBeenCalledWith({ captureProbe });
    expect(result).toMatchObject({ state: 'ACTIVE', transport: { state: 'COMPLETE' } });
    expect(JSON.stringify(result)).not.toContain('private');

    await probe.stop();
    expect(iframeTransferProbe.stop).toHaveBeenCalledOnce();
    expect(transportProbe.stop).toHaveBeenCalledOnce();
    expect(captureProbe.stop).toHaveBeenCalledOnce();
    expect(runtimeCapabilitiesProbe.stop).toHaveBeenCalledOnce();
  });
});
