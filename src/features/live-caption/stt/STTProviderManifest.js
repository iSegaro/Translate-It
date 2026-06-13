import { CONFIG } from '@/shared/config/config.js';
import { OPENAI_WHISPER_PROVIDER_ID, OpenAIWhisperProvider } from './providers/OpenAIWhisperProvider.js';
import { MOCK_STT_PROVIDER_ID, MockSTTProvider } from './providers/MockSTTProvider.js';
import { LOCAL_WHISPER_PROVIDER_ID, LocalWhisperSTTProvider } from './providers/LocalWhisperSTTProvider.js';
import { FASTER_WHISPER_STREAMING_PROVIDER_ID, FasterWhisperStreamingProvider } from './providers/FasterWhisperStreamingProvider.js';
import {
  STT_PROVIDER_MODES,
  STT_PROVIDER_EXECUTION_LOCATIONS
} from './liveCaptionSTTProviderContracts.js';

export {
  STT_PROVIDER_MODES,
  STT_PROVIDER_EXECUTION_LOCATIONS
} from './liveCaptionSTTProviderContracts.js';

export const STT_PROVIDER_IDS = Object.freeze({
  OPENAI_WHISPER: OPENAI_WHISPER_PROVIDER_ID,
  MOCK: MOCK_STT_PROVIDER_ID,
  LOCAL_WHISPER: LOCAL_WHISPER_PROVIDER_ID,
  FASTER_WHISPER_STREAMING: FASTER_WHISPER_STREAMING_PROVIDER_ID
});

export const STT_PROVIDER_CAPABILITIES = Object.freeze({
  TRANSCRIPTION: 'transcription',
  BATCH: 'batch',
  FINAL_ONLY: 'final_only',
  AUDIO_CHUNK: 'audio_chunk',
  RETRY: 'retry'
});

export const STT_PROVIDER_MANIFEST = Object.freeze({
  [STT_PROVIDER_IDS.OPENAI_WHISPER]: Object.freeze({
    id: STT_PROVIDER_IDS.OPENAI_WHISPER,
    name: 'OpenAIWhisper',
    displayName: 'OpenAI Whisper',
    mode: STT_PROVIDER_MODES.BATCH,
    executionLocation: STT_PROVIDER_EXECUTION_LOCATIONS.BACKGROUND,
    type: 'stt',
    providerClass: OpenAIWhisperProvider,
    capabilities: Object.freeze([
      STT_PROVIDER_CAPABILITIES.TRANSCRIPTION,
      STT_PROVIDER_CAPABILITIES.BATCH,
      STT_PROVIDER_CAPABILITIES.FINAL_ONLY,
      STT_PROVIDER_CAPABILITIES.AUDIO_CHUNK,
      STT_PROVIDER_CAPABILITIES.RETRY
    ]),
    supportsPartialResults: false,
    supportsCorrections: false,
    supportsReconnect: false,
    requiresPersistentConnection: false,
    needsApiKey: true,
    requiredSettings: Object.freeze(['OPENAI_API_KEY']),
    default: true,
    supported: true
  }),
  [STT_PROVIDER_IDS.MOCK]: Object.freeze({
    id: STT_PROVIDER_IDS.MOCK,
    name: 'MockSTT',
    displayName: 'Mock STT',
    mode: STT_PROVIDER_MODES.BATCH,
    executionLocation: STT_PROVIDER_EXECUTION_LOCATIONS.BACKGROUND,
    type: 'stt',
    providerClass: MockSTTProvider,
    capabilities: Object.freeze([
      STT_PROVIDER_CAPABILITIES.TRANSCRIPTION,
      STT_PROVIDER_CAPABILITIES.BATCH,
      STT_PROVIDER_CAPABILITIES.FINAL_ONLY,
      STT_PROVIDER_CAPABILITIES.AUDIO_CHUNK
    ]),
    supportsPartialResults: false,
    supportsCorrections: false,
    supportsReconnect: false,
    requiresPersistentConnection: false,
    needsApiKey: false,
    requiredSettings: Object.freeze([]),
    default: false,
    supported: true,
    developmentOnly: true
  }),
  [STT_PROVIDER_IDS.LOCAL_WHISPER]: Object.freeze({
    id: STT_PROVIDER_IDS.LOCAL_WHISPER,
    name: 'LocalWhisper',
    displayName: 'Local Whisper',
    mode: STT_PROVIDER_MODES.BATCH,
    executionLocation: STT_PROVIDER_EXECUTION_LOCATIONS.BACKGROUND,
    type: 'stt',
    providerClass: LocalWhisperSTTProvider,
    capabilities: Object.freeze([
      STT_PROVIDER_CAPABILITIES.TRANSCRIPTION,
      STT_PROVIDER_CAPABILITIES.BATCH,
      STT_PROVIDER_CAPABILITIES.FINAL_ONLY,
      STT_PROVIDER_CAPABILITIES.AUDIO_CHUNK,
      STT_PROVIDER_CAPABILITIES.RETRY
    ]),
    supportsPartialResults: false,
    supportsCorrections: false,
    supportsReconnect: false,
    requiresPersistentConnection: false,
    needsApiKey: false,
    requiredSettings: Object.freeze([]),
    default: false,
    supported: true,
    developmentOnly: true
  }),
  [STT_PROVIDER_IDS.FASTER_WHISPER_STREAMING]: Object.freeze({
    id: STT_PROVIDER_IDS.FASTER_WHISPER_STREAMING,
    name: 'FasterWhisperStreaming',
    displayName: 'Faster Whisper Streaming',
    mode: STT_PROVIDER_MODES.STREAMING,
    executionLocation: STT_PROVIDER_EXECUTION_LOCATIONS.OFFSCREEN,
    type: 'stt',
    providerClass: FasterWhisperStreamingProvider,
    capabilities: Object.freeze([
      STT_PROVIDER_CAPABILITIES.TRANSCRIPTION,
      STT_PROVIDER_CAPABILITIES.FINAL_ONLY,
      STT_PROVIDER_CAPABILITIES.AUDIO_CHUNK
    ]),
    supportsPartialResults: false,
    supportsCorrections: false,
    supportsReconnect: false,
    requiresPersistentConnection: true,
    needsApiKey: false,
    requiredSettings: Object.freeze([]),
    default: false,
    supported: true,
    developmentOnly: true
  })
});

