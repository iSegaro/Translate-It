import { CONFIG } from '@/shared/config/config.js';
import { OPENAI_WHISPER_PROVIDER_ID, OpenAIWhisperProvider } from './providers/OpenAIWhisperProvider.js';

export const STT_PROVIDER_IDS = Object.freeze({
  OPENAI_WHISPER: OPENAI_WHISPER_PROVIDER_ID
});

export const STT_PROVIDER_MODES = Object.freeze({
  BATCH: 'batch'
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

export function isSTTProviderSupported(providerId) {
  return Boolean(getSTTProviderDefinition(providerId)?.supported);
}

export function getAvailableSTTProviders() {
  return Object.values(STT_PROVIDER_MANIFEST).filter((provider) => provider.supported !== false);
}

export default STT_PROVIDER_MANIFEST;
