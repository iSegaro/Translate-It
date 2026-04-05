import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { initializebrowserAPI } from '@/features/tts/core/useBrowserAPI.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { TTS_ENGINES } from '@/shared/config/constants.js';
import { PROVIDER_CONFIGS } from '@/features/tts/constants/ttsProviders.js';

const logger = getScopedLogger(LOG_COMPONENTS.TTS, 'TTSStateManager');

class TTSStateManager {
  constructor() {
    this.currentTTSSender = null;
    this.currentTTSId = null;
    this.currentTTSRequest = null;
    this.offscreenDocumentPromise = null;
    this.lastTTSText = null;
    this.lastTTSLanguage = null;
  }

  /**
   * Reset the speak-related state
   */
  resetSpeakState() {
    this.currentTTSRequest = null;
    this.lastTTSText = null;
    this.lastTTSLanguage = null;
  }

  /**
   * Complete reset of all state
   */
  fullReset() {
    this.resetSpeakState();
    this.currentTTSSender = null;
    this.currentTTSId = null;
  }

  /**
   * Notify the requester that TTS has ended
   */
  async notifyTTSEnded(reason = 'completed') {
    if (!this.currentTTSSender) return;

    try {
      const browserAPI = await initializebrowserAPI();
      const message = {
        action: MessageActions.GOOGLE_TTS_ENDED,
        source: 'background',
        reason: reason,
        ttsId: this.currentTTSId
      };

      if (this.currentTTSSender.tab?.id) {
        await browserAPI.tabs.sendMessage(this.currentTTSSender.tab.id, {
          ...message,
          targetFrameId: this.currentTTSSender.frameId
        });
      } else {
        await browserAPI.runtime.sendMessage({
          ...message,
          targetContext: 'popup-sidepanel'
        });
      }
      logger.debug(`Notified sender of TTS ${reason}`);
    } catch (err) {
      logger.debug(`Could not notify sender (${reason}):`, err.message);
    } finally {
      if (reason !== 'interrupted') {
        this.currentTTSSender = null;
        this.currentTTSId = null;
      }
    }
  }

  /**
   * Ensure offscreen document is open
   */
  async ensureOffscreenDocument() {
    const browserAPI = await initializebrowserAPI();
    
    if (!browserAPI.offscreen) return;

    try {
      // Check if we need to reset the promise
      if (this.offscreenDocumentPromise) {
        const hasDoc = await browserAPI.offscreen.hasDocument();
        if (!hasDoc) this.offscreenDocumentPromise = null;
      }

      if (!this.offscreenDocumentPromise) {
        logger.debug('Creating new offscreen document...');
        this.offscreenDocumentPromise = browserAPI.offscreen.createDocument({
          url: PROVIDER_CONFIGS[TTS_ENGINES.GOOGLE].offscreenPath,
          reasons: ['AUDIO_PLAYBACK'],
          justification: 'TTS Audio Playback'
        });
      }

      return await this.offscreenDocumentPromise;
    } catch (error) {
      logger.error('Offscreen setup failed:', error);
      this.offscreenDocumentPromise = null;
      throw error;
    }
  }

  /**
   * Close offscreen document
   */
  async closeOffscreenDocument() {
    try {
      const browserAPI = await initializebrowserAPI();
      if (browserAPI.offscreen && await browserAPI.offscreen.hasDocument()) {
        await browserAPI.offscreen.closeDocument();
      }
    } catch (e) {
      logger.debug('Error closing offscreen:', e.message);
    } finally {
      this.offscreenDocumentPromise = null;
    }
  }

  /**
   * Stop only the audio playback without closing the document
   */
  async stopAudioOnly() {
    try {
      const browserAPI = await initializebrowserAPI();
      if (browserAPI.offscreen && await browserAPI.offscreen.hasDocument()) {
        await browserAPI.runtime.sendMessage({
          action: MessageActions.TTS_STOP,
          target: 'offscreen'
        });
        logger.debug('Sent stop command to offscreen document');
      }
    } catch (e) {
      logger.debug('Failed to send stop command to offscreen:', e.message);
    }
  }
}

export const ttsStateManager = new TTSStateManager();
