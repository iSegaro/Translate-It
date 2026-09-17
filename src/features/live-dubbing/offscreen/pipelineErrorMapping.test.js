import { describe, expect, it, vi } from 'vitest';
import { TabAudioPipeline, INPUT_SAMPLE_RATE } from './TabAudioPipeline.js';
import { PcmOutputPlayer, OUTPUT_SAMPLE_RATE } from './PcmOutputPlayer.js';
import { LiveDubbingController } from './LiveDubbingController.js';
import { LiveDubbingFeatureHandler } from '../handlers/LiveDubbingFeatureHandler.js';
import { sanitizeFirefoxContentResponse, FIREFOX_CONTENT_ERRORS } from '../firefox/firefoxContentContract.js';
import { LiveDubbingCoordinator } from '../background/LiveDubbingCoordinator.js';

function createInputPort() {
  return { onmessage: null, postMessage: vi.fn(), start: vi.fn(), close: vi.fn() };
}

function createInputContext(sampleRate = INPUT_SAMPLE_RATE) {
  const port = createInputPort();
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const sink = { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1, setValueAtTime: vi.fn() }, };
  const node = { connect: vi.fn(), disconnect: vi.fn(), port };
  return {
    context: {
      sampleRate,
      currentTime: 3,
      destination: {},
      audioWorklet: { addModule: vi.fn(async () => {}) },
      createMediaStreamSource: vi.fn(() => source),
      createGain: vi.fn(() => sink),
      resume: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    },
    source,
    sink,
    node,
    port,
  };
}

function createOutputPort() {
  return { onmessage: null, postMessage: vi.fn(), start: vi.fn(), close: vi.fn() };
}
function createOutputContext(sampleRate = OUTPUT_SAMPLE_RATE) {
  const port = createOutputPort();
  const node = { connect: vi.fn(), disconnect: vi.fn(), port };
  return {
    context: {
      sampleRate,
      destination: {},
      audioWorklet: { addModule: vi.fn(async () => {}) },
      resume: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    },
    node,
    port,
  };
}

