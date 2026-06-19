import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaRecorderStreamingAudioSource } from './MediaRecorderStreamingAudioSource.js';
import { STREAMING_AUDIO_FORMATS, STREAMING_AUDIO_SOURCE_STATES } from './StreamingAudioSource.js';

class MockMediaRecorder {
  static instances = [];

  static isTypeSupported(mimeType) {
    return mimeType === 'audio/webm;codecs=opus' || mimeType === 'audio/webm';
  }

  constructor(stream, options = {}) {
    this.stream = stream;
    this.options = { ...options };
    this.mimeType = options.mimeType || 'audio/webm';
    this.state = 'inactive';
    this.startCount = 0;
    this.stopCount = 0;
    this.pauseCount = 0;
    this.resumeCount = 0;
    this.ondataavailable = null;
    this.onstop = null;
    this.onerror = null;

    MockMediaRecorder.instances.push(this);
  }

  start() {
    this.startCount += 1;
    this.state = 'recording';
  }

  stop() {
    this.stopCount += 1;
    this.state = 'inactive';
    this.onstop?.();
  }

  pause() {
    this.pauseCount += 1;
    this.state = 'paused';
  }

  resume() {
    this.resumeCount += 1;
    this.state = 'recording';
  }
}

describe('MediaRecorderStreamingAudioSource', () => {
  beforeEach(() => {
    MockMediaRecorder.instances = [];
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('rotates finalized webm chunks and restarts the recorder without changing behavior', async () => {
    const emittedChunks = [];
    const emittedStates = [];
    const source = new MediaRecorderStreamingAudioSource({
      onChunk: (chunk) => emittedChunks.push(chunk),
      onStateChange: (state, details) => emittedStates.push({ state, details })
    });

    const snapshot = await source.start({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    }, {
      stream: { id: 'stream-1' },
      mimeType: 'audio/webm;codecs=opus',
      chunkTimeslice: 1000
    });

    expect(snapshot.state).toBe(STREAMING_AUDIO_SOURCE_STATES.ACTIVE);
    expect(source.recorderState).toBe('recording');
    expect(MockMediaRecorder.instances).toHaveLength(1);

    const recorderInstance = MockMediaRecorder.instances[0];
    const payload = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm;codecs=opus' });
    recorderInstance.ondataavailable?.({ data: payload });

    await vi.advanceTimersByTimeAsync(1000);
    await Promise.resolve();

    expect(emittedChunks).toHaveLength(1);
    expect(emittedChunks[0].format).toBe(STREAMING_AUDIO_FORMATS.WEBM_OPUS);
    expect(emittedChunks[0].chunkStartMs).toBe(0);
    expect(emittedChunks[0].chunkEndMs).toBe(1000);
    expect(emittedChunks[0].payload).toBeInstanceOf(Blob);
    expect(MockMediaRecorder.instances).toHaveLength(2);
    expect(MockMediaRecorder.instances[0].stopCount).toBe(1);
    expect(MockMediaRecorder.instances[1].state).toBe('recording');
    expect(emittedStates.some((entry) => entry.state === 'starting')).toBe(true);
    expect(emittedStates.some((entry) => entry.state === 'capturing')).toBe(true);
  });

  it('exposes a monotonic source clock snapshot across pause/resume and lineage reset', async () => {
    const source = new MediaRecorderStreamingAudioSource();

    await source.start({
      sessionId: 'session-snapshot',
      tabId: 13,
      videoFingerprint: 'video-snapshot'
    }, {
      stream: { id: 'stream-snapshot' },
      mimeType: 'audio/webm',
      chunkTimeslice: 1000
    });

    const snapshot1 = source.getSourceClockSnapshot();
    expect(snapshot1).toMatchObject({
      sourceMs: 0,
      sourceClockId: expect.any(String),
      sourceResetId: 1,
      sourceTimelineType: 'capture',
      sourceSequence: 0,
      captureState: 'capturing'
    });

    const recorderInstance = MockMediaRecorder.instances[0];
    recorderInstance.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' }) });

    await vi.advanceTimersByTimeAsync(1000);
    await Promise.resolve();

    const snapshot2 = source.getSourceClockSnapshot();
    expect(snapshot2.sourceMs).toBeGreaterThanOrEqual(snapshot1.sourceMs);
    expect(snapshot2.sourceSequence).toBeGreaterThan(snapshot1.sourceSequence);
    expect(snapshot2.sourceResetId).toBe(snapshot1.sourceResetId);

    await source.pause();
    const pausedSnapshot = source.getSourceClockSnapshot();
    expect(pausedSnapshot.sourceResetId).toBe(snapshot2.sourceResetId);

    await source.resume();
    const resumedSnapshot = source.getSourceClockSnapshot();
    expect(resumedSnapshot.sourceResetId).toBe(snapshot2.sourceResetId);

    await source.stop();
    await source.start({
      sessionId: 'session-snapshot',
      tabId: 13,
      videoFingerprint: 'video-snapshot'
    }, {
      stream: { id: 'stream-snapshot' },
      mimeType: 'audio/webm',
      chunkTimeslice: 1000
    });

    const restartedSnapshot = source.getSourceClockSnapshot();
    expect(restartedSnapshot.sourceResetId).toBe(snapshot2.sourceResetId + 1);
    expect(restartedSnapshot.sourceSequence).toBe(0);
  });

  it('supports pause, resume, stop, and destroy lifecycle transitions', async () => {
    const emittedStates = [];
    const source = new MediaRecorderStreamingAudioSource({
      onStateChange: (state, details) => emittedStates.push({ state, details })
    });

    await source.start({
      sessionId: 'session-2',
      tabId: 11,
      videoFingerprint: 'video-b'
    }, {
      stream: { id: 'stream-2' },
      mimeType: 'audio/webm',
      chunkTimeslice: 1500
    });

    expect(source.getStatus().state).toBe(STREAMING_AUDIO_SOURCE_STATES.ACTIVE);

    await source.pause();
    expect(source.recorderState).toBe('paused');
    expect(source.getStatus().state).toBe(STREAMING_AUDIO_SOURCE_STATES.ACTIVE);

    await source.resume();
    expect(source.recorderState).toBe('recording');

    const recorderInstance = MockMediaRecorder.instances[0];
    recorderInstance.ondataavailable?.({ data: new Blob([new Uint8Array([9, 9, 9])], { type: 'audio/webm' }) });

    await source.stop();
    expect(recorderInstance.stopCount).toBe(1);
    expect(source.recorderState).toBe('inactive');
    expect(source.getStatus().state).toBe(STREAMING_AUDIO_SOURCE_STATES.IDLE);

    await source.destroy();
    expect(source.getStatus().state).toBe(STREAMING_AUDIO_SOURCE_STATES.DESTROYED);
    expect(emittedStates.map((entry) => entry.state)).toContain('paused');
    expect(emittedStates.map((entry) => entry.state)).toContain('capturing');
    expect(emittedStates.map((entry) => entry.state)).toContain('idle');
  });
});
