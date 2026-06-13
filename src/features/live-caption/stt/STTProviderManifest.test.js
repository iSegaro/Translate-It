import { describe, it, expect, beforeEach } from 'vitest';
import {
  STT_PROVIDER_IDS,
  STT_PROVIDER_MODES,
  STT_PROVIDER_EXECUTION_LOCATIONS,
  STT_PROVIDER_CAPABILITIES,
  STT_PROVIDER_MANIFEST,
  getDefaultSTTProviderId,
  getSTTProviderDefinition,
  getProviderExecutionLocation,
  resolveProviderExecutionHost,
  isProviderOffscreenExecuted,
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
      executionLocation: STT_PROVIDER_EXECUTION_LOCATIONS.BACKGROUND,
      type: 'stt',
      supportsPartialResults: false,
      supportsCorrections: false,
      supportsReconnect: false,
      requiresPersistentConnection: false,
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
    expect(getProviderExecutionLocation(STT_PROVIDER_IDS.OPENAI_WHISPER)).toBe(STT_PROVIDER_EXECUTION_LOCATIONS.BACKGROUND);
    expect(resolveProviderExecutionHost(STT_PROVIDER_IDS.OPENAI_WHISPER)).toBe(STT_PROVIDER_EXECUTION_LOCATIONS.BACKGROUND);
    expect(isProviderOffscreenExecuted(STT_PROVIDER_IDS.OPENAI_WHISPER)).toBe(false);
  });

  it('exposes the default provider id used by the MVP', () => {
    expect(getDefaultSTTProviderId()).toBe(STT_PROVIDER_IDS.OPENAI_WHISPER);
  });

  it('resolves provider metadata by id', () => {
    expect(getSTTProviderDefinition(STT_PROVIDER_IDS.OPENAI_WHISPER)).toBe(STT_PROVIDER_MANIFEST[STT_PROVIDER_IDS.OPENAI_WHISPER]);
    expect(isSTTProviderSupported(STT_PROVIDER_IDS.OPENAI_WHISPER)).toBe(true);
    expect(STT_PROVIDER_MANIFEST[STT_PROVIDER_IDS.MOCK]).toMatchObject({
      id: STT_PROVIDER_IDS.MOCK,
      displayName: 'Mock STT',
      mode: STT_PROVIDER_MODES.BATCH,
      executionLocation: STT_PROVIDER_EXECUTION_LOCATIONS.BACKGROUND,
      type: 'stt',
      supportsPartialResults: false,
      supportsCorrections: false,
      supportsReconnect: false,
      requiresPersistentConnection: false,
      needsApiKey: false,
      supported: true,
      developmentOnly: true
    });
    expect(STT_PROVIDER_MANIFEST[STT_PROVIDER_IDS.LOCAL_WHISPER]).toMatchObject({
      id: STT_PROVIDER_IDS.LOCAL_WHISPER,
      displayName: 'Local Whisper',
      mode: STT_PROVIDER_MODES.BATCH,
      executionLocation: STT_PROVIDER_EXECUTION_LOCATIONS.BACKGROUND,
      type: 'stt',
      supportsPartialResults: false,
      supportsCorrections: false,
      supportsReconnect: false,
      requiresPersistentConnection: false,
      needsApiKey: false,
      supported: true,
      developmentOnly: true
    });
    expect(getAvailableSTTProviders()).toHaveLength(1);
  });

  it('resolves streaming/offscreen metadata from a supplied manifest entry', () => {
    const mockManifest = {
      ...STT_PROVIDER_MANIFEST,
      mock_streaming: {
        id: 'mock_streaming',
        displayName: 'Mock Streaming',
        mode: STT_PROVIDER_MODES.STREAMING,
        executionLocation: STT_PROVIDER_EXECUTION_LOCATIONS.OFFSCREEN,
        supported: true
      }
    };

    expect(getProviderExecutionLocation('mock_streaming', mockManifest)).toBe(STT_PROVIDER_EXECUTION_LOCATIONS.OFFSCREEN);
    expect(resolveProviderExecutionHost('mock_streaming', mockManifest)).toBe(STT_PROVIDER_EXECUTION_LOCATIONS.OFFSCREEN);
    expect(isProviderOffscreenExecuted('mock_streaming', mockManifest)).toBe(true);
    expect(getProviderExecutionLocation('missing_provider', mockManifest)).toBeNull();
    expect(resolveProviderExecutionHost('missing_provider', mockManifest)).toBeNull();
    expect(isProviderOffscreenExecuted('missing_provider', mockManifest)).toBe(false);
  });

  it('registers the Faster Whisper streaming skeleton metadata without activating it', () => {
    const provider = STT_PROVIDER_MANIFEST[STT_PROVIDER_IDS.FASTER_WHISPER_STREAMING];

    expect(provider).toMatchObject({
      id: STT_PROVIDER_IDS.FASTER_WHISPER_STREAMING,
      displayName: 'Faster Whisper Streaming',
      mode: STT_PROVIDER_MODES.STREAMING,
      executionLocation: STT_PROVIDER_EXECUTION_LOCATIONS.OFFSCREEN,
      type: 'stt',
      supportsPartialResults: false,
      supportsCorrections: false,
      supportsReconnect: false,
      requiresPersistentConnection: true,
      needsApiKey: false,
      supported: true,
      developmentOnly: true
    });
    expect(getProviderExecutionLocation(STT_PROVIDER_IDS.FASTER_WHISPER_STREAMING)).toBe(STT_PROVIDER_EXECUTION_LOCATIONS.OFFSCREEN);
    expect(resolveProviderExecutionHost(STT_PROVIDER_IDS.FASTER_WHISPER_STREAMING)).toBe(STT_PROVIDER_EXECUTION_LOCATIONS.OFFSCREEN);
    expect(isProviderOffscreenExecuted(STT_PROVIDER_IDS.FASTER_WHISPER_STREAMING)).toBe(true);
    expect(isSTTProviderSupported(STT_PROVIDER_IDS.FASTER_WHISPER_STREAMING, true)).toBe(true);
  });

  it('keeps only the batch providers in the manifest', () => {
    expect(Object.keys(STT_PROVIDER_MANIFEST)).toEqual([
      STT_PROVIDER_IDS.OPENAI_WHISPER,
      STT_PROVIDER_IDS.MOCK,
      STT_PROVIDER_IDS.LOCAL_WHISPER,
      STT_PROVIDER_IDS.FASTER_WHISPER_STREAMING
    ]);
    expect(getAvailableSTTProviders()).toHaveLength(1);
    expect(getAvailableSTTProviders(true)).toHaveLength(4);
    expect(isSTTProviderSupported(STT_PROVIDER_IDS.LOCAL_WHISPER)).toBe(false);
    expect(isSTTProviderSupported(STT_PROVIDER_IDS.LOCAL_WHISPER, true)).toBe(true);
    expect(isSTTProviderSupported('browser_speech', true)).toBe(false);
  });
});