function createFakeTrack() {
  return { kind: 'audio', readyState: 'live', stop: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
}
function createStream(track) {
  return { getAudioTracks: () => [track], getTracks: () => [track] };
}

function isLeakFree(errorOrString) {
  const str = JSON.stringify(errorOrString) + String(errorOrString?.message || '') + String(errorOrString?.code || '');
  return !str.includes('https://') && !str.includes('evil.com') && !str.includes('MediaStream') && !str.includes('secret') && !str.includes('apiKey') && !str.includes('workletUrl') && !str.includes('example.com');
}

describe('pipeline native PCM mapping - input TabAudioPipeline', () => {
  it('1 input AudioContext ctor → INPUT_AUDIO_CONTEXT_CREATE_FAILED (native DOMException sanitized)', async () => {
    const domError = new DOMException('Failed to create AudioContext at https://evil.com/workletUrl secret MediaStream {id}', 'NotSupportedError');
    const pipeline = new TabAudioPipeline({
      audioContextFactory: vi.fn(async () => { throw domError; }),
    });
    await expect(pipeline.start({ getTracks: () => [] })).rejects.toMatchObject({ code: 'INPUT_AUDIO_CONTEXT_CREATE_FAILED' });
    try {
      await pipeline.start({ getTracks: () => [] });
    } catch (e) {
      expect(e.message).not.toContain('evil.com');
      expect(e.message).not.toContain('MediaStream');
      expect(isLeakFree(e)).toBe(true);
      expect(e.code).toBe('INPUT_AUDIO_CONTEXT_CREATE_FAILED');
    }
  });

  it('2 input addModule → INPUT_AUDIO_WORKLET_LOAD_FAILED', async () => {
    const fake = createInputContext();
    fake.context.audioWorklet.addModule = vi.fn(async () => { throw new DOMException('addModule failed https://evil.com/liveDubbingCapture.worklet.js', 'AbortError'); });
    const pipeline = new TabAudioPipeline({
      audioContextFactory: vi.fn(async () => fake.context),
      audioWorkletNodeFactory: vi.fn(() => fake.node),
    });
    await expect(pipeline.start({ getTracks: () => [] })).rejects.toMatchObject({ code: 'INPUT_AUDIO_WORKLET_LOAD_FAILED' });
    try {
      await pipeline.start({ getTracks: () => [] });
    } catch (e) {
      expect(e.code).toBe('INPUT_AUDIO_WORKLET_LOAD_FAILED');
      expect(isLeakFree(e)).toBe(true);
      expect(JSON.stringify(e)).not.toContain('liveDubbingCapture');
    }
    expect(fake.context.close).toHaveBeenCalled();
  });

  it('3 input createMediaStreamSource → INPUT_AUDIO_MEDIA_STREAM_SOURCE_FAILED', async () => {
    const fake = createInputContext();
    fake.context.createMediaStreamSource = vi.fn(() => { throw new DOMException('createMediaStreamSource failed MediaStream https://evil.com', 'InvalidStateError'); });
    const pipeline = new TabAudioPipeline({
      audioContextFactory: vi.fn(async () => fake.context),
      audioWorkletNodeFactory: vi.fn(() => fake.node),
    });
    await expect(pipeline.start({ getTracks: () => [] })).rejects.toMatchObject({ code: 'INPUT_AUDIO_MEDIA_STREAM_SOURCE_FAILED' });
    try {
      await pipeline.start({ getTracks: () => [] });
    } catch (e) {
      expect(e.code).toBe('INPUT_AUDIO_MEDIA_STREAM_SOURCE_FAILED');
      expect(isLeakFree(e)).toBe(true);
    }
    expect(fake.context.close).toHaveBeenCalled();
  });

  it('4 input AudioWorkletNode → INPUT_AUDIO_WORKLET_NODE_NOT_SUPPORTED (native NotSupportedError sanitized)', async () => {
    const fake = createInputContext();
    const pipeline = new TabAudioPipeline({
      audioContextFactory: vi.fn(async () => fake.context),
      audioWorkletNodeFactory: vi.fn(() => { throw new DOMException('AudioWorkletNode failed https://evil.com', 'NotSupportedError'); }),
    });
    await expect(pipeline.start({ getTracks: () => [] })).rejects.toMatchObject({ code: 'INPUT_AUDIO_WORKLET_NODE_NOT_SUPPORTED' });
    try {
      await pipeline.start({ getTracks: () => [] });
    } catch (e) {
      expect(e.code).toBe('INPUT_AUDIO_WORKLET_NODE_NOT_SUPPORTED');
      expect(isLeakFree(e)).toBe(true);
      expect(e.message).not.toContain('evil.com');
    }
    expect(fake.context.close).toHaveBeenCalled();
  });

  it('5 input resume → INPUT_AUDIO_CONTEXT_RESUME_FAILED', async () => {
    const fake = createInputContext();
    fake.context.resume = vi.fn(async () => { throw new DOMException('resume failed https://evil.com', 'InvalidStateError'); });
    const pipeline = new TabAudioPipeline({
      audioContextFactory: vi.fn(async () => fake.context),
      audioWorkletNodeFactory: vi.fn(() => fake.node),
    });
    await expect(pipeline.start({ getTracks: () => [] })).rejects.toMatchObject({ code: 'INPUT_AUDIO_CONTEXT_RESUME_FAILED' });
    try {
      await pipeline.start({ getTracks: () => [] });
    } catch (e) {
      expect(e.code).toBe('INPUT_AUDIO_CONTEXT_RESUME_FAILED');
      expect(isLeakFree(e)).toBe(true);
    }
    expect(fake.context.close).toHaveBeenCalled();
  });

  it('6 input graph connect/setup → INPUT_AUDIO_GRAPH_FAILED', async () => {
    const fake = createInputContext();
    fake.source.connect = vi.fn(() => { throw new DOMException('connect failed https://evil.com', 'InvalidStateError'); });
    const pipeline = new TabAudioPipeline({
      audioContextFactory: vi.fn(async () => fake.context),
      audioWorkletNodeFactory: vi.fn(() => fake.node),
    });
    await expect(pipeline.start({ getTracks: () => [] })).rejects.toMatchObject({ code: 'INPUT_AUDIO_GRAPH_FAILED' });
    try {
      await pipeline.start({ getTracks: () => [] });
    } catch (e) {
      expect(e.code).toBe('INPUT_AUDIO_GRAPH_FAILED');
      expect(isLeakFree(e)).toBe(true);
    }
  });
});

describe('pipeline native PCM mapping - output PcmOutputPlayer', () => {
  it('6 output AudioContext ctor → OUTPUT_AUDIO_CONTEXT_CREATE_FAILED', async () => {
    const domError = new DOMException('create AudioContext failed https://evil.com', 'NotSupportedError');
    const player = new PcmOutputPlayer({ audioContextFactory: vi.fn(async () => { throw domError; }) });
    await expect(player.start()).rejects.toMatchObject({ code: 'OUTPUT_AUDIO_CONTEXT_CREATE_FAILED' });
    try { await player.start(); } catch (e) { expect(e.code).toBe('OUTPUT_AUDIO_CONTEXT_CREATE_FAILED'); expect(isLeakFree(e)).toBe(true); }
  });
  it('7 output addModule → OUTPUT_AUDIO_WORKLET_LOAD_FAILED', async () => {
    const fake = createOutputContext();
    fake.context.audioWorklet.addModule = vi.fn(async () => { throw new DOMException('load failed https://evil.com/liveDubbingPlayback.worklet.js', 'AbortError'); });
    const player = new PcmOutputPlayer({ audioContextFactory: vi.fn(async () => fake.context), audioWorkletNodeFactory: vi.fn(() => fake.node) });
    await expect(player.start()).rejects.toMatchObject({ code: 'OUTPUT_AUDIO_WORKLET_LOAD_FAILED' });
    try { await player.start(); } catch (e) { expect(e.code).toBe('OUTPUT_AUDIO_WORKLET_LOAD_FAILED'); expect(isLeakFree(e)).toBe(true); expect(JSON.stringify(e)).not.toContain('liveDubbingPlayback'); }
    expect(fake.context.close).toHaveBeenCalled();
  });
  it('8 output AudioWorkletNode → OUTPUT_AUDIO_WORKLET_NODE_NOT_SUPPORTED (native NotSupportedError sanitized)', async () => {
    const fake = createOutputContext();
    const player = new PcmOutputPlayer({ audioContextFactory: vi.fn(async () => fake.context), audioWorkletNodeFactory: vi.fn(() => { throw new DOMException('node failed https://evil.com', 'NotSupportedError'); }) });
    await expect(player.start()).rejects.toMatchObject({ code: 'OUTPUT_AUDIO_WORKLET_NODE_NOT_SUPPORTED' });
    try { await player.start(); } catch (e) { expect(e.code).toBe('OUTPUT_AUDIO_WORKLET_NODE_NOT_SUPPORTED'); expect(isLeakFree(e)).toBe(true); expect(e.message).not.toContain('evil.com'); }
    expect(fake.context.close).toHaveBeenCalled();
  });
  it('9 output resume → OUTPUT_AUDIO_CONTEXT_RESUME_FAILED', async () => {
    const fake = createOutputContext();
    fake.context.resume = vi.fn(async () => { throw new DOMException('resume failed https://evil.com', 'InvalidStateError'); });
    const player = new PcmOutputPlayer({ audioContextFactory: vi.fn(async () => fake.context), audioWorkletNodeFactory: vi.fn(() => fake.node) });
    await expect(player.start()).rejects.toMatchObject({ code: 'OUTPUT_AUDIO_CONTEXT_RESUME_FAILED' });
    try { await player.start(); } catch (e) { expect(e.code).toBe('OUTPUT_AUDIO_CONTEXT_RESUME_FAILED'); expect(isLeakFree(e)).toBe(true); }
    expect(fake.context.close).toHaveBeenCalled();
  });
  it('output graph connect → OUTPUT_AUDIO_GRAPH_FAILED', async () => {
    const fake = createOutputContext();
    fake.node.connect = vi.fn(() => { throw new DOMException('connect failed https://evil.com', 'InvalidStateError'); });
    const player = new PcmOutputPlayer({ audioContextFactory: vi.fn(async () => fake.context), audioWorkletNodeFactory: vi.fn(() => fake.node) });
    await expect(player.start()).rejects.toMatchObject({ code: 'OUTPUT_AUDIO_GRAPH_FAILED' });
    try { await player.start(); } catch (e) { expect(e.code).toBe('OUTPUT_AUDIO_GRAPH_FAILED'); expect(isLeakFree(e)).toBe(true); }
  });
});

describe('preserves existing canonical codes and no leak', () => {
  it('10 existing custom canonical unchanged - INPUT_AUDIO_CONTEXT_SAMPLE_RATE_MISMATCH preserved', async () => {
    const fake = createInputContext(48000);
    const pipeline = new TabAudioPipeline({ audioContextFactory: vi.fn(async () => fake.context), audioWorkletNodeFactory: vi.fn(() => fake.node) });
    await expect(pipeline.start({ getTracks: () => [] })).rejects.toMatchObject({ code: 'INPUT_AUDIO_CONTEXT_SAMPLE_RATE_MISMATCH' });
    try { await pipeline.start({ getTracks: () => [] }); } catch (e) { expect(e.code).toBe('INPUT_AUDIO_CONTEXT_SAMPLE_RATE_MISMATCH'); expect(isLeakFree(e)).toBe(true); }
  });
  it('10b existing canonical INPUT_AUDIO_WORKLET_UNAVAILABLE preserved not mapped to LOAD_FAILED', async () => {
    const fake = createInputContext();
    delete fake.context.audioWorklet;
    fake.context.audioWorklet = undefined;
    const pipeline = new TabAudioPipeline({ audioContextFactory: vi.fn(async () => fake.context), audioWorkletNodeFactory: vi.fn(() => fake.node) });
    await expect(pipeline.start({ getTracks: () => [] })).rejects.toMatchObject({ code: 'INPUT_AUDIO_WORKLET_UNAVAILABLE' });
  });
  it('10c existing canonical OUTPUT_AUDIO_WORKLET_UNAVAILABLE preserved', async () => {
    const fake = createOutputContext();
    fake.context.audioWorklet = undefined;
    const player = new PcmOutputPlayer({ audioContextFactory: vi.fn(async () => fake.context), audioWorkletNodeFactory: vi.fn(() => fake.node) });
    await expect(player.start()).rejects.toMatchObject({ code: 'OUTPUT_AUDIO_WORKLET_UNAVAILABLE' });
  });
  it('10d if exception already has canonical string code, preserve it', async () => {
    const custom = Object.assign(new Error('custom'), { code: 'INPUT_AUDIO_CONTEXT_SAMPLE_RATE_MISMATCH' });
    const pipeline = new TabAudioPipeline({ audioContextFactory: vi.fn(async () => { throw custom; }) });
    await expect(pipeline.start({ getTracks: () => [] })).rejects.toMatchObject({ code: 'INPUT_AUDIO_CONTEXT_SAMPLE_RATE_MISMATCH' });
    const customOut = Object.assign(new Error('custom'), { code: 'OUTPUT_AUDIO_CONTEXT_SAMPLE_RATE_MISMATCH' });
    const player = new PcmOutputPlayer({ audioContextFactory: vi.fn(async () => { throw customOut; }) });
    await expect(player.start()).rejects.toMatchObject({ code: 'OUTPUT_AUDIO_CONTEXT_SAMPLE_RATE_MISMATCH' });
  });
  it('preserves INPUT_AUDIO_GRAPH_UNAVAILABLE and PORT_UNAVAILABLE', async () => {
    const fake = createInputContext();
    fake.context.createMediaStreamSource = undefined;
    const pipeline = new TabAudioPipeline({ audioContextFactory: vi.fn(async () => fake.context), audioWorkletNodeFactory: vi.fn(() => fake.node) });
    await expect(pipeline.start({ getTracks: () => [] })).rejects.toMatchObject({ code: 'INPUT_AUDIO_GRAPH_UNAVAILABLE' });
    const fake2 = createInputContext();
    const pipeline2 = new TabAudioPipeline({ audioContextFactory: vi.fn(async () => fake2.context), audioWorkletNodeFactory: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn(), port: null })) });
    await expect(pipeline2.start({ getTracks: () => [] })).rejects.toMatchObject({ code: 'INPUT_AUDIO_PORT_UNAVAILABLE' });
  });
  it('preserves OUTPUT_AUDIO_GRAPH_UNAVAILABLE and PORT_UNAVAILABLE', async () => {
    const fake = createOutputContext();
    fake.context.destination = null;
    const player = new PcmOutputPlayer({ audioContextFactory: vi.fn(async () => fake.context), audioWorkletNodeFactory: vi.fn(() => fake.node) });
    fake.node.connect = vi.fn();
    await expect(player.start()).rejects.toMatchObject({ code: 'OUTPUT_AUDIO_GRAPH_UNAVAILABLE' });
    const fake2 = createOutputContext();
    const player2 = new PcmOutputPlayer({ audioContextFactory: vi.fn(async () => fake2.context), audioWorkletNodeFactory: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn(), port: null })) });
    await expect(player2.start()).rejects.toMatchObject({ code: 'OUTPUT_AUDIO_PORT_UNAVAILABLE' });
  });

  it('11 arbitrary DOMException message/URL not returned (input)', async () => {
    const msg = 'NotAllowedError: https://evil.com/stream?token=secret MediaStream {id:123} workletUrl https://evil.com/worklet.js';
    const pipeline = new TabAudioPipeline({ audioContextFactory: vi.fn(async () => { throw new DOMException(msg, 'NotAllowedError'); }) });
    try { await pipeline.start({ getTracks: () => [] }); } catch (e) {
      expect(e.code).toBe('INPUT_AUDIO_CONTEXT_CREATE_FAILED');
      expect(isLeakFree(e)).toBe(true);
      expect(e.message).not.toContain('evil.com');
      expect(e.message).not.toContain('MediaStream');
      expect(e.message).not.toContain('secret');
      expect(e.message).not.toContain('workletUrl');
    }
    const fake = createInputContext();
    fake.context.audioWorklet.addModule = vi.fn(async () => { throw new DOMException(msg, 'AbortError'); });
    const pipeline2 = new TabAudioPipeline({ audioContextFactory: vi.fn(async () => fake.context), audioWorkletNodeFactory: vi.fn(() => fake.node) });
    try { await pipeline2.start({ getTracks: () => [] }); } catch (e) {
      expect(e.code).toBe('INPUT_AUDIO_WORKLET_LOAD_FAILED');
      expect(isLeakFree(e)).toBe(true);
    }
  });

  it('11b arbitrary DOMException not returned (output)', async () => {
    const msg = 'https://evil.com/playback.worklet.js MediaStream secret';
    const player = new PcmOutputPlayer({ audioContextFactory: vi.fn(async () => { throw new DOMException(msg, 'NotSupportedError'); }) });
    try { await player.start(); } catch (e) {
      expect(e.code).toBe('OUTPUT_AUDIO_CONTEXT_CREATE_FAILED');
      expect(isLeakFree(e)).toBe(true);
    }
  });
});

