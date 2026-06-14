import { describe, expect, it } from 'vitest';
import {
  STREAMING_AUDIO_FORMATS,
  STREAMING_AUDIO_SOURCE_STATES,
  StreamingAudioSource,
  createStreamingAudioChunk,
  normalizeStreamingAudioChunk,
  normalizeStreamingAudioFormat
} from './StreamingAudioSource.js';

class MockStreamingAudioSource extends StreamingAudioSource {
  constructor(options = {}) {
    super('mock_streaming_audio_source', options);
  }
}

describe('StreamingAudioSource', () => {
  it('exposes the supported audio formats and normalizes them safely', () => {
    expect(STREAMING_AUDIO_FORMATS).toEqual({
      WEBM_OPUS: 'webm-opus',
      PCM16_MONO_16KHZ: 'pcm16-mono-16khz'
    });
    expect(normalizeStreamingAudioFormat(' webm-opus ')).toBe(STREAMING_AUDIO_FORMATS.WEBM_OPUS);
    expect(normalizeStreamingAudioFormat('pcm16-mono-16khz')).toBe(STREAMING_AUDIO_FORMATS.PCM16_MONO_16KHZ);
    expect(normalizeStreamingAudioFormat('unknown')).toBeNull();
  });

  it('normalizes streaming audio chunks without mutating payload metadata', () => {
    const metadata = { origin: 'test' };
    const chunk = createStreamingAudioChunk({
      payload: new Uint8Array([1, 2, 3]),
      format: STREAMING_AUDIO_FORMATS.PCM16_MONO_16KHZ,
      mimeType: 'audio/pcm',
      sampleRate: 16000,
      channelCount: 1,
      bitDepth: 16,
      chunkStartMs: 1000,
      chunkEndMs: 2000,
      source: 'audio-worklet',
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      metadata
    });

    expect(chunk).toMatchObject({
      format: STREAMING_AUDIO_FORMATS.PCM16_MONO_16KHZ,
      mimeType: 'audio/pcm',
      sampleRate: 16000,
      channelCount: 1,
      bitDepth: 16,
      chunkStartMs: 1000,
      chunkEndMs: 2000,
      source: 'audio-worklet',
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    });
    expect(chunk.payload).toBeInstanceOf(Uint8Array);
    expect(chunk.metadata).toEqual(metadata);
    expect(Object.isFrozen(chunk)).toBe(true);
    expect(Object.isFrozen(chunk.metadata)).toBe(true);
    expect(normalizeStreamingAudioChunk({
      payload: new Uint8Array([9]),
      format: STREAMING_AUDIO_FORMATS.WEBM_OPUS
    })).toMatchObject({
      format: STREAMING_AUDIO_FORMATS.WEBM_OPUS
    });
  });

  it('rejects unsupported formats and reversed chunk ranges', () => {
    expect(() => createStreamingAudioChunk({
      payload: new Blob(['x']),
      format: 'unknown'
    })).toThrow(/supported audio format/i);

    expect(() => createStreamingAudioChunk({
      payload: new Blob(['x']),
      format: STREAMING_AUDIO_FORMATS.WEBM_OPUS,
      chunkStartMs: 2000,
      chunkEndMs: 1000
    })).toThrow(/greater than or equal/i);
  });

  it('preserves source state snapshots without enabling behavior', () => {
    const source = new MockStreamingAudioSource();

    expect(source.state).toBe(STREAMING_AUDIO_SOURCE_STATES.IDLE);
    expect(source.getStatus()).toMatchObject({
      sourceId: 'mock_streaming_audio_source',
      state: STREAMING_AUDIO_SOURCE_STATES.IDLE,
      session: null
    });
  });

  it('guards abstract lifecycle methods on the base contract', async () => {
    const source = new MockStreamingAudioSource();

    await expect(source.start({
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    })).rejects.toThrow(/not implemented yet/i);
    await expect(source.stop()).rejects.toThrow(/not implemented yet/i);
    await expect(source.destroy()).rejects.toThrow(/not implemented yet/i);
  });
});
