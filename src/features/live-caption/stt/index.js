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
  BaseStreamingSTTProvider,
  STT_STREAMING_PROVIDER_STATES,
  STT_STREAMING_PROVIDER_EVENT_TYPES,
  normalizeStreamingProviderEventEnvelope
} from './BaseStreamingSTTProvider.js';
import {
  STT_PROVIDER_IDS,
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
import {
  STT_PROVIDER_MODES,
  STT_PROVIDER_EXECUTION_LOCATIONS
} from './liveCaptionSTTProviderContracts.js';
import { STTProviderFactory } from './STTProviderFactory.js';
import { OpenAIWhisperProvider } from './providers/OpenAIWhisperProvider.js';
import { MockSTTProvider } from './providers/MockSTTProvider.js';
import { LocalWhisperSTTProvider } from './providers/LocalWhisperSTTProvider.js';

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
  BaseStreamingSTTProvider,
  STT_STREAMING_PROVIDER_STATES,
  STT_STREAMING_PROVIDER_EVENT_TYPES,
  normalizeStreamingProviderEventEnvelope
} from './BaseStreamingSTTProvider.js';
export {
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
export { STTProviderFactory } from './STTProviderFactory.js';
export { OpenAIWhisperProvider } from './providers/OpenAIWhisperProvider.js';
export { MockSTTProvider } from './providers/MockSTTProvider.js';
export { LocalWhisperSTTProvider } from './providers/LocalWhisperSTTProvider.js';

export default {
  BaseSTTProvider,
  STT_PROVIDER_STATUS,
  STT_PROVIDER_ERROR_CODES,
  normalizeSTTResult,
  createSTTProviderStatus,
  createSTTProviderError,
  isRetryableSTTError,
  normalizeSTTProviderError,
  BaseStreamingSTTProvider,
  STT_STREAMING_PROVIDER_STATES,
  STT_STREAMING_PROVIDER_EVENT_TYPES,
  normalizeStreamingProviderEventEnvelope,
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
  isSTTProviderSupported,
  STTProviderFactory,
  OpenAIWhisperProvider,
  MockSTTProvider,
  LocalWhisperSTTProvider
};
