import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { initializebrowserAPI } from '@/features/tts/core/useBrowserAPI.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { ttsQueueManager } from '@/features/tts/services/TTSQueueManager.js';
import { offscreenRuntimeLeaseManager } from '@/shared/runtime/OffscreenRuntimeLeaseManager.js';

const logger = getScopedLogger(LOG_COMPONENTS.TTS, 'TTSStateManager');

export class TTSStateManager {
  constructor() {
    this.currentTTSSender = null;
    this.currentTTSId = null;
    this.currentTTSRequest = null;
    this.pendingRequestKey = null;
    this.lastTTSText = null;
    this.lastTTSLanguage = null;
    this.currentPlaybackToken = null;
    this.predecessorPlaybackToken = null;
    this.pendingPlaybackToken = null;
    this.pendingPlaybackMetadata = null;
    // Physical handoff boundary flag: true once the pending successor's
    // PLAY command has been issued/accepted by the offscreen runtime. Until
    // that point, the committed predecessor is safe to preserve; after that
    // point, the predecessor may already be physically interrupted by
    // offscreen's createPlayback() and must be terminalized via the same
    // path as failPlaybackHandoff. Token-fenced via pendingPlaybackToken.
    this.pendingPlaybackStarted = false;
    this.playbackRevision = 0;

    // Centralized audio reference for Firefox direct playback
    this.activeFirefoxAudio = null;
    this.activeFirefoxAudioUrl = null;
    this.firefoxAudioGeneration = 0;
  }

  /**
   * Play audio directly in Firefox.
   * Event callbacks are bound to one audio generation and element identity.
   */
  async playFirefoxAudio(audioBlobOrUrl, metadata = {}) {
    this.stopFirefoxAudio();
    this.currentTTSSender = metadata.sender || null;
    this.currentTTSId = metadata.ttsId || null;
    this.lastTTSLanguage = metadata.language || null;
    this.lastTTSText = metadata.text || null;
    const generation = this.firefoxAudioGeneration;

    return new Promise((resolve, reject) => {
      try {
        const url = typeof audioBlobOrUrl === 'string' 
          ? audioBlobOrUrl 
          : URL.createObjectURL(audioBlobOrUrl);
        
        this.activeFirefoxAudioUrl = url;
        const audio = new Audio(url);
        this.activeFirefoxAudio = audio;

        const isCurrentAudio = () =>
          this.activeFirefoxAudio === audio && this.firefoxAudioGeneration === generation;

        audio.onended = () => {
          if (!isCurrentAudio()) return;
          this.cleanupFirefoxAudio(audio, generation);
          this.notifyTTSEnded('completed');
        };

        audio.onerror = (e) => {
          if (isCurrentAudio()) {
            this.cleanupFirefoxAudio(audio, generation);
          }
          reject(e);
        };

        audio.play()
          .then(() => resolve())
          .catch((err) => {
            if (isCurrentAudio()) {
              this.cleanupFirefoxAudio(audio, generation);
            }
            reject(err);
          });
      } catch (error) {
        if (this.activeFirefoxAudio && this.firefoxAudioGeneration === generation) {
          this.cleanupFirefoxAudio(this.activeFirefoxAudio, generation);
        }
        reject(error);
      }
    });
  }

  /**
   * Stop any active Firefox audio
   */
  stopFirefoxAudio() {
    this.firefoxAudioGeneration++;
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
   * Internal cleanup for Firefox audio resources when callback still owns it.
   */
  cleanupFirefoxAudio(audio = this.activeFirefoxAudio, generation = this.firefoxAudioGeneration) {
    if (audio !== this.activeFirefoxAudio || generation !== this.firefoxAudioGeneration) {
      return false;
    }

    if (this.activeFirefoxAudioUrl && this.activeFirefoxAudioUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(this.activeFirefoxAudioUrl);
      } catch { /* ignore */ }
    }
    this.activeFirefoxAudio = null;
    this.activeFirefoxAudioUrl = null;
    return true;
  }

  /**
   * Clear pending request state without touching committed playback metadata.
   */
  resetSpeakState() {
    this.currentTTSRequest = null;
    this.pendingRequestKey = null;
  }

  /**
   * Build identity for one request still resolving before playback commit.
   * Active playback metadata remains separate and is changed only on commit.
   */
  createPendingRequestKey({ engine, text, language, ttsId = null } = {}) {
    return Object.freeze({
      engine,
      text,
      language,
      ...(ttsId === null || ttsId === undefined ? {} : { ttsId })
    });
  }

