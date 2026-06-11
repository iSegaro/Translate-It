import { describe, it, expect, beforeEach } from 'vitest';
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
  beforeEach(() => {
    globalThis.SpeechRecognition = undefined;
    globalThis.webkitSpeechRecognition = undefined;
  });

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

  it('registers Browser Speech metadata as a dev-only session provider', () => {
    globalThis.SpeechRecognition = class MockSpeechRecognition {};

    const provider = STT_PROVIDER_MANIFEST[STT_PROVIDER_IDS.BROWSER_SPEECH];

    expect(provider).toMatchObject({
      id: STT_PROVIDER_IDS.BROWSER_SPEECH,
      displayName: 'Browser Speech',
      mode: STT_PROVIDER_MODES.SESSION,
      type: 'stt',
      needsApiKey: false,
      supported: true,
      developmentOnly: true
    });
    expect(provider.capabilities).toEqual([
      STT_PROVIDER_CAPABILITIES.TRANSCRIPTION,
      STT_PROVIDER_CAPABILITIES.SPEECH_SESSION,
      STT_PROVIDER_CAPABILITIES.FINAL_ONLY
    ]);
    expect(provider.requiredSettings).toEqual([]);
  });

  it('exposes the default provider id used by the MVP', () => {
    expect(getDefaultSTTProviderId()).toBe(STT_PROVIDER_IDS.OPENAI_WHISPER);
  });

  it('resolves provider metadata by id', () => {
    expect(getSTTProviderDefinition(STT_PROVIDER_IDS.OPENAI_WHISPER)).toBe(STT_PROVIDER_MANIFEST[STT_PROVIDER_IDS.OPENAI_WHISPER]);
    expect(isSTTProviderSupported(STT_PROVIDER_IDS.OPENAI_WHISPER)).toBe(true);
    expect(getAvailableSTTProviders()).toHaveLength(1);
  });

  it('includes Browser Speech only when debug is enabled and speech recognition is supported', () => {
    globalThis.SpeechRecognition = class MockSpeechRecognition {};

    expect(isSTTProviderSupported(STT_PROVIDER_IDS.BROWSER_SPEECH, true)).toBe(true);
    expect(getAvailableSTTProviders(true).some((provider) => provider.id === STT_PROVIDER_IDS.BROWSER_SPEECH)).toBe(true);
    expect(isSTTProviderSupported(STT_PROVIDER_IDS.BROWSER_SPEECH, false)).toBe(false);
  });
});
