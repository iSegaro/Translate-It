// Compatibility exports for integrations that still import the former path.
export {
  GEMINI_LIVE_AUDIO_MIME_TYPE,
  GEMINI_LIVE_MODEL,
  GEMINI_LIVE_OUTPUT_AUDIO_MIME_TYPE,
  GEMINI_LIVE_SETUP_TIMEOUT,
  GEMINI_LIVE_WEBSOCKET_ENDPOINT,
  GEMINI_LIVE_MAX_BUFFERED_AMOUNT,
  GeminiLiveProviderAdapter as GeminiLiveTranslationClient,
  GeminiLiveProviderAdapter as default,
} from '../providers/GeminiLiveProviderAdapter.js';
