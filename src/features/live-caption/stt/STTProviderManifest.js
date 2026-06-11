import { CONFIG } from '@/shared/config/config.js';
import { OPENAI_WHISPER_PROVIDER_ID, OpenAIWhisperProvider } from './providers/OpenAIWhisperProvider.js';
import { MOCK_STT_PROVIDER_ID, MockSTTProvider } from './providers/MockSTTProvider.js';
import {
  BROWSER_SPEECH_PROVIDER_ID,
  BrowserSpeechSTTProvider
} from './providers/BrowserSpeechSTTProvider.js';

export const STT_PROVIDER_IDS = Object.freeze({
  OPENAI_WHISPER: OPENAI_WHISPER_PROVIDER_ID,
  MOCK: MOCK_STT_PROVIDER_ID,
  BROWSER_SPEECH: BROWSER_SPEECH_PROVIDER_ID
});

export const STT_PROVIDER_MODES = Object.freeze({
  BATCH: 'batch',
  SESSION: 'session'
});

export const STT_PROVIDER_CAPABILITIES = Object.freeze({
  TRANSCRIPTION: 'transcription',
  BATCH: 'batch',
  SPEECH_SESSION: 'speech_session',
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
    type: 'stt',
    providerClass: OpenAIWhisperProvider,
    capabilities: Object.freeze([
      STT_PROVIDER_CAPABILITIES.TRANSCRIPTION,
      STT_PROVIDER_CAPABILITIES.BATCH,
      STT_PROVIDER_CAPABILITIES.FINAL_ONLY,
      STT_PROVIDER_CAPABILITIES.AUDIO_CHUNK,
      STT_PROVIDER_CAPABILITIES.RETRY
    ]),
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
    type: 'stt',
    providerClass: MockSTTProvider,
    capabilities: Object.freeze([
      STT_PROVIDER_CAPABILITIES.TRANSCRIPTION,
      STT_PROVIDER_CAPABILITIES.BATCH,
      STT_PROVIDER_CAPABILITIES.FINAL_ONLY,
      STT_PROVIDER_CAPABILITIES.AUDIO_CHUNK
    ]),
    needsApiKey: false,
    requiredSettings: Object.freeze([]),
    default: false,
    supported: true,
    developmentOnly: true
  }),
  [STT_PROVIDER_IDS.BROWSER_SPEECH]: Object.freeze({
    id: STT_PROVIDER_IDS.BROWSER_SPEECH,
    name: 'BrowserSpeech',
    displayName: 'Browser Speech',
    mode: STT_PROVIDER_MODES.SESSION,
    type: 'stt',
    providerClass: BrowserSpeechSTTProvider,
    capabilities: Object.freeze([
      STT_PROVIDER_CAPABILITIES.TRANSCRIPTION,
      STT_PROVIDER_CAPABILITIES.SPEECH_SESSION,
      STT_PROVIDER_CAPABILITIES.FINAL_ONLY
    ]),
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
