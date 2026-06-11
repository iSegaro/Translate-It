import {
  BaseSTTProvider,
  STT_PROVIDER_STATUS,
  STT_PROVIDER_ERROR_CODES,
  normalizeSTTResult,
  createSTTProviderStatus,
  createSTTProviderError,
  isRetryableSTTError,
  normalizeSTTProviderError
} from './BaseSTTProvider.js';
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
import { STTProviderFactory } from './STTProviderFactory.js';
import { OpenAIWhisperProvider } from './providers/OpenAIWhisperProvider.js';
import { MockSTTProvider } from './providers/MockSTTProvider.js';
import { BrowserSpeechSTTProvider } from './providers/BrowserSpeechSTTProvider.js';

export {
  BaseSTTProvider,
  STT_PROVIDER_STATUS,
  STT_PROVIDER_ERROR_CODES,
  normalizeSTTResult,
  createSTTProviderStatus,
  createSTTProviderError,
  isRetryableSTTError,
  normalizeSTTProviderError
} from './BaseSTTProvider.js';
export {
  STT_PROVIDER_IDS,
  STT_PROVIDER_MODES,
  STT_PROVIDER_CAPABILITIES,
  STT_PROVIDER_MANIFEST,
  getDefaultSTTProviderId,
  getSTTProviderDefinition,
  getAvailableSTTProviders,
  isSTTProviderSupported
} from './STTProviderManifest.js';
export { STTProviderFactory } from './STTProviderFactory.js';
export { OpenAIWhisperProvider } from './providers/OpenAIWhisperProvider.js';
export { MockSTTProvider } from './providers/MockSTTProvider.js';
export { BrowserSpeechSTTProvider } from './providers/BrowserSpeechSTTProvider.js';

export default {
  BaseSTTProvider,
  STT_PROVIDER_STATUS,
  STT_PROVIDER_ERROR_CODES,
  normalizeSTTResult,
  createSTTProviderStatus,
  createSTTProviderError,
  isRetryableSTTError,
  normalizeSTTProviderError,
  STT_PROVIDER_IDS,
  STT_PROVIDER_MODES,
  STT_PROVIDER_CAPABILITIES,
  STT_PROVIDER_MANIFEST,
  getDefaultSTTProviderId,
  getSTTProviderDefinition,
  getAvailableSTTProviders,
  isSTTProviderSupported,
  STTProviderFactory,
  OpenAIWhisperProvider,
  MockSTTProvider,
  BrowserSpeechSTTProvider
};
