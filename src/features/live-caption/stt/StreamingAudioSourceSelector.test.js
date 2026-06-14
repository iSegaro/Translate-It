import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  StreamingAudioSourceSelector
} from './StreamingAudioSourceSelector.js';
import { STREAMING_AUDIO_FORMATS } from './StreamingAudioSource.js';

describe('StreamingAudioSourceSelector', () => {
  let mediaRecorderFactory;
  let audioWorkletFactory;

  beforeEach(() => {
    mediaRecorderFactory = vi.fn(() => ({
      sourceId: 'media-recorder-source',
      start: vi.fn(),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn()
    }));
    audioWorkletFactory = vi.fn(() => ({
      sourceId: 'audio-worklet-source',
      start: vi.fn(),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn()
    }));
    vi.stubGlobal('AudioWorkletNode', function AudioWorkletNode() {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefers AudioWorklet PCM16 when supported by the provider and environment', () => {
    const selector = new StreamingAudioSourceSelector({
      mediaRecorderFactory,
      audioWorkletFactory
    });

    const selection = selector.select({
      providerDefinition: {
        id: 'faster_whisper_streaming',
        mode: 'streaming',
        executionLocation: 'offscreen',
        audioInputFormats: [
          STREAMING_AUDIO_FORMATS.PCM16_MONO_16KHZ,
          STREAMING_AUDIO_FORMATS.WEBM_OPUS
        ],
        preferredAudioInputFormat: STREAMING_AUDIO_FORMATS.PCM16_MONO_16KHZ,
        fallbackAudioInputFormat: STREAMING_AUDIO_FORMATS.WEBM_OPUS
      },
      audioContext: {
        audioWorklet: {
          addModule: vi.fn()
        }
      }
    });

    expect(selection.sourceType).toBe('audio_worklet_pcm16');
    expect(selection.selectedAudioFormat).toBe(STREAMING_AUDIO_FORMATS.PCM16_MONO_16KHZ);
    expect(selection.canUseAudioWorklet).toBe(true);
    expect(audioWorkletFactory).toHaveBeenCalledTimes(1);
    expect(mediaRecorderFactory).not.toHaveBeenCalled();
  });

  it('falls back to MediaRecorder when AudioWorklet is unavailable', () => {
    vi.unstubAllGlobals();
    const selector = new StreamingAudioSourceSelector({
      mediaRecorderFactory,
      audioWorkletFactory
    });

    const selection = selector.select({
      providerDefinition: {
        id: 'faster_whisper_streaming',
        mode: 'streaming',
        executionLocation: 'offscreen',
        audioInputFormats: [STREAMING_AUDIO_FORMATS.PCM16_MONO_16KHZ]
      },
      audioContext: {
        audioWorklet: {
          addModule: vi.fn()
        }
      }
    });

    expect(selection.sourceType).toBe('media_recorder_webm_opus');
    expect(selection.selectedAudioFormat).toBe(STREAMING_AUDIO_FORMATS.WEBM_OPUS);
    expect(selection.canUseAudioWorklet).toBe(false);
    expect(mediaRecorderFactory).toHaveBeenCalledTimes(1);
    expect(audioWorkletFactory).not.toHaveBeenCalled();
  });

  it('falls back to MediaRecorder when the provider does not declare PCM support', () => {
    const selector = new StreamingAudioSourceSelector({
      mediaRecorderFactory,
      audioWorkletFactory
    });

    const selection = selector.select({
      providerDefinition: {
        id: 'webm_only_streaming',
        mode: 'streaming',
        executionLocation: 'offscreen',
        audioInputFormats: [STREAMING_AUDIO_FORMATS.WEBM_OPUS],
        preferredAudioInputFormat: STREAMING_AUDIO_FORMATS.WEBM_OPUS,
        fallbackAudioInputFormat: STREAMING_AUDIO_FORMATS.WEBM_OPUS
      },
      audioContext: {
        audioWorklet: {
          addModule: vi.fn()
        }
      }
    });

    expect(selection.sourceType).toBe('media_recorder_webm_opus');
    expect(selection.selectedAudioFormat).toBe(STREAMING_AUDIO_FORMATS.WEBM_OPUS);
    expect(selection.canUseAudioWorklet).toBe(false);
    expect(mediaRecorderFactory).toHaveBeenCalledTimes(1);
    expect(audioWorkletFactory).not.toHaveBeenCalled();
  });
});
