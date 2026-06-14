import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  StreamingAudioSourceSelector,
  createDefaultAudioContextConstructorProvider,
  createDefaultAudioWorkletSupportProbeFactory,
  createDefaultAudioWorkletSupportDetector
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
    vi.stubGlobal('AudioContext', class AudioContext {
      constructor() {
        this.audioWorklet = {
          addModule: vi.fn().mockResolvedValue(undefined)
        };
        this.close = vi.fn().mockResolvedValue(undefined);
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefers AudioWorklet PCM16 when supported by the provider and environment without a pre-existing audioContext', () => {
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
      }
    });

    expect(selection.sourceType).toBe('audio_worklet_pcm16');
    expect(selection.selectedAudioFormat).toBe(STREAMING_AUDIO_FORMATS.PCM16_MONO_16KHZ);
    expect(selection.canUseAudioWorklet).toBe(true);
    expect(audioWorkletFactory).toHaveBeenCalledTimes(1);
    expect(mediaRecorderFactory).not.toHaveBeenCalled();
  });

  it('prefers AudioWorklet PCM16 when an injected detector reports support', () => {
    const audioWorkletSupportDetector = vi.fn().mockReturnValue(true);
    const selector = new StreamingAudioSourceSelector({
      mediaRecorderFactory,
      audioWorkletFactory,
      audioWorkletSupportDetector
    });

    const selection = selector.select({
      providerDefinition: {
        id: 'faster_whisper_streaming',
        mode: 'streaming',
        executionLocation: 'offscreen',
        audioInputFormats: [STREAMING_AUDIO_FORMATS.PCM16_MONO_16KHZ]
      }
    });

    expect(selection.sourceType).toBe('audio_worklet_pcm16');
    expect(selection.canUseAudioWorklet).toBe(true);
    expect(audioWorkletSupportDetector).toHaveBeenCalledTimes(1);
    expect(audioWorkletFactory).toHaveBeenCalledTimes(1);
    expect(mediaRecorderFactory).not.toHaveBeenCalled();
  });

  it('falls back to MediaRecorder when an injected detector reports unsupported', () => {
    const audioWorkletSupportDetector = vi.fn().mockReturnValue(false);
    const selector = new StreamingAudioSourceSelector({
      mediaRecorderFactory,
      audioWorkletFactory,
      audioWorkletSupportDetector
    });

    const selection = selector.select({
      providerDefinition: {
        id: 'faster_whisper_streaming',
        mode: 'streaming',
        executionLocation: 'offscreen',
        audioInputFormats: [STREAMING_AUDIO_FORMATS.PCM16_MONO_16KHZ]
      }
    });

    expect(selection.sourceType).toBe('media_recorder_webm_opus');
    expect(selection.canUseAudioWorklet).toBe(false);
    expect(audioWorkletSupportDetector).toHaveBeenCalledTimes(1);
    expect(mediaRecorderFactory).toHaveBeenCalledTimes(1);
    expect(audioWorkletFactory).not.toHaveBeenCalled();
  });

  it('does not depend on the loopback audioContext when probing PCM support', () => {
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
        // Simulate a loopback context that lacks audioWorklet support.
      }
    });

    expect(selection.sourceType).toBe('audio_worklet_pcm16');
    expect(selection.selectedAudioFormat).toBe(STREAMING_AUDIO_FORMATS.PCM16_MONO_16KHZ);
    expect(selection.canUseAudioWorklet).toBe(true);
    expect(audioWorkletFactory).toHaveBeenCalledTimes(1);
    expect(mediaRecorderFactory).not.toHaveBeenCalled();
  });

  it('closes the probe context when the probe factory creates one', () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const probeContext = {
      audioWorklet: {
        addModule: vi.fn().mockResolvedValue(undefined)
      },
      close
    };
    const audioWorkletSupportProbeFactory = vi.fn().mockReturnValue(probeContext);
    const selector = new StreamingAudioSourceSelector({
      mediaRecorderFactory,
      audioWorkletFactory,
      audioWorkletSupportProbeFactory
    });

    const selection = selector.select({
      providerDefinition: {
        id: 'faster_whisper_streaming',
        mode: 'streaming',
        executionLocation: 'offscreen',
        audioInputFormats: [STREAMING_AUDIO_FORMATS.PCM16_MONO_16KHZ]
      }
    });

    expect(selection.sourceType).toBe('audio_worklet_pcm16');
    expect(audioWorkletSupportProbeFactory).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('does not create a probe context when AudioWorkletNode is unavailable', () => {
    vi.unstubAllGlobals();
    const audioContextConstructorProvider = vi.fn(() => {
      throw new Error('should not be called');
    });
    const audioWorkletSupportProbeFactory = vi.fn(() => {
      throw new Error('should not be called');
    });
    const audioWorkletSupportDetector = createDefaultAudioWorkletSupportDetector({
      audioWorkletSupportProbeFactory
    });
    const selector = new StreamingAudioSourceSelector({
      mediaRecorderFactory,
      audioWorkletFactory,
      audioContextConstructorProvider,
      audioWorkletSupportProbeFactory,
      audioWorkletSupportDetector
    });

    const selection = selector.select({
      providerDefinition: {
        id: 'faster_whisper_streaming',
        mode: 'streaming',
        executionLocation: 'offscreen',
        audioInputFormats: [STREAMING_AUDIO_FORMATS.PCM16_MONO_16KHZ]
      }
    });

    expect(selection.sourceType).toBe('media_recorder_webm_opus');
    expect(audioWorkletSupportProbeFactory).not.toHaveBeenCalled();
    expect(audioContextConstructorProvider).not.toHaveBeenCalled();
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

  it('exports the default audio worklet support helpers', () => {
    expect(typeof createDefaultAudioContextConstructorProvider).toBe('function');
    expect(typeof createDefaultAudioWorkletSupportProbeFactory).toBe('function');
    expect(typeof createDefaultAudioWorkletSupportDetector).toBe('function');
  });
});