  isPendingRequest(key, request) {
    if (!key || !this.pendingRequestKey || !this.currentTTSRequest) return false;

    const sameKey = ['engine', 'text', 'language', 'ttsId'].every((field) => (
      (this.pendingRequestKey[field] ?? null) === (key[field] ?? null)
    ));

    return sameKey && (request === undefined || request === this.currentTTSRequest);
  }

  getPendingRequest(key) {
    return this.isPendingRequest(key) ? this.currentTTSRequest : null;
  }

  setPendingRequest(key, request) {
    this.pendingRequestKey = Object.freeze({ ...key });
    this.currentTTSRequest = request;
  }

  clearPendingRequest(key, request) {
    if (!this.isPendingRequest(key, request)) return false;

    this.pendingRequestKey = null;
    this.currentTTSRequest = null;
    return true;
  }

  /**
   * Check if a sender is the current owner of the active TTS session.
   * This is used for owner-aware cleanup.
   * 
   * @param {Object} sender - The message sender to check
   * @param {Object} [ownerSender] - Sender snapshot to check against; defaults to current owner
   * @returns {boolean} True if the sender matches the selected owner
   */
  isCurrentOwner(sender, ownerSender = this.currentTTSSender) {
    if (!ownerSender || !sender) return false;

    // 1. Internal Context Match (Popup/Sidepanel/Options)
    // Internal contexts often don't have a tab ID, so we check the URL
    if (!sender.tab?.id && !ownerSender.tab?.id) {
      return sender.url === ownerSender.url;
    }

    // 2. Tab/Frame Match (Content Scripts / FAB)
    return sender.tab?.id === ownerSender.tab?.id &&
           sender.frameId === ownerSender.frameId;
  }

  /**
   * Complete reset of all state
   */
  fullReset() {
    this.resetSpeakState();
    this.currentTTSSender = null;
    this.currentTTSId = null;
    this.lastTTSText = null;
    this.lastTTSLanguage = null;
    this.currentPlaybackToken = null;
    this.predecessorPlaybackToken = null;
    this.pendingPlaybackToken = null;
    this.pendingPlaybackMetadata = null;
    this.pendingPlaybackStarted = false;
    this.playbackRevision++;
  }

  /**
   * Capture notification metadata before any asynchronous operation.
   * Sender snapshots prevent a later handoff from changing an older message.
   */
  capturePlaybackMetadata() {
    return this.createMetadataSnapshot({
      sender: this.currentTTSSender,
      ttsId: this.currentTTSId,
      detectedSourceLanguage: this.lastTTSLanguage,
      text: this.lastTTSText
    });
  }

  createMetadataSnapshot(metadata = {}) {
    const sender = metadata.sender;
    const senderSnapshot = sender
      ? Object.freeze({
          ...sender,
          ...(sender.tab ? { tab: Object.freeze({ ...sender.tab }) } : {})
        })
      : null;

    return Object.freeze({
      sender: senderSnapshot,
      ttsId: metadata.ttsId || null,
      detectedSourceLanguage: metadata.detectedSourceLanguage || metadata.language || null,
      text: metadata.text || null
    });
  }

