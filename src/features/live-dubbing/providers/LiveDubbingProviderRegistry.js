import {
  LIVE_DUBBING_AUDIO_MODES,
  LIVE_DUBBING_OPENAI_PROVIDER_ID,
  LIVE_DUBBING_PROVIDER_ID,
} from '../constants.js';
import { isLiveDubbingAudioMode } from '../contracts.js';
import { GeminiLiveProviderAdapter } from './GeminiLiveProviderAdapter.js';
import { OpenAIRealtimeProviderAdapter } from './OpenAIRealtimeProviderAdapter.js';

const PROVIDER_DEFINITIONS = Object.freeze({
  [LIVE_DUBBING_PROVIDER_ID]: Object.freeze({
    audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
    create: (options) => new GeminiLiveProviderAdapter(options),
  }),
  [LIVE_DUBBING_OPENAI_PROVIDER_ID]: Object.freeze({
    audioMode: LIVE_DUBBING_AUDIO_MODES.MEDIA_STREAM,
    create: (options) => new OpenAIRealtimeProviderAdapter(options),
  }),
});

/**
 * Creates the feature-local provider adapter selected by the background
 * descriptor. Null only for an unknown provider, a malformed definition,
 * or an unsupported audio mode. Factory exceptions propagate to the
 * Controller error boundary — the same semantics as a throwing adapter
 * constructor.
 */
export class LiveDubbingProviderRegistry {
  constructor(definitions = PROVIDER_DEFINITIONS) {
    this.definitions = definitions;
  }

  create(providerId, options = {}) {
    const definition = this._definitionFor(providerId);
    if (!definition) return null;
    return definition.create(options) || null;
  }

  /**
   * The declared audio path for a provider (`pcm` or `media-stream`),
   * or null when the provider or its mode is unsupported. The controller
   * resolves the mode only through this method — never by inspecting
   * client methods and never by provider id.
   */
  getAudioMode(providerId) {
    const definition = this._definitionFor(providerId);
    return definition ? definition.audioMode : null;
  }

  _definitionFor(providerId) {
    const definition = this.definitions?.[providerId];
    if (!definition || typeof definition.create !== 'function'
      || !isLiveDubbingAudioMode(definition.audioMode)) {
      return null;
    }
    return definition;
  }
}

export const liveDubbingProviderRegistry = new LiveDubbingProviderRegistry();