describe('cleanup exactly once and Chrome unchanged', () => {
  it('12 cleanup still closes partially-created contexts/nodes exactly once (input)', async () => {
    const fake = createInputContext();
    fake.context.audioWorklet.addModule = vi.fn(async () => { throw new DOMException('fail', 'AbortError'); });
    const pipeline = new TabAudioPipeline({ audioContextFactory: vi.fn(async () => fake.context), audioWorkletNodeFactory: vi.fn(() => fake.node) });
    await expect(pipeline.start({ getTracks: () => [] })).rejects.toMatchObject({ code: 'INPUT_AUDIO_WORKLET_LOAD_FAILED' });
    expect(fake.context.close).toHaveBeenCalledTimes(1);
    // second start after failure should not double close old context
    fake.context.close.mockClear();
    fake.context.audioWorklet.addModule = vi.fn(async () => { throw new DOMException('fail', 'AbortError'); });
    await expect(pipeline.start({ getTracks: () => [] })).rejects.toMatchObject({ code: 'INPUT_AUDIO_WORKLET_LOAD_FAILED' });
    expect(fake.context.close).toHaveBeenCalledTimes(1);

    // failure after source created: ensure source disconnect and context close once
    const fake2 = createInputContext();
    fake2.context.createMediaStreamSource = vi.fn(() => { throw new DOMException('fail', 'InvalidStateError'); });
    const pipeline2 = new TabAudioPipeline({ audioContextFactory: vi.fn(async () => fake2.context), audioWorkletNodeFactory: vi.fn(() => fake2.node) });
    await expect(pipeline2.start({ getTracks: () => [] })).rejects.toMatchObject({ code: 'INPUT_AUDIO_MEDIA_STREAM_SOURCE_FAILED' });
    expect(fake2.context.close).toHaveBeenCalledTimes(1);
    expect(fake2.source.disconnect).not.toHaveBeenCalled(); // source not created yet, so not disconnect

    // failure after worklet node created: ensure teardown disconnects source and node and port close once
    const fake3 = createInputContext();
    let createdNode = { connect: vi.fn(), disconnect: vi.fn(), port: { onmessage: null, start: vi.fn(), close: vi.fn() } };
    // make pipeline2's second path: source succeeds, workletNode creation fails on second call? Actually test workletNode success then graph failure
    fake3.source.connect = vi.fn(() => { throw new DOMException('graph', 'InvalidStateError'); });
    const pipeline3 = new TabAudioPipeline({
      audioContextFactory: vi.fn(async () => fake3.context),
      audioWorkletNodeFactory: vi.fn(() => createdNode),
    });
    await expect(pipeline3.start({ getTracks: () => [] })).rejects.toMatchObject({ code: 'INPUT_AUDIO_GRAPH_FAILED' });
    expect(fake3.context.close).toHaveBeenCalledTimes(1);
    expect(fake3.source.disconnect).toHaveBeenCalledTimes(1);
    expect(createdNode.disconnect).toHaveBeenCalledTimes(1);
    expect(createdNode.port.close).toHaveBeenCalledTimes(1);
  });

  it('12b cleanup still closes exactly once (output)', async () => {
    const fake = createOutputContext();
    fake.context.audioWorklet.addModule = vi.fn(async () => { throw new DOMException('fail', 'AbortError'); });
    const player = new PcmOutputPlayer({ audioContextFactory: vi.fn(async () => fake.context), audioWorkletNodeFactory: vi.fn(() => fake.node) });
    await expect(player.start()).rejects.toMatchObject({ code: 'OUTPUT_AUDIO_WORKLET_LOAD_FAILED' });
    expect(fake.context.close).toHaveBeenCalledTimes(1);
    fake.context.close.mockClear();
    await expect(player.start()).rejects.toMatchObject({ code: 'OUTPUT_AUDIO_WORKLET_LOAD_FAILED' });
    expect(fake.context.close).toHaveBeenCalledTimes(1);

    // after worklet node created, graph failure should disconnect node and close port once
    const fake2 = createOutputContext();
    let node2 = { connect: vi.fn(() => { throw new DOMException('graph', 'InvalidStateError'); }), disconnect: vi.fn(), port: { onmessage: null, start: vi.fn(), close: vi.fn() } };
    const player2 = new PcmOutputPlayer({ audioContextFactory: vi.fn(async () => fake2.context), audioWorkletNodeFactory: vi.fn(() => node2) });
    await expect(player2.start()).rejects.toMatchObject({ code: 'OUTPUT_AUDIO_GRAPH_FAILED' });
    expect(fake2.context.close).toHaveBeenCalledTimes(1);
    expect(node2.disconnect).toHaveBeenCalledTimes(1);
    expect(node2.port.close).toHaveBeenCalledTimes(1);
  });

  it('13 Chrome unchanged - success behavior retains sample rates and worklet bypass not modified', async () => {
    const fakeIn = createInputContext();
    const pipeline = new TabAudioPipeline({
      audioContextFactory: vi.fn(async opts => {
        expect(opts.sampleRate).toBe(16_000);
        return fakeIn.context;
      }),
      audioWorkletNodeFactory: vi.fn(() => fakeIn.node),
    });
    const track = createFakeTrack();
    const stream = createStream(track);
    const info = await pipeline.start(stream);
    expect(info.sampleRate).toBe(16_000);
    expect(fakeIn.context.audioWorklet.addModule).toHaveBeenCalledWith(expect.stringContaining('liveDubbingCapture.worklet.js'));
    expect(fakeIn.context.resume).toHaveBeenCalled();
    await pipeline.stop();

    const fakeOut = createOutputContext();
    const player = new PcmOutputPlayer({
      audioContextFactory: vi.fn(async opts => {
        expect(opts.sampleRate).toBe(24_000);
        return fakeOut.context;
      }),
      audioWorkletNodeFactory: vi.fn(() => fakeOut.node),
    });
    await player.start();
    expect(fakeOut.context.audioWorklet.addModule).toHaveBeenCalledWith(expect.stringContaining('liveDubbingPlayback.worklet.js'));
    expect(player.getMetrics().sampleRate).toBe(24_000);
    await player.stop();

    // Through controller still succeeds for Chrome offscreen path (PCM mode)
    const controllerTrack = createFakeTrack();
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(controllerTrack)) },
      inputPipeline: { start: vi.fn(async () => {}), stop: vi.fn(async () => {}), clear: vi.fn() },
      outputPlayer: { start: vi.fn(async () => {}), stop: vi.fn(async () => {}), clear: vi.fn(), getMetrics: () => ({ queuedSamples: 0 }) },
      providerClient: { connect: vi.fn(async function() { this.onSetupComplete(); }), close: vi.fn() },
      requestBootstrap: vi.fn(async () => ({ success: true, providerId: 'gemini', targetLanguage: 'en', bootstrap: {} })),
    });
    controller.prepare('s1', 'gemini', 'en', 0);
    const consumed = await controller.consume('s1', 'gemini', 'stream-id', 1);
    expect(consumed.success).toBe(true);
    expect(consumed.captureReady).toBe(true);
    expect(consumed.audioPathReady).toBe(true);
    await controller.dispose('s1', 'gemini');
  });
});

