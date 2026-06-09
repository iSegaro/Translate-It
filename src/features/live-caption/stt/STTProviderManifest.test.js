import { describe, it, expect } from 'vitest';
import {
  STT_PROVIDER_IDS,
  STT_PROVIDER_MODES,
  STT_PROVIDER_CAPABILITIES,
  STT_PROVIDER_MANIFEST,
  getDefaultSTTProviderId,
  getSTTProviderDefinition,
  getAvailableSTTProviders,
  isSTTProviderSupported
} from './STTProviderManifest.js';

describe('STTProviderManifest', () => {
  it('registers OpenAI Whisper metadata for the MVP', () => {
    const provider = STT_PROVIDER_MANIFEST[STT_PROVIDER_IDS.OPENAI_WHISPER];

    expect(provider).toMatchObject({
      id: STT_PROVIDER_IDS.OPENAI_WHISPER,
      displayName: 'OpenAI Whisper',
      mode: STT_PROVIDER_MODES.BATCH,
      type: 'stt',
      needsApiKey: true,
      supported: true
    });
    expect(provider.capabilities).toEqual([
      STT_PROVIDER_CAPABILITIES.TRANSCRIPTION,
      STT_PROVIDER_CAPABILITIES.BATCH,
      STT_PROVIDER_CAPABILITIES.FINAL_ONLY,
      STT_PROVIDER_CAPABILITIES.AUDIO_CHUNK,
      STT_PROVIDER_CAPABILITIES.RETRY
    ]);
    expect(provider.requiredSettings).toEqual(['OPENAI_API_KEY']);
  });

  it('exposes the default provider id used by the MVP', () => {
    expect(getDefaultSTTProviderId()).toBe(STT_PROVIDER_IDS.OPENAI_WHISPER);
  });

  it('resolves provider metadata by id', () => {
    expect(getSTTProviderDefinition(STT_PROVIDER_IDS.OPENAI_WHISPER)).toBe(STT_PROVIDER_MANIFEST[STT_PROVIDER_IDS.OPENAI_WHISPER]);
    expect(isSTTProviderSupported(STT_PROVIDER_IDS.OPENAI_WHISPER)).toBe(true);
    expect(getAvailableSTTProviders()).toHaveLength(1);
  });
});
