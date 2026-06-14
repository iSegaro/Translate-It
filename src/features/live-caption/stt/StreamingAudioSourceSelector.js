import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import {
  STREAMING_AUDIO_FORMATS
} from './StreamingAudioSource.js';
import { MediaRecorderStreamingAudioSource } from './MediaRecorderStreamingAudioSource.js';
import { AudioWorkletPcm16StreamingAudioSource } from './AudioWorkletPcm16StreamingAudioSource.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'StreamingAudioSourceSelector');

function normalizeProviderDefinition(providerDefinition = null) {
  if (!providerDefinition || typeof providerDefinition !== 'object' || Array.isArray(providerDefinition)) {
    return null;
  }

  const audioInputFormats = Array.isArray(providerDefinition.audioInputFormats)
    ? providerDefinition.audioInputFormats.filter((format) => typeof format === 'string' && format.trim().length > 0).map((format) => format.trim())
    : [];

  return Object.freeze({
    id: typeof providerDefinition.id === 'string' ? providerDefinition.id.trim() : null,
    mode: typeof providerDefinition.mode === 'string' ? providerDefinition.mode.trim() : null,
    executionLocation: typeof providerDefinition.executionLocation === 'string' ? providerDefinition.executionLocation.trim() : null,
    audioInputFormats: Object.freeze([...audioInputFormats]),
    preferredAudioInputFormat: typeof providerDefinition.preferredAudioInputFormat === 'string' && providerDefinition.preferredAudioInputFormat.trim().length > 0
      ? providerDefinition.preferredAudioInputFormat.trim()
      : null,
    fallbackAudioInputFormat: typeof providerDefinition.fallbackAudioInputFormat === 'string' && providerDefinition.fallbackAudioInputFormat.trim().length > 0
      ? providerDefinition.fallbackAudioInputFormat.trim()
      : null,
    supportsPartialResults: Boolean(providerDefinition.supportsPartialResults),
    supportsCorrections: Boolean(providerDefinition.supportsCorrections),
    supportsReconnect: Boolean(providerDefinition.supportsReconnect),
    requiresPersistentConnection: Boolean(providerDefinition.requiresPersistentConnection)
  });
}

function isAudioWorkletSupported(audioContext = null) {
  if (typeof globalThis.AudioWorkletNode !== 'function') {
    return false;
  }

  return Boolean(audioContext?.audioWorklet && typeof audioContext.audioWorklet.addModule === 'function');
}

function createMediaRecorderSource({ sourceId, onChunk, onError, onStateChange, logger: sourceLogger } = {}) {
  return new MediaRecorderStreamingAudioSource({
    sourceId,
    onChunk,
    onError,
    onStateChange,
    logger: sourceLogger
  });
}

function createAudioWorkletSource({
  sourceId,
  onChunk,
  onError,
  onStateChange,
  audioContextFactory,
  audioWorkletNodeFactory,
  audioWorkletModuleUrl,
  logger: sourceLogger
} = {}) {
  return new AudioWorkletPcm16StreamingAudioSource({
    sourceId,
    onChunk,
    onError,
    onStateChange,
    audioContextFactory,
    audioWorkletNodeFactory,
    audioWorkletModuleUrl,
    logger: sourceLogger
  });
}

export class StreamingAudioSourceSelector {
  constructor({
    mediaRecorderFactory = createMediaRecorderSource,
    audioWorkletFactory = createAudioWorkletSource,
    logger: sourceLogger = logger
  } = {}) {
    this.mediaRecorderFactory = typeof mediaRecorderFactory === 'function' ? mediaRecorderFactory : createMediaRecorderSource;
    this.audioWorkletFactory = typeof audioWorkletFactory === 'function' ? audioWorkletFactory : createAudioWorkletSource;
    this.logger = sourceLogger ?? logger;
  }

  select({
    providerDefinition = null,
    audioContext = null,
    callbacks = {},
    audioContextFactory = null,
    audioWorkletNodeFactory = null,
    audioWorkletModuleUrl = null,
    sourceId = null
  } = {}) {
    const normalizedProvider = normalizeProviderDefinition(providerDefinition);
    const canUseAudioWorklet = Boolean(
      normalizedProvider?.mode === 'streaming'
      && normalizedProvider.audioInputFormats.includes(STREAMING_AUDIO_FORMATS.PCM16_MONO_16KHZ)
      && isAudioWorkletSupported(audioContext)
    );

    const selectedAudioFormat = canUseAudioWorklet
      ? STREAMING_AUDIO_FORMATS.PCM16_MONO_16KHZ
      : STREAMING_AUDIO_FORMATS.WEBM_OPUS;

    const sourceType = canUseAudioWorklet ? 'audio_worklet_pcm16' : 'media_recorder_webm_opus';
    const factory = canUseAudioWorklet ? this.audioWorkletFactory : this.mediaRecorderFactory;
    const source = factory({
      sourceId: sourceId ?? sourceType,
      onChunk: callbacks.onChunk ?? null,
      onError: callbacks.onError ?? null,
      onStateChange: callbacks.onStateChange ?? null,
      audioContextFactory,
      audioWorkletNodeFactory,
      audioWorkletModuleUrl,
      logger: this.logger
    });

    if (!source || typeof source.start !== 'function' || typeof source.stop !== 'function') {
      throw new TypeError('StreamingAudioSourceSelector requires a valid streaming audio source implementation');
    }

    return Object.freeze({
      source,
      sourceType,
      selectedAudioFormat,
      audioInputFormats: normalizedProvider?.audioInputFormats ?? Object.freeze([]),
      preferredAudioInputFormat: normalizedProvider?.preferredAudioInputFormat ?? selectedAudioFormat,
      fallbackAudioInputFormat: normalizedProvider?.fallbackAudioInputFormat ?? STREAMING_AUDIO_FORMATS.WEBM_OPUS,
      canUseAudioWorklet,
      providerDefinition: normalizedProvider
    });
  }
}

export {
  normalizeProviderDefinition,
  isAudioWorkletSupported,
  createMediaRecorderSource,
  createAudioWorkletSource
};

export default StreamingAudioSourceSelector;
