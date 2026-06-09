import { LIVE_CAPTION_ACTIONS } from './constants/liveCaptionActions.js';
import { LIVE_CAPTION_SETTINGS_KEYS } from './constants/liveCaptionSettings.js';
import { LIVE_CAPTION_DEFAULTS } from './constants/liveCaptionDefaults.js';
import { LIVE_CAPTION_SESSION_STATES } from './constants/liveCaptionSessionStates.js';
import { useLiveCaptionStore } from './stores/liveCaption.js';
import { createLiveCaptionNotImplementedError, assertNotImplemented } from './core/contracts.js';
import { PageLiveCaptionSession } from './core/PageLiveCaptionSession.js';
import { VideoCaptionSession } from './core/VideoCaptionSession.js';
import { LiveCaptionSessionManager } from './core/LiveCaptionSessionManager.js';
import { BaseSTTProvider } from './stt/BaseSTTProvider.js';
import { LiveCaptionCache } from './cache/LiveCaptionCache.js';
import { LiveCaptionTranscriptRepository } from './cache/LiveCaptionTranscriptRepository.js';
import { LiveCaptionTranslationRepository } from './cache/LiveCaptionTranslationRepository.js';
import { LiveCaptionBackgroundController } from './background/LiveCaptionBackgroundController.js';
import { LiveCaptionContentController } from './content/LiveCaptionContentController.js';

export { LIVE_CAPTION_ACTIONS } from './constants/liveCaptionActions.js';
export { LIVE_CAPTION_SETTINGS_KEYS } from './constants/liveCaptionSettings.js';
export { LIVE_CAPTION_DEFAULTS } from './constants/liveCaptionDefaults.js';
export { LIVE_CAPTION_SESSION_STATES } from './constants/liveCaptionSessionStates.js';

export { useLiveCaptionStore } from './stores/liveCaption.js';

export { createLiveCaptionNotImplementedError, assertNotImplemented } from './core/contracts.js';
export { PageLiveCaptionSession } from './core/PageLiveCaptionSession.js';
export { VideoCaptionSession } from './core/VideoCaptionSession.js';
export { LiveCaptionSessionManager } from './core/LiveCaptionSessionManager.js';
export { BaseSTTProvider } from './stt/BaseSTTProvider.js';
export { LiveCaptionCache } from './cache/LiveCaptionCache.js';
export { LiveCaptionTranscriptRepository } from './cache/LiveCaptionTranscriptRepository.js';
export { LiveCaptionTranslationRepository } from './cache/LiveCaptionTranslationRepository.js';
export { LiveCaptionBackgroundController } from './background/LiveCaptionBackgroundController.js';
export { LiveCaptionContentController } from './content/LiveCaptionContentController.js';

export const LiveCaptionFeature = Object.freeze({
  actions: LIVE_CAPTION_ACTIONS,
  settings: LIVE_CAPTION_SETTINGS_KEYS,
  defaults: LIVE_CAPTION_DEFAULTS,
  states: LIVE_CAPTION_SESSION_STATES,
  store: useLiveCaptionStore,
  contracts: {
    createLiveCaptionNotImplementedError,
    assertNotImplemented,
    PageLiveCaptionSession,
    VideoCaptionSession,
    LiveCaptionSessionManager,
    BaseSTTProvider,
    LiveCaptionCache,
    LiveCaptionTranscriptRepository,
    LiveCaptionTranslationRepository,
    LiveCaptionBackgroundController,
    LiveCaptionContentController
  }
});

export default LiveCaptionFeature;
