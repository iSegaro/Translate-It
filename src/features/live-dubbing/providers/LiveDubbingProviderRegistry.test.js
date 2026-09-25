import { describe, expect, it } from 'vitest';
import { LIVE_DUBBING_AUDIO_MODES } from '../constants.js';
import { GeminiLiveProviderAdapter } from './GeminiLiveProviderAdapter.js';
import { LiveDubbingProviderRegistry } from './LiveDubbingProviderRegistry.js';
import { OpenAIRealtimeProviderAdapter } from './OpenAIRealtimeProviderAdapter.js';

describe('LiveDubbingProviderRegistry', () => {
  it('creates the Gemini adapter for the canonical provider id', () => {
    const registry = new LiveDubbingProviderRegistry();

    expect(registry.create('gemini')).toBeInstanceOf(GeminiLiveProviderAdapter);
  });

  it('creates the OpenAI media-stream adapter without a PCM sendAudio contract', () => {
    const registry = new LiveDubbingProviderRegistry();
    const adapter = registry.create('openai', {
      peerConnectionFactory: () => ({}),
    });

    expect(adapter).toBeInstanceOf(OpenAIRealtimeProviderAdapter);
    expect(registry.getAudioMode('openai')).toBe(LIVE_DUBBING_AUDIO_MODES.MEDIA_STREAM);
    expect(adapter.sendAudio).toBeUndefined();
  });

  it('fails closed for unknown providers', () => {
    const registry = new LiveDubbingProviderRegistry();

    expect(registry.create('unknown-provider')).toBeNull();
  });

  it('declares the pcm audio mode for the canonical provider id', () => {
    const registry = new LiveDubbingProviderRegistry();

    expect(registry.getAudioMode('gemini')).toBe(LIVE_DUBBING_AUDIO_MODES.PCM);
  });

  it('fails closed on audio mode lookup for unknown providers', () => {
    const registry = new LiveDubbingProviderRegistry();

    expect(registry.getAudioMode('unknown-provider')).toBeNull();
    expect(registry.getAudioMode(null)).toBeNull();
    expect(registry.getAudioMode(undefined)).toBeNull();
  });

  it('resolves a custom media-stream definition without touching production entries', () => {
    const client = { connect: async () => {} };
    const registry = new LiveDubbingProviderRegistry({
      custom: Object.freeze({ audioMode: 'media-stream', create: () => client }),
    });

    expect(registry.getAudioMode('custom')).toBe('media-stream');
    expect(registry.create('custom')).toBe(client);
    expect(registry.getAudioMode('gemini')).toBeNull();
    expect(registry.create('gemini')).toBeNull();
  });

  it('returns null for malformed definitions and unsupported modes', () => {
    const registry = new LiveDubbingProviderRegistry({
      nocreate: Object.freeze({ audioMode: 'pcm' }),
      badmode: Object.freeze({ audioMode: 'bogus', create: () => ({}) }),
    });

    expect(registry.create('nocreate')).toBeNull();
    expect(registry.getAudioMode('nocreate')).toBeNull();
    expect(registry.create('badmode')).toBeNull();
    expect(registry.getAudioMode('badmode')).toBeNull();
  });

  it('lets factory exceptions propagate instead of masking them as null', () => {
    const failure = new Error('factory boom');
    const registry = new LiveDubbingProviderRegistry({
      broken: Object.freeze({
        audioMode: 'pcm',
        create: () => { throw failure; },
      }),
    });

    expect(() => registry.create('broken')).toThrow(failure);
  });
});
