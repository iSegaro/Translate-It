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
    
    // Centralized audio reference for Firefox direct playback
    this.activeFirefoxAudio = null;
    this.activeFirefoxAudioUrl = null;
  }

  /**
   * Play audio directly in Firefox
   */
  async playFirefoxAudio(audioBlobOrUrl) {
    this.stopFirefoxAudio();

    return new Promise((resolve, reject) => {
      try {
        const url = typeof audioBlobOrUrl === 'string' 
          ? audioBlobOrUrl 
          : URL.createObjectURL(audioBlobOrUrl);
        
        this.activeFirefoxAudioUrl = url;
        const audio = new Audio(url);
        this.activeFirefoxAudio = audio;

        audio.onended = () => {
          this.cleanupFirefoxAudio();
          this.notifyTTSEnded('completed');
        };

        audio.onerror = (e) => {
          this.cleanupFirefoxAudio();
          reject(e);
        };

        audio.play()
          .then(() => resolve())
          .catch((err) => {
            this.cleanupFirefoxAudio();
            reject(err);
          });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop any active Firefox audio
   */
  stopFirefoxAudio() {
    if (this.activeFirefoxAudio) {
      try {
        this.activeFirefoxAudio.pause();
        this.activeFirefoxAudio.src = '';
      } catch (e) {
        logger.debug('Error stopping Firefox audio:', e.message);
      }
    }
    this.cleanupFirefoxAudio();
  }

  /**
   * Internal cleanup for Firefox audio resources
   */
  cleanupFirefoxAudio() {
    if (this.activeFirefoxAudioUrl && this.activeFirefoxAudioUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(this.activeFirefoxAudioUrl);
      } catch { /* ignore */ }
    }
    this.activeFirefoxAudio = null;
    this.activeFirefoxAudioUrl = null;
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
   * Broadcast TTS status to relevant extension contexts.
   * This uses a "Targeted Broadcast" approach:
   * 1. If initiated from a tab, only that tab receives the message (all frames/Shadow DOM).
   * 2. All internal contexts (popup, sidepanel) receive the message for global sync.
   * 
   * @param {string} status - The new TTS status ('idle', 'playing', 'error', etc.)
   * @param {Object} data - Additional data to include in the broadcast
   * @param {string} [data.action] - Optional action override (defaults to GOOGLE_TTS_ENDED)
   */
  async broadcastStatus(status, data = {}) {
    try {
      const browserAPI = await initializebrowserAPI();
      const message = {
        action: data.action || MessageActions.GOOGLE_TTS_ENDED, // Allow custom action override
        source: 'background',
        status: status, // 'completed', 'error', 'stopped', 'interrupted'
        ttsId: this.currentTTSId,
        detectedSourceLanguage: this.lastTTSLanguage,
        ...data
      };

      // 1. Targeted Tab Broadcast: Only send to the originating tab
      // This ensures all frames and Shadow DOM in THAT tab are updated.
      if (this.currentTTSSender?.tab?.id) {
        try {
          // Sending to tabId without frameId ensures ALL frames in that tab receive it
          await browserAPI.tabs.sendMessage(this.currentTTSSender.tab.id, message);
          logger.debug(`Targeted broadcast sent to tab: ${this.currentTTSSender.tab.id}`);
        } catch (err) {
          logger.debug('Targeted tab broadcast failed (tab might be closed):', err.message);
        }
      }

      // 2. Internal Context Broadcast: Always notify popup and sidepanel
      // This is efficient and keeps extension-wide UI in sync.
      await browserAPI.runtime.sendMessage(message).catch(() => {});
      
      logger.debug(`Broadcasted TTS status: ${status} for ID: ${this.currentTTSId}`);
    } catch (err) {
      logger.debug('Broadcast failed:', err.message);
    }
  }

  /**
   * Notify the requester that TTS has ended
   */
  async notifyTTSEnded(reason = 'completed', errorData = null) {
    const status = reason === 'error' ? 'error' : 'idle';
    
    // Always broadcast status for independent UI updates
    await this.broadcastStatus(status, { 
      reason, 
      ...(errorData || {}) 
    });

    if (!this.currentTTSSender) return;

    try {
      const browserAPI = await initializebrowserAPI();
      const message = {
        action: MessageActions.GOOGLE_TTS_ENDED,
        source: 'background',
        reason: reason,
        status: status,
        ttsId: this.currentTTSId,
        detectedSourceLanguage: this.lastTTSLanguage,
        ...(errorData || {})
      };

      if (this.currentTTSSender?.tab?.id) {
        // Send to the specific tab and frame that requested it
        const options = {};
        if (this.currentTTSSender.frameId !== undefined) {
          options.frameId = this.currentTTSSender.frameId;
        }
        
        await browserAPI.tabs.sendMessage(this.currentTTSSender.tab.id, message, options);
      } else {
        await browserAPI.runtime.sendMessage({
          ...message,
          targetContext: 'popup-sidepanel'
        }).catch(() => {});
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
    } catch { /* ignore */ } finally {
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
    } catch { /* ignore */ }
  }
}

export const ttsStateManager = new TTSStateManager();
