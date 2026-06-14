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

function createDefaultAudioContextConstructorProvider() {
  return globalThis.AudioContext || globalThis.webkitAudioContext || null;
}

function createDefaultAudioWorkletSupportProbeFactory({
  audioContextConstructorProvider = createDefaultAudioContextConstructorProvider
} = {}) {
  return () => {
    const AudioContextCtor = audioContextConstructorProvider();

    if (typeof AudioContextCtor !== 'function') {
      return null;
    }

    try {
      return new AudioContextCtor({ latencyHint: 'interactive' });
    } catch {
      try {
        return new AudioContextCtor();
      } catch (error) {
        logger.debug('AudioWorklet support probe failed to create AudioContext', {
          error: error?.message ?? null
        });
        return null;
      }
    }
  };
}

function createDefaultAudioWorkletSupportDetector({
  audioWorkletSupportProbeFactory = createDefaultAudioWorkletSupportProbeFactory()
} = {}) {
  return ({
    audioContext = null,
    audioContextConstructorProvider = createDefaultAudioContextConstructorProvider,
    audioWorkletNodeCtor = globalThis.AudioWorkletNode ?? null
  } = {}) => {
    if (typeof audioWorkletNodeCtor !== 'function') {
      return false;
    }

    if (audioContext?.audioWorklet && typeof audioContext.audioWorklet.addModule === 'function') {
      return true;
    }

    const probeContext = audioWorkletSupportProbeFactory({
      audioContextConstructorProvider
    });

    if (!probeContext) {
      return false;
    }

    const supported = Boolean(probeContext.audioWorklet && typeof probeContext.audioWorklet.addModule === 'function');

    if (typeof probeContext.close === 'function') {
      try {
        void Promise.resolve(probeContext.close()).catch(() => {});
      } catch {
        // Best-effort probe cleanup.
      }
    }

    return supported;
  };
}

function isAudioWorkletSupported(audioContext = null, {
  audioContextConstructorProvider = createDefaultAudioContextConstructorProvider,
  audioWorkletSupportProbeFactory = createDefaultAudioWorkletSupportProbeFactory({
    audioContextConstructorProvider
  }),
  audioWorkletNodeCtor = globalThis.AudioWorkletNode ?? null
} = {}) {
  if (typeof audioWorkletNodeCtor !== 'function') {
    return false;
  }

  if (audioContext?.audioWorklet && typeof audioContext.audioWorklet.addModule === 'function') {
    return true;
  }

  const detector = createDefaultAudioWorkletSupportDetector({
    audioWorkletSupportProbeFactory
  });
  return detector({
    audioContext,
    audioContextConstructorProvider,
    audioWorkletNodeCtor
  });
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
    audioContextConstructorProvider = createDefaultAudioContextConstructorProvider,
    audioWorkletSupportProbeFactory = createDefaultAudioWorkletSupportProbeFactory({
      audioContextConstructorProvider
    }),
    audioWorkletSupportDetector = createDefaultAudioWorkletSupportDetector({
      audioWorkletSupportProbeFactory
    }),
    logger: sourceLogger = logger
  } = {}) {
    this.mediaRecorderFactory = typeof mediaRecorderFactory === 'function' ? mediaRecorderFactory : createMediaRecorderSource;
    this.audioWorkletFactory = typeof audioWorkletFactory === 'function' ? audioWorkletFactory : createAudioWorkletSource;
    this.audioContextConstructorProvider = typeof audioContextConstructorProvider === 'function'
      ? audioContextConstructorProvider
      : createDefaultAudioContextConstructorProvider;
    this.audioWorkletSupportProbeFactory = typeof audioWorkletSupportProbeFactory === 'function'
      ? audioWorkletSupportProbeFactory
      : createDefaultAudioWorkletSupportProbeFactory({
        audioContextConstructorProvider: this.audioContextConstructorProvider
      });
    this.audioWorkletSupportDetector = typeof audioWorkletSupportDetector === 'function'
      ? audioWorkletSupportDetector
      : createDefaultAudioWorkletSupportDetector({
        audioWorkletSupportProbeFactory: this.audioWorkletSupportProbeFactory
      });
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
      && this.audioWorkletSupportDetector({
        audioContext,
        audioContextConstructorProvider: this.audioContextConstructorProvider,
        audioWorkletSupportProbeFactory: this.audioWorkletSupportProbeFactory
      })
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
  createDefaultAudioContextConstructorProvider,
  createDefaultAudioWorkletSupportProbeFactory,
  createDefaultAudioWorkletSupportDetector,
  isAudioWorkletSupported,
  createMediaRecorderSource,
  createAudioWorkletSource
};

export default StreamingAudioSourceSelector;