  normalizePlaybackMetadata(metadata = {}) {
    return {
      sender: metadata.sender || null,
      ttsId: metadata.ttsId || null,
      language: metadata.language || null,
      text: metadata.text || null
    };
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
   * @param {Object|null} [metadata] - Immutable sender and playback metadata snapshot
   */
  async broadcastStatus(status, data = {}, metadata = null) {
    try {
      const snapshot = metadata || this.capturePlaybackMetadata();
      const browserAPI = await initializebrowserAPI();
      const message = {
        action: data.action || MessageActions.GOOGLE_TTS_ENDED, // Allow custom action override
        source: 'background',
        status: status, // 'completed', 'error', 'stopped', 'interrupted'
        ttsId: snapshot.ttsId,
        detectedSourceLanguage: snapshot.detectedSourceLanguage,
        ...data
      };

      // 1. Targeted Tab Broadcast: Only send to the originating tab
      // This ensures all frames and Shadow DOM in THAT tab are updated.
      if (snapshot.sender?.tab?.id) {
        try {
          // Sending to tabId without frameId ensures ALL frames in that tab receive it
          await browserAPI.tabs.sendMessage(snapshot.sender.tab.id, message);
          logger.debug(`Targeted broadcast sent to tab: ${snapshot.sender.tab.id}`);
        } catch (err) {
          logger.debug('Targeted tab broadcast failed (tab might be closed):', err.message);
        }
      }

      // 2. Internal Context Broadcast: Always notify popup and sidepanel
      // This is efficient and keeps extension-wide UI in sync.
      await browserAPI.runtime.sendMessage(message).catch(() => {});
      
      logger.debug(`Broadcasted TTS status: ${status} for ID: ${snapshot.ttsId}`);
    } catch (err) {
      logger.debug('Broadcast failed:', err.message);
    }
  }

  /**
   * Notify the requester that TTS has ended
   * @param {string} reason - Completion reason
   * @param {Object|null} errorData - Additional error details
   * @param {string|null} playbackToken - Optional playback generation token
   */
  async notifyTTSEnded(reason = 'completed', errorData = null, playbackToken = null) {
    if (typeof errorData === 'string' && playbackToken === null) {
      playbackToken = errorData;
      errorData = null;
    }

    const hasPlaybackToken = playbackToken !== null && playbackToken !== undefined;
    const generationToken = hasPlaybackToken ? playbackToken : this.currentPlaybackToken;
    const notificationRevision = this.playbackRevision;
    const metadata = this.capturePlaybackMetadata();
    const hasPendingSuccessor = this.pendingPlaybackToken && this.pendingPlaybackToken !== playbackToken;
    if (hasPlaybackToken && (playbackToken !== this.currentPlaybackToken || hasPendingSuccessor)) {
      if (this.pendingPlaybackToken === playbackToken) {
        await this.failPlaybackHandoff(playbackToken, errorData || {
          error: `Playback ended before handoff commit (${reason})`
        });
        return;
      }
      await this.releaseOffscreenLease(playbackToken);
      return;
    }

    // CRITICAL: Check with QueueManager first. If there are more chunks, 
    // it will handle the next playback and we DON'T notify the UI yet.
    if (reason === 'completed' && ttsQueueManager.chunks.length > 0 && ttsQueueManager.currentIndex < ttsQueueManager.chunks.length - 1) {
      await ttsQueueManager.onChunkEnded('completed');
      await this.releaseOffscreenLease(generationToken);
      return;
    }

    const status = reason === 'error' ? 'error' : 'idle';

    // Always broadcast status for independent UI updates
    await this.broadcastStatus(status, {
      reason,
      playbackToken: generationToken,
      ...(errorData || {})
    }, metadata);

    try {
      if (this.playbackRevision === notificationRevision && metadata.sender) {
        const browserAPI = await initializebrowserAPI();
        const message = {
          action: MessageActions.GOOGLE_TTS_ENDED,
          source: 'background',
          reason: reason,
          status: status,
          ttsId: metadata.ttsId,
          detectedSourceLanguage: metadata.detectedSourceLanguage,
          playbackToken: generationToken,
          ...(errorData || {})
        };

        if (metadata.sender?.tab?.id) {
          // Send to the specific tab and frame that requested it
          const options = {};
          if (metadata.sender.frameId !== undefined) {
            options.frameId = metadata.sender.frameId;
          }
          
          await browserAPI.tabs.sendMessage(metadata.sender.tab.id, message, options);
        } else {
          await browserAPI.runtime.sendMessage({
            ...message,
            targetContext: 'popup-sidepanel'
          }).catch(() => {});
        }
        logger.debug(`Notified sender of TTS ${reason}`);
      }
    } catch (err) {
      logger.debug(`Could not notify sender (${reason}):`, err.message);
    } finally {
      if (reason !== 'interrupted') {
        const wasCurrent = this.currentPlaybackToken === generationToken;
        await this.releaseOffscreenLease(generationToken);
        if (wasCurrent && this.currentPlaybackToken === null && !this.pendingPlaybackToken) {
          this.currentTTSSender = null;
          this.currentTTSId = null;
        }
      }
    }
  }

  /**
   * Broadcast one terminal transition using already-captured metadata.
   * Used after stop/failure clears mutable playback state.
   */
  async notifyCapturedEnded(reason, errorData, playbackToken, metadata) {
    const status = reason === 'error' ? 'error' : 'idle';
    await this.broadcastStatus(status, {
      reason,
      playbackToken,
      ...(errorData || {})
    }, metadata);

    if (!metadata.sender) return;

    try {
      const browserAPI = await initializebrowserAPI();
      const message = {
        action: MessageActions.GOOGLE_TTS_ENDED,
        source: 'background',
        reason,
        status,
        ttsId: metadata.ttsId,
        detectedSourceLanguage: metadata.detectedSourceLanguage,
        playbackToken,
        ...(errorData || {})
      };

      if (metadata.sender.tab?.id) {
        const options = {};
        if (metadata.sender.frameId !== undefined) {
          options.frameId = metadata.sender.frameId;
        }
        await browserAPI.tabs.sendMessage(metadata.sender.tab.id, message, options);
      } else {
        await browserAPI.runtime.sendMessage({
          ...message,
          targetContext: 'popup-sidepanel'
        }).catch(() => {});
      }
    } catch (error) {
      logger.debug(`Could not notify sender (${reason}):`, error.message);
    }
  }

  /**
   * Notify one request about a pre-playback failure without touching playback ownership.
   *
   * @param {Object} request - Request-scoped notification data
   * @param {Object|null} request.sender - Request sender
   * @param {string|null} request.ttsId - Request identity
   * @param {string|null} request.language - Resolved or detected language
   * @param {string|null} request.text - Request text
   * @param {Error|Object|string} request.error - Failure details
   */
  async notifyTTSRequestError({ sender, ttsId, language, text, error } = {}) {
    try {
      const metadata = this.createMetadataSnapshot({ sender, ttsId, language, text });
      const errorData = {
        error: typeof error === 'string'
          ? error
          : error?.message || error?.error || 'TTS failed',
        ...(error?.errorType ? { errorType: error.errorType } : {})
      };
      const statusData = { reason: 'error', ...errorData };

      await this.broadcastStatus('error', statusData, metadata);
      if (!metadata.sender) return;

      const browserAPI = await initializebrowserAPI();
      const message = {
        action: MessageActions.GOOGLE_TTS_ENDED,
        source: 'background',
        reason: 'error',
        status: 'error',
        ttsId: metadata.ttsId,
        detectedSourceLanguage: metadata.detectedSourceLanguage,
        ...errorData
      };

      if (metadata.sender.tab?.id) {
        const options = {};
        if (metadata.sender.frameId !== undefined) {
          options.frameId = metadata.sender.frameId;
        }
        await browserAPI.tabs.sendMessage(metadata.sender.tab.id, message, options);
      } else {
        await browserAPI.runtime.sendMessage({
          ...message,
          targetContext: 'popup-sidepanel'
        }).catch(() => {});
      }
    } catch (notificationError) {
      logger.debug('Could not notify request-scoped TTS error:', notificationError?.message);
    }
  }

  /**
   * Start a Chromium playback generation and acquire its shared runtime lease.
   *
   * @returns {Promise<string>} Opaque token for this playback generation
   */
  async acquirePlaybackLease(metadata = {}) {
    const playbackToken = crypto.randomUUID();
    const previousPlaybackToken = this.currentPlaybackToken;
    this.pendingPlaybackToken = playbackToken;
    this.predecessorPlaybackToken = previousPlaybackToken;
    this.pendingPlaybackMetadata = this.normalizePlaybackMetadata(metadata);
    // A fresh pending generation has not yet issued its physical PLAY command;
    // the predecessor remains safe to preserve until that boundary is crossed.
    this.pendingPlaybackStarted = false;

    try {
      const acquired = await offscreenRuntimeLeaseManager.acquire({
        owner: 'tts',
        leaseId: playbackToken,
        requiredReasons: ['AUDIO_PLAYBACK']
      });
      if (!acquired) {
        throw new Error('Offscreen playback lease was not acquired');
      }
      return playbackToken;
    } catch (error) {
      if (this.pendingPlaybackToken === playbackToken) {
        this.pendingPlaybackToken = null;
        this.predecessorPlaybackToken = null;
        this.pendingPlaybackMetadata = null;
        this.pendingPlaybackStarted = false;
      }
      logger.error('Playback lease acquisition failed:', error);
      throw error;
    }
  }

  /**
   * Mark the pending successor as having crossed the physical handoff boundary:
   * the offscreen PLAY command for this generation has been issued/accepted,
   * and may already have interrupted the committed predecessor. Caller MUST
   * invoke this immediately before sending the successor PLAY message to
   * offscreen. Token-fenced: a stale token for a superseded pending generation
   * cannot mark a replacement.
   *
   * @param {string} playbackToken - The exact pending playback token issued by
   *   acquirePlaybackLease.
   * @returns {boolean} True when the flag was applied to the current pending.
   */
  markPendingPlaybackStarted(playbackToken) {
    if (!playbackToken) return false;
    if (this.pendingPlaybackToken !== playbackToken) return false;
    this.pendingPlaybackStarted = true;
    return true;
  }

  /**
   * Commit an acquired playback generation after its offscreen start succeeds.
   * The predecessor remains protected until this handoff completes.
   *
   * @param {string} playbackToken - Acquired playback generation token
   * @param {Object} metadata - Sender and language metadata committed atomically
   * @returns {Promise<boolean>} Whether handoff was committed
   */
  async commitPlaybackLease(playbackToken, metadata = {}) {
    if (this.pendingPlaybackToken !== playbackToken) {
      return false;
    }

    const predecessorPlaybackToken = this.predecessorPlaybackToken;
    const committedMetadata = {
      ...this.pendingPlaybackMetadata,
      ...(Object.keys(metadata).length ? this.normalizePlaybackMetadata(metadata) : {})
    };
    this.pendingPlaybackToken = null;
    this.predecessorPlaybackToken = null;
    this.pendingPlaybackMetadata = null;
    this.pendingPlaybackStarted = false;
    this.currentPlaybackToken = playbackToken;
    this.currentTTSSender = committedMetadata.sender;
    this.currentTTSId = committedMetadata.ttsId;
    this.lastTTSLanguage = committedMetadata.language;
    this.lastTTSText = committedMetadata.text;
    this.playbackRevision++;

    if (predecessorPlaybackToken && predecessorPlaybackToken !== playbackToken) {
      await this.releaseOffscreenLease(predecessorPlaybackToken);
    }

    return true;
  }

  /**
   * Terminalize failed handoff and any predecessor displaced by offscreen.
   * Once successor playback was attempted, predecessor state is unsafe to keep.
   */
  async failPlaybackHandoff(playbackToken, errorData = null) {
    if (!playbackToken) return false;

    const isPending = this.pendingPlaybackToken === playbackToken;
    const isCurrent = this.currentPlaybackToken === playbackToken;
    if (!isPending && !isCurrent) {
      await this.releaseOffscreenLease(playbackToken);
      return false;
    }

    const predecessorPlaybackToken = isPending ? this.predecessorPlaybackToken : null;
    const metadata = isPending && this.pendingPlaybackMetadata
      ? this.createMetadataSnapshot(this.pendingPlaybackMetadata)
      : this.capturePlaybackMetadata();
    const affectedTokens = [...new Set([
      playbackToken,
      predecessorPlaybackToken,
      isPending || isCurrent ? this.currentPlaybackToken : null
    ].filter(Boolean))];

    this.pendingPlaybackToken = null;
    this.predecessorPlaybackToken = null;
    this.pendingPlaybackMetadata = null;
    this.pendingPlaybackStarted = false;
    if (isPending || isCurrent || this.currentPlaybackToken === predecessorPlaybackToken) {
      this.currentPlaybackToken = null;
      this.currentTTSSender = null;
      this.currentTTSId = null;
      this.lastTTSLanguage = null;
      this.lastTTSText = null;
    }
    this.playbackRevision++;

    for (const token of affectedTokens) {
      await this.stopAudioOnly(token);
    }
    for (const token of affectedTokens) {
      await this.releaseOffscreenLease(token);
    }

    await this.notifyCapturedEnded('error', errorData || { error: 'TTS playback handoff failed' }, playbackToken, metadata);
    return true;
  }

  /**
   * Owner-aware stop with handoff awareness.
   * Decides which playback generation(s) to stop based on sender ownership.
   *
   * Pre-handoff state:
   *   - committed: currentPlaybackToken / currentTTSSender / currentTTSId
   *   - pending:   pendingPlaybackToken   / pendingPlaybackMetadata
   *   - predecessor token: predecessorPlaybackToken (== currentPlaybackToken during handoff)
   *
   * Same-session handoff note: `TTSQueueManager` reuses one request `ttsId`
   * across every chunk of a multi-chunk session. A chunk transition can
   * therefore produce a predecessor and a pending successor that share the
   * SAME `ttsId` (and often the same owner). For specific-`ttsId` Stops we
   * must consider BOTH generations before deciding what to stop — matching
   * pending first and stopping only the successor would leave a same-session
   * predecessor (and its remaining queue) alive, which is wrong.
   *
   * Behavior:
   *   - Specific ttsId (not 'all', not null/undefined): always fenced by ttsId.
   *       * matchesPending && matchesCurrent (same-session handoff):
   *           - stopOnlyIfOwner false/absent → existing global stopPlayback()
   *             (clears the queue and the whole session).
   *           - stopOnlyIfOwner true:
   *               · owns both   → stopPlayback() (exclusive-playback / queue clear).
   *               · owns only current → _stopPredecessorOnly()
   *                                     (queue-managed chunk still in flight
   *                                      is abandoned with the predecessor; the
   *                                      foreign pending is left intact).
   *               · owns only pending → _stopPendingOnly().
   *               · owns neither       → skipped (not_owner).
   *       * only one generation matches:
   *           - matchesCurrent only → if a successor is pending,
   *             _stopPredecessorOnly(); otherwise stopPlayback().
   *             Ownership check applies only when stopOnlyIfOwner is true.
   *           - matchesPending only → _stopPendingOnly(). Ownership check
   *             applies only when stopOnlyIfOwner is true.
   *       * neither generation matches → skipped (specific-ttsId fence); no
   *         playback affected, even when ownerless.
   *   - No specific ttsId (or 'all'):
   *       * stopOnlyIfOwner false/absent → delegates to existing global stopPlayback().
   *       * stopOnlyIfOwner true:
   *           - owns both pending and current (same owner) → full stop.
   *           - owns only current, no pending              → full stop.
   *           - owns only current, foreign successor pending → stops ONLY predecessor.
   *           - owns only pending, foreign current          → stops ONLY pending successor.
   *           - owns neither                                → skipped (not_owner).
   *
   * @param {Object} sender - Message sender
   * @param {Object} options
   * @param {string|null|undefined} [options.ttsId=null] - Specific ttsId; null/'all'/absent = stop-all
   * @param {boolean} [options.stopOnlyIfOwner=false] - Enforce ownership
   * @returns {Promise<Object>} { success, action, skipped?, reason?, playbackToken? }
   */
  async stopForOwner(sender, { ttsId = null, stopOnlyIfOwner = false } = {}) {
    const isSpecific = Boolean(ttsId && ttsId !== 'all');
    const hasPending = Boolean(this.pendingPlaybackToken);
    const pendingMetadata = this.pendingPlaybackMetadata;
    const currentSender = this.currentTTSSender;
    const currentTTSId = this.currentTTSId;

    if (isSpecific) {
      // Specific ttsId is ALWAYS fenced, regardless of stopOnlyIfOwner.
      // Compute both matches BEFORE deciding so a same-session handoff
      // (TTSQueueManager reuses one ttsId across chunks) cannot trick us
      // into stopping only the pending successor.
      const matchesPending = hasPending && pendingMetadata?.ttsId === ttsId;
      const matchesCurrent = currentTTSId === ttsId;

      if (matchesPending && matchesCurrent) {
        // Same-session handoff: predecessor + successor share this ttsId.
        if (!stopOnlyIfOwner) {
          // Ownerless specific Stop for the session: clear the whole session
          // and the queue via the existing global path.
          return this.stopPlayback();
        }
        const ownsPending = this.isCurrentOwner(sender, pendingMetadata?.sender ?? null);
        const ownsCurrent = this.isCurrentOwner(sender, currentSender);
        if (ownsPending && ownsCurrent) {
          return this.stopPlayback();
        }
        if (ownsCurrent) {
          return this._stopPredecessorOnly();
        }
        if (ownsPending) {
          return this._stopPendingOnly();
        }
        return { success: true, skipped: true, reason: 'not_owner' };
      }

      if (matchesPending) {
        if (stopOnlyIfOwner && !this.isCurrentOwner(sender, pendingMetadata?.sender ?? null)) {
          return { success: true, skipped: true, reason: 'not_owner' };
        }
        return this._stopPendingOnly();
      }

      if (matchesCurrent) {
        if (stopOnlyIfOwner && !this.isCurrentOwner(sender, currentSender)) {
          return { success: true, skipped: true, reason: 'not_owner' };
        }
        if (hasPending) {
          return this._stopPredecessorOnly();
        }
        // No pending successor: full stop is the existing behavior.
        return this.stopPlayback();
      }

      // Neither generation matches: do not stop anything, even when ownerless.
      return { success: true, skipped: true };
    }

    // ID-less / 'all' + no ownership gating: preserve existing global behavior.
    if (!stopOnlyIfOwner) {
      return this.stopPlayback();
    }

    // Owner-scoped stop-all: only generations owned by the sender are stopped.
    const ownsPending = hasPending
      && this.isCurrentOwner(sender, pendingMetadata?.sender ?? null);
    const ownsCurrent = this.isCurrentOwner(sender, currentSender);

    if (!ownsPending && !ownsCurrent) {
      return { success: true, skipped: true, reason: 'not_owner' };
    }

    // Same owner owns both generations: existing exclusive-playback semantic.
    if (ownsPending && ownsCurrent) {
      return this.stopPlayback();
    }

    if (ownsCurrent && !hasPending) {
      return this.stopPlayback();
    }

    if (ownsCurrent && hasPending) {
      return this._stopPredecessorOnly();
    }

    if (ownsPending && !ownsCurrent) {
      return this._stopPendingOnly();
    }

    // Unreachable given the guard above, but kept for exhaustive branching.
    return { success: true, skipped: true };
  }

  /**
   * Stop only the pending successor playback. Honors the physical handoff
   * boundary:
   *
   *   - If the pending PLAY command has NOT yet crossed into offscreen
   *     (`pendingPlaybackStarted === false`), the committed predecessor has
   *     not been physically interrupted and can be preserved as valid
   *     committed state.
   *   - If the pending PLAY command HAS already been issued/accepted
   *     (`pendingPlaybackStarted === true`), the predecessor may already be
   *     physically interrupted by offscreen. In that window the predecessor
   *     must be terminalized via the same handoff-failure invariant used by
   *     `failPlaybackHandoff` (it was displaced by the handoff, not explicitly
   *     stopped by the predecessor owner). The displaced predecessor receives
   *     a terminal notification with `reason: 'interrupted'` (not `'stopped'`),
   *     and it is never attributed to the successor owner.
   *
   * Cross-owner isolation is preserved: the foreign predecessor is never
   * marked as having been stopped by the successor owner.
   */
  async _stopPendingOnly() {
    const pendingToken = this.pendingPlaybackToken;
    const pendingMetaSnapshot = this.pendingPlaybackMetadata
      ? this.createMetadataSnapshot(this.pendingPlaybackMetadata)
      : null;
    const handoffAttempted = this.pendingPlaybackStarted;
    const displacedPredecessorToken = handoffAttempted ? this.currentPlaybackToken : null;
    // Capture the predecessor's owner-facing metadata BEFORE clearing
    // committed state, so the displaced predecessor's terminal notification
    // can be delivered to its original owner.
    const displacedPredecessorSnapshot = (handoffAttempted && this.currentTTSSender)
      ? this.capturePlaybackMetadata()
      : null;

    this.pendingPlaybackToken = null;
    this.predecessorPlaybackToken = null;
    this.pendingPlaybackMetadata = null;
    this.pendingPlaybackStarted = false;
    this.playbackRevision++;

    if (handoffAttempted) {
      // The pending PLAY already crossed into offscreen. The committed
      // predecessor may be physically interrupted; terminalize it through the
      // handoff-failure path and clear committed state. We do NOT claim the
      // successor owner explicitly stopped the predecessor; the predecessor's
      // terminal reason reflects a handoff displacement.
      this.currentPlaybackToken = null;
      this.currentTTSSender = null;
      this.currentTTSId = null;
      this.lastTTSLanguage = null;
      this.lastTTSText = null;

      await this.stopAudioOnly(displacedPredecessorToken);
      await this.releaseOffscreenLease(displacedPredecessorToken);
    }

    await this.stopAudioOnly(pendingToken);
    await this.releaseOffscreenLease(pendingToken);

    // Notify the displaced predecessor's original owner with `interrupted`
    // (NOT `stopped`). `interrupted` is already treated as terminal/idle by
    // existing UI semantics, so no new public status is required.
    if (displacedPredecessorSnapshot?.sender) {
      await this.notifyCapturedEnded(
        'interrupted',
        null,
        displacedPredecessorToken,
        displacedPredecessorSnapshot,
      );
    }

    if (pendingMetaSnapshot) {
      await this.notifyCapturedEnded('stopped', null, pendingToken, pendingMetaSnapshot);
    }

    return { success: true, action: 'stopped', playbackToken: pendingToken };
  }

  /**
   * Stop only the committed predecessor playback without affecting a pending
   * successor. Used when the requester owns the predecessor but a foreign
   * successor is pending. Invalidates current state synchronously before
   * yielding so the pending successor remains handoff-eligible.
   *
   * NOTE: `currentTTSRequest` / `pendingRequestKey` are intentionally NOT
   * cleared: during a handoff they may still represent the in-flight successor
   * request, and clearing them would corrupt its deduplication/fencing.
   */
  async _stopPredecessorOnly() {
    const predecessorToken = this.currentPlaybackToken;
    const predecessorMetaSnapshot = this.capturePlaybackMetadata();

    this.currentPlaybackToken = null;
    this.currentTTSSender = null;
    this.currentTTSId = null;
    this.lastTTSLanguage = null;
    this.lastTTSText = null;
    this.predecessorPlaybackToken = null;
    this.playbackRevision++;

    await this.stopAudioOnly(predecessorToken);
    await this.releaseOffscreenLease(predecessorToken);

    await this.notifyCapturedEnded('stopped', null, predecessorToken, predecessorMetaSnapshot);

    return { success: true, action: 'stopped', playbackToken: predecessorToken };
  }

  /**
   * Atomically stop current or pending playback.
   * Pending token wins so a late successor command remains rejected offscreen.
   */
  async stopPlayback() {
    const pendingPlaybackToken = this.pendingPlaybackToken;
    const currentPlaybackToken = this.currentPlaybackToken;
    const predecessorPlaybackToken = this.predecessorPlaybackToken;
    const stopToken = pendingPlaybackToken || currentPlaybackToken;
    const metadata = pendingPlaybackToken && this.pendingPlaybackMetadata
      ? this.createMetadataSnapshot(this.pendingPlaybackMetadata)
      : this.capturePlaybackMetadata();
    const affectedTokens = [...new Set([
      stopToken,
      pendingPlaybackToken,
      currentPlaybackToken,
      predecessorPlaybackToken
    ].filter(Boolean))];

    // Invalidate handoff synchronously before any stop message can yield.
    this.pendingPlaybackToken = null;
    this.predecessorPlaybackToken = null;
    this.pendingPlaybackMetadata = null;
    this.pendingPlaybackStarted = false;
    this.currentPlaybackToken = null;
    this.currentTTSSender = null;
    this.currentTTSId = null;
    this.lastTTSLanguage = null;
    this.lastTTSText = null;
    this.resetSpeakState();
    this.playbackRevision++;
    ttsQueueManager.stop();
    this.stopFirefoxAudio();

    // Stop selected pending generation first, then any still-physical predecessor.
    for (const token of affectedTokens) {
      await this.stopAudioOnly(token);
    }
    for (const token of affectedTokens) {
      await this.releaseOffscreenLease(token);
    }

    await this.notifyCapturedEnded('stopped', null, stopToken, metadata);
    return { success: true, action: 'stopped', playbackToken: stopToken };
  }

  /**
   * Release exact TTS offscreen runtime lease. Stale tokens remain releasable
   * after a service-worker restart without touching newer playback state.
   * @param {string} playbackToken - Playback generation lease identity
   */
  async releaseOffscreenLease(playbackToken) {
    if (!playbackToken) {
      return false;
    }

    try {
      const released = await offscreenRuntimeLeaseManager.release({
        owner: 'tts',
        leaseId: playbackToken
      });
      if (this.currentPlaybackToken === playbackToken) {
        this.currentPlaybackToken = null;
      }
      if (this.pendingPlaybackToken === playbackToken) {
        this.pendingPlaybackToken = null;
        this.predecessorPlaybackToken = null;
        // The pending generation's physical boundary is gone with its lease;
        // reset the flag so a later stopForOwner decision cannot read a stale
        // "physical handoff attempted" against a replacement token.
        this.pendingPlaybackStarted = false;
      } else if (this.predecessorPlaybackToken === playbackToken) {
        this.predecessorPlaybackToken = null;
      }
      return released;
    } catch (error) {
      logger.debug('Offscreen lease release failed:', error.message);
      return false;
    }
  }

  /**
   * Stop only the audio playback without closing the document
   */
  async stopAudioOnly(playbackToken = this.currentPlaybackToken) {
    try {
      const browserAPI = await initializebrowserAPI();
      if (await offscreenRuntimeLeaseManager.ensureDocument()) {
        const message = {
          action: MessageActions.TTS_STOP,
          target: 'offscreen'
        };
        if (playbackToken) message.playbackToken = playbackToken;
        await browserAPI.runtime.sendMessage(message);
        logger.debug('Sent stop command to offscreen document');
      }
    } catch { /* ignore */ }
  }
}

export const ttsStateManager = new TTSStateManager();