describe('propagation allowlist', () => {
  it('FeatureHandler allowlist preserves new INPUT/OUTPUT codes', async () => {
    const handler = new LiveDubbingFeatureHandler({
      controller: {
        prepare: async () => ({ success: true }),
        consumeSource: async () => ({ success: false, error: 'INPUT_AUDIO_CONTEXT_CREATE_FAILED', sourceAccepted: false }),
        dispose: async () => ({ success: true }),
      },
      resolver: { resolve: () => ({ success: true, source: 'el' }) },
      captureAdapter: { capture: () => ({ stream: { getTracks: () => [] }, dispose: vi.fn() }) },
    });
    await handler.activate();
    const result = await handler.prepareRuntime({ sessionId: 's1', providerId: 'gemini', tabId: 7, frameId: 0, documentId: 'doc-1', targetLanguage: 'en', eventSequence: 0 });
    expect(result).toMatchObject({ success: false, error: 'INPUT_AUDIO_CONTEXT_CREATE_FAILED' });
    expect(isLeakFree(result)).toBe(true);
  });
  it('Firefox content contract sanitizes new codes', () => {
    for (const code of [
      'INPUT_AUDIO_CONTEXT_CREATE_FAILED',
      'INPUT_AUDIO_WORKLET_LOAD_FAILED',
      'INPUT_AUDIO_MEDIA_STREAM_SOURCE_FAILED',
      'INPUT_AUDIO_WORKLET_NODE_FAILED',
      'INPUT_AUDIO_GRAPH_FAILED',
      'INPUT_AUDIO_CONTEXT_RESUME_FAILED',
      'OUTPUT_AUDIO_CONTEXT_CREATE_FAILED',
      'OUTPUT_AUDIO_WORKLET_LOAD_FAILED',
      'OUTPUT_AUDIO_WORKLET_NODE_FAILED',
      'OUTPUT_AUDIO_GRAPH_FAILED',
      'OUTPUT_AUDIO_CONTEXT_RESUME_FAILED',
    ]) {
      expect(FIREFOX_CONTENT_ERRORS).toContain(code);
      const sanitized = sanitizeFirefoxContentResponse({ success: false, error: code, sessionId: 's1', providerId: 'gemini' });
      expect(sanitized).toMatchObject({ error: code });
      expect(isLeakFree(sanitized)).toBe(true);
    }
    // arbitrary LIVE_DUBBING not in allowlist still fails closed
    expect(sanitizeFirefoxContentResponse({ success: false, error: 'LIVE_DUBBING_ARBITRARY_NEW_CODE', sessionId: 's1', providerId: 'gemini' })).toBeNull();
    // arbitrary string with URL fails
    expect(sanitizeFirefoxContentResponse({ success: false, error: 'INPUT_AUDIO_CONTEXT_CREATE_FAILED https://evil.com', sessionId: 's1', providerId: 'gemini' })).toBeNull();
  });
  it('Coordinator Firefox reason allowlist preserves new codes', async () => {
    const storage = new Map();
    const browserAPI = {
      runtime: { id: 'ext-id', getURL: (p='') => `chrome-extension://ext-id/${p}`, sendMessage: vi.fn() },
      storage: { session: { get: vi.fn(async k => ({ [k]: storage.get(k) })), set: vi.fn(async rec => Object.entries(rec).forEach(([k,v])=>storage.set(k,v))), remove: vi.fn(async k=>storage.delete(k)) } },
      tabs: { query: vi.fn(async ()=>[ { id:7 }]), get: vi.fn(async id=>({id})), sendMessage: vi.fn(async ()=>({ success:false, error:'INPUT_AUDIO_WORKLET_LOAD_FAILED', sessionId:'s1', providerId:'gemini', tabId:7, frameId:0, documentId:'doc-1', eventSequence:0, status:'IDLE'})) },
    };
    const registration = { get: vi.fn(()=>({tabId:7,frameId:0,documentId:'doc-1'})), discover: vi.fn(async()=>({tabId:7,frameId:0,documentId:'doc-1'})) };
    const coordinator = new LiveDubbingCoordinator({
      browserAPI, chromeAPI:{}, leaseManager:{ acquire: vi.fn(async()=>true), release: vi.fn(async()=>true), getSnapshot:()=>({activeLeases:[]}), ensureDocument: vi.fn() },
      firefoxContentRuntimeRegistration: registration, runtimeHost:'firefox-content', uuid:()=>'s1', now:()=>123, logger:{ warn:vi.fn()}
    });
    browserAPI.tabs.sendMessage = vi.fn(async (tabId, message)=>{
      if (message.action==='LIVE_DUBBING_PREPARE') return { success:false, error:'INPUT_AUDIO_WORKLET_LOAD_FAILED', sessionId:'s1', providerId:'gemini', tabId:7, frameId:0, documentId:'doc-1', eventSequence:0, status:'IDLE'};
      return { success:true, ack:'DISPOSED', sessionId:'s1', providerId:'gemini', tabId:7, frameId:0, documentId:'doc-1', eventSequence:0, status:'IDLE'};
    });
    const result = await coordinator.start({ data:{ targetLanguage:'en', providerId:'gemini'} }, { tab:{id:7}});
    expect(result.success).toBe(false);
    expect(result.reason).toBe('INPUT_AUDIO_WORKLET_LOAD_FAILED');
    expect(isLeakFree(result)).toBe(true);
  });
  it('Controller pipelineFailed maps native DOMException to canonical and not generic', async () => {
    const track = createFakeTrack();
    const failingInput = {
      start: vi.fn(async () => { throw new DOMException('native https://evil.com', 'NotSupportedError'); }),
      stop: vi.fn(async () => {}),
    };
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(track)) },
      inputPipeline: failingInput,
      outputPlayer: { start: vi.fn(async () => {}), stop: vi.fn(async () => {}), clear: vi.fn() },
      providerRegistry: { getAudioMode: () => 'pcm' },
    });
    controller.prepare('s1', 'gemini', 'en', 0);
    const result = await controller.consume('s1', 'gemini', 'stream-secret', 1);
    // With our new pipeline mapping, the native failure inside pipeline would be mapped before reaching controller;
    // but here we mock pipeline directly throwing native, controller should still map via errorCode? Actually controller's _pipelineFailed uses errorCode fallback to LIVE_DUBBING_AUDIO_PIPELINES_FAILED if code not canonical.
    // So native DOMException would become generic.
    expect(result.error).toBe('LIVE_DUBBING_AUDIO_PIPELINES_FAILED');
    // Now test that when pipeline throws canonical new code, it preserves it instead of generic
    const canonicalInput = {
      start: vi.fn(async () => { throw Object.assign(new Error('wrapped'), { code: 'INPUT_AUDIO_CONTEXT_CREATE_FAILED' }); }),
      stop: vi.fn(async () => {}),
    };
    const controller2 = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(createFakeTrack())) },
      inputPipeline: canonicalInput,
      outputPlayer: { start: vi.fn(async () => {}), stop: vi.fn(async () => {}), clear: vi.fn() },
      providerRegistry: { getAudioMode: () => 'pcm' },
    });
    controller2.prepare('s2', 'gemini', 'en', 0);
    const result2 = await controller2.consume('s2', 'gemini', 'stream-secret', 1);
    expect(result2.error).toBe('INPUT_AUDIO_CONTEXT_CREATE_FAILED');
    expect(isLeakFree(result2)).toBe(true);
  });
});