export function getDefaultSTTProviderId() {
  return CONFIG.LIVE_CAPTION_STT_PROVIDER || STT_PROVIDER_IDS.OPENAI_WHISPER;
}

export function getSTTProviderDefinition(providerId) {
  if (!providerId) {
    return null;
  }

  return STT_PROVIDER_MANIFEST[providerId] || null;
}

export function getProviderExecutionLocation(providerId, providerManifest = STT_PROVIDER_MANIFEST) {
  if (!providerId || !providerManifest || typeof providerManifest !== 'object') {
    return null;
  }

  const definition = providerManifest[providerId];
  return definition?.executionLocation ?? null;
}

export function resolveProviderExecutionHost(providerId, providerManifest = STT_PROVIDER_MANIFEST) {
  return getProviderExecutionLocation(providerId, providerManifest);
}

export function isProviderOffscreenExecuted(providerId, providerManifest = STT_PROVIDER_MANIFEST) {
  return getProviderExecutionLocation(providerId, providerManifest) === STT_PROVIDER_EXECUTION_LOCATIONS.OFFSCREEN;
}

export function isSTTProviderSupported(providerId, debugMode = null) {
  const definition = getSTTProviderDefinition(providerId);
  if (!definition || definition.supported === false) {
    return false;
  }

  // Hide development-only providers if not in debug mode
  const isDebug = debugMode !== null ? debugMode : CONFIG.DEBUG_MODE;
  if (definition.developmentOnly && !isDebug) {
    return false;
  }

  if (definition.providerClass?.isSupported && !definition.providerClass.isSupported()) {
    return false;
  }

  return true;
}

export function getAvailableSTTProviders(debugMode = null) {
  const isDebug = debugMode !== null ? debugMode : CONFIG.DEBUG_MODE;
  
  return Object.values(STT_PROVIDER_MANIFEST).filter((provider) => {
    if (provider.supported === false) {
      return false;
    }

    if (provider.developmentOnly && !isDebug) {
      return false;
    }

    if (provider.providerClass?.isSupported && !provider.providerClass.isSupported()) {
      return false;
    }

    return true;
  });
}

export default STT_PROVIDER_MANIFEST;
