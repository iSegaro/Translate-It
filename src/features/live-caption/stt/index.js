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
  StreamingAudioSource,
  STREAMING_AUDIO_FORMATS,
  STREAMING_AUDIO_SOURCE_STATES,
  normalizeStreamingAudioFormat,
  normalizeStreamingAudioChunk,
  createStreamingAudioChunk
} from './StreamingAudioSource.js';
import { MediaRecorderStreamingAudioSource } from '@/html/MediaRecorderStreamingAudioSource.js';
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
import { FasterWhisperStreamingProvider } from './providers/FasterWhisperStreamingProvider.js';

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
  StreamingAudioSource,
  STREAMING_AUDIO_FORMATS,
  STREAMING_AUDIO_SOURCE_STATES,
  normalizeStreamingAudioFormat,
  normalizeStreamingAudioChunk,
  createStreamingAudioChunk
} from './StreamingAudioSource.js';
export { MediaRecorderStreamingAudioSource } from '@/html/MediaRecorderStreamingAudioSource.js';
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
export { FasterWhisperStreamingProvider } from './providers/FasterWhisperStreamingProvider.js';

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
  StreamingAudioSource,
  STREAMING_AUDIO_FORMATS,
  STREAMING_AUDIO_SOURCE_STATES,
  normalizeStreamingAudioFormat,
  normalizeStreamingAudioChunk,
  createStreamingAudioChunk,
  MediaRecorderStreamingAudioSource,
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
  LocalWhisperSTTProvider,
  FasterWhisperStreamingProvider
};
